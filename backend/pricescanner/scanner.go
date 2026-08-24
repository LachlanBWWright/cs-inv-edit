// Package pricescanner aggregates item prices from independent marketplace
// adapters. It deliberately has no dependency on the cs-inv-edit application,
// so it can be imported by other Go projects.
package pricescanner

import (
	"context"
	"fmt"
	"math"
	"sort"
	"strings"
	"sync"
	"time"
)

type Query struct {
	MarketNames      []string           `json:"marketNames"`
	Currency         string             `json:"currency"`
	AppID            int                `json:"appId,omitempty"`
	PriceMultipliers map[string]float64 `json:"priceMultipliers,omitempty"`
}

type Quote struct {
	Source               string  `json:"source"`
	MarketName           string  `json:"marketName"`
	Currency             string  `json:"currency"`
	AmountMinor          *int64  `json:"amountMinor,omitempty"`
	DisplayPrice         string  `json:"displayPrice"`
	PriceMultiplier      float64 `json:"priceMultiplier"`
	AdjustedAmountMinor  *int64  `json:"adjustedAmountMinor,omitempty"`
	AdjustedDisplayPrice string  `json:"adjustedDisplayPrice,omitempty"`
	ListingCount         *int    `json:"listingCount,omitempty"`
	URL                  string  `json:"url,omitempty"`
	ObservedAt           string  `json:"observedAt"`
}

type ItemResult struct {
	MarketName string  `json:"marketName"`
	Quotes     []Quote `json:"quotes"`
}

type ProviderError struct {
	Source  string `json:"source"`
	Message string `json:"message"`
}

type Result struct {
	Currency       string          `json:"currency"`
	BaselineSource string          `json:"baselineSource,omitempty"`
	Items          []ItemResult    `json:"items"`
	Listings       []Quote         `json:"listings"`
	Errors         []ProviderError `json:"errors"`
	ScannedAt      string          `json:"scannedAt"`
	ServedAt       string          `json:"servedAt,omitempty"`
	CacheState     string          `json:"cacheState,omitempty"`
}

type Provider interface {
	ID() string
	Scan(context.Context, Query) ([]Quote, error)
}

type SearchItem struct {
	MarketName string `json:"marketName"`
	Name       string `json:"name"`
	ImageURL   string `json:"imageUrl,omitempty"`
}

type SearchResult struct {
	Items []SearchItem `json:"items"`
}

type SearchProvider interface {
	Search(context.Context, string, int, int) (SearchResult, error)
}

type ValuationPolicy struct {
	BaselineSource string
	Multipliers    map[string]float64
}

type Scanner struct {
	providers []Provider
	policy    ValuationPolicy
}

func (s *Scanner) ProviderIDs() []string {
	ids := make([]string, 0, len(s.providers))
	for _, provider := range s.providers {
		ids = append(ids, provider.ID())
	}
	sort.Strings(ids)
	return ids
}

func (s *Scanner) Search(ctx context.Context, query string, appID int, limit int) (SearchResult, error) {
	for _, provider := range s.providers {
		if searcher, ok := provider.(SearchProvider); ok {
			return searcher.Search(ctx, query, appID, limit)
		}
	}
	return SearchResult{}, fmt.Errorf("no price search provider is configured")
}

func New(providers ...Provider) *Scanner {
	return NewWithValuationPolicy(ValuationPolicy{BaselineSource: "steam"}, providers...)
}

func NewWithValuationPolicy(policy ValuationPolicy, providers ...Provider) *Scanner {
	if strings.TrimSpace(policy.BaselineSource) == "" {
		policy.BaselineSource = "steam"
	}
	policy.BaselineSource = strings.ToLower(strings.TrimSpace(policy.BaselineSource))
	multipliers := make(map[string]float64, len(policy.Multipliers))
	for source, multiplier := range policy.Multipliers {
		source = strings.ToLower(strings.TrimSpace(source))
		multipliers[source] = multiplier
	}
	policy.Multipliers = multipliers
	return &Scanner{providers: append([]Provider(nil), providers...), policy: policy}
}

func (s *Scanner) Scan(ctx context.Context, query Query) (Result, error) {
	query.Currency = strings.ToUpper(strings.TrimSpace(query.Currency))
	normalizedMultipliers := make(map[string]float64, len(query.PriceMultipliers))
	for source, multiplier := range query.PriceMultipliers {
		normalizedMultipliers[strings.ToLower(strings.TrimSpace(source))] = multiplier
	}
	query.PriceMultipliers = normalizedMultipliers
	for source, multiplier := range s.policy.Multipliers {
		if strings.TrimSpace(source) == "" || multiplier <= 0 || math.IsNaN(multiplier) || math.IsInf(multiplier, 0) {
			return Result{}, fmt.Errorf("valuation multiplier for %q must be a finite number greater than zero", source)
		}
	}
	for source, multiplier := range query.PriceMultipliers {
		if strings.TrimSpace(source) == "" || multiplier <= 0 || math.IsNaN(multiplier) || math.IsInf(multiplier, 0) {
			return Result{}, fmt.Errorf("price multiplier for %q must be a finite number greater than zero", source)
		}
	}
	if query.Currency == "" {
		query.Currency = "USD"
	}
	if query.AppID == 0 {
		query.AppID = 730
	}
	query.MarketNames = uniqueNames(query.MarketNames)
	if len(query.MarketNames) == 0 {
		return Result{}, fmt.Errorf("at least one market name is required")
	}
	if len(query.MarketNames) > 100 {
		return Result{}, fmt.Errorf("at most 100 market names may be scanned at once")
	}
	result := Result{Currency: query.Currency, BaselineSource: s.policy.BaselineSource, Items: make([]ItemResult, len(query.MarketNames)), Listings: []Quote{}, Errors: []ProviderError{}, ScannedAt: time.Now().UTC().Format(time.RFC3339)}
	index := make(map[string]int, len(query.MarketNames))
	for i, name := range query.MarketNames {
		result.Items[i] = ItemResult{MarketName: name, Quotes: []Quote{}}
		index[name] = i
	}

	type response struct {
		id     string
		quotes []Quote
		err    error
	}
	responses := make(chan response, len(s.providers))
	var wait sync.WaitGroup
	for _, provider := range s.providers {
		wait.Add(1)
		go func(p Provider) {
			defer wait.Done()
			quotes, err := p.Scan(ctx, query)
			responses <- response{id: p.ID(), quotes: quotes, err: err}
		}(provider)
	}
	wait.Wait()
	close(responses)
	for response := range responses {
		if response.err != nil {
			result.Errors = append(result.Errors, ProviderError{Source: response.id, Message: response.err.Error()})
		}
		for _, quote := range response.quotes {
			quote = applyPriceMultiplier(quote, valuationMultipliers(s.policy, query.PriceMultipliers))
			if i, ok := index[quote.MarketName]; ok {
				result.Items[i].Quotes = append(result.Items[i].Quotes, quote)
				result.Listings = append(result.Listings, quote)
			}
		}
	}
	sort.SliceStable(result.Listings, func(i, j int) bool { return quoteLess(result.Listings[i], result.Listings[j]) })
	for i := range result.Items {
		sort.SliceStable(result.Items[i].Quotes, func(a, b int) bool {
			left, right := result.Items[i].Quotes[a], result.Items[i].Quotes[b]
			return quoteLess(left, right)
		})
	}
	sort.Slice(result.Errors, func(i, j int) bool { return result.Errors[i].Source < result.Errors[j].Source })
	return result, nil
}

func valuationMultipliers(policy ValuationPolicy, overrides map[string]float64) map[string]float64 {
	result := make(map[string]float64, len(policy.Multipliers)+len(overrides))
	for source, multiplier := range policy.Multipliers {
		result[source] = multiplier
	}
	for source, multiplier := range overrides {
		result[strings.ToLower(strings.TrimSpace(source))] = multiplier
	}
	result[policy.BaselineSource] = 1
	return result
}

func applyPriceMultiplier(quote Quote, multipliers map[string]float64) Quote {
	quote.PriceMultiplier = 1
	if multiplier, ok := multipliers[strings.ToLower(quote.Source)]; ok {
		quote.PriceMultiplier = multiplier
	}
	if quote.AmountMinor != nil {
		adjusted := int64(math.Round(float64(*quote.AmountMinor) * quote.PriceMultiplier))
		quote.AdjustedAmountMinor = &adjusted
		quote.AdjustedDisplayPrice = formatMinor(adjusted, quote.Currency)
	}
	return quote
}

func quoteLess(left, right Quote) bool {
	if left.Currency == right.Currency && left.AdjustedAmountMinor != nil && right.AdjustedAmountMinor != nil {
		return *left.AdjustedAmountMinor < *right.AdjustedAmountMinor
	}
	if left.MarketName != right.MarketName {
		return left.MarketName < right.MarketName
	}
	return left.Source < right.Source
}

func uniqueNames(names []string) []string {
	out, seen := make([]string, 0, len(names)), make(map[string]bool)
	for _, name := range names {
		name = strings.TrimSpace(name)
		if name != "" && !seen[name] {
			seen[name] = true
			out = append(out, name)
		}
	}
	return out
}
