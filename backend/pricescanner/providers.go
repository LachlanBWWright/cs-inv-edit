package pricescanner

import (
	"context"
	"encoding/json"
	"fmt"
	"math"
	"net/http"
	"net/url"
	"strconv"
	"strings"
	"sync"
	"time"
)

type SteamProvider struct {
	Client  HTTPDoer
	BaseURL string
	AppID   int
}

func NewSteamProvider(client HTTPDoer) *SteamProvider {
	return &SteamProvider{Client: client, BaseURL: "https://steamcommunity.com/market/priceoverview/", AppID: 730}
}
func (*SteamProvider) ID() string { return "steam" }
func (p *SteamProvider) Scan(ctx context.Context, query Query) ([]Quote, error) {
	client := p.Client
	if client == nil {
		client = &http.Client{Timeout: 15 * time.Second}
	}
	var quotes []Quote
	for _, name := range query.MarketNames {
		appID := query.AppID
		if appID == 0 {
			appID = p.AppID
		}
		params := url.Values{"appid": {strconv.Itoa(appID)}, "currency": {steamCurrency(query.Currency)}, "market_hash_name": {name}}
		var payload struct {
			Success bool   `json:"success"`
			Lowest  string `json:"lowest_price"`
			Median  string `json:"median_price"`
			Volume  string `json:"volume"`
		}
		if err := getJSON(ctx, client, p.BaseURL+"?"+params.Encode(), map[string]string{"Accept": "application/json"}, &payload); err != nil {
			// Keep quotes already resolved in this batch. The Community Market
			// endpoint can rate-limit or reject an individual item without making
			// the successful responses for the other requested items invalid.
			return quotes, fmt.Errorf("%s: %w", name, err)
		}
		if !payload.Success {
			continue
		}
		displayPrice := payload.Lowest
		if displayPrice == "" {
			// Steam omits lowest_price for some active CS2 listings while still
			// returning a useful median_price and volume.
			displayPrice = payload.Median
		}
		if displayPrice == "" {
			continue
		}
		count := parseCount(payload.Volume)
		quotes = append(quotes, Quote{Source: p.ID(), MarketName: name, Currency: query.Currency, AmountMinor: parseFormattedMinor(displayPrice), DisplayPrice: displayPrice, ListingCount: count, URL: "https://steamcommunity.com/market/listings/" + strconv.Itoa(appID) + "/" + url.PathEscape(name), ObservedAt: nowRFC3339()})
	}
	return quotes, nil
}

type SkinportProvider struct {
	Client  HTTPDoer
	BaseURL string
	mu      sync.Mutex
	cache   map[string]skinportCache
}
type skinportItem struct {
	Name     string   `json:"market_hash_name"`
	Currency string   `json:"currency"`
	Min      *float64 `json:"min_price"`
	Quantity int      `json:"quantity"`
	Page     string   `json:"item_page"`
}
type skinportCache struct {
	items   []skinportItem
	expires time.Time
}

func NewSkinportProvider(client HTTPDoer) *SkinportProvider {
	return &SkinportProvider{Client: client, BaseURL: "https://api.skinport.com/v1/items"}
}
func (*SkinportProvider) ID() string { return "skinport" }
func (p *SkinportProvider) Scan(ctx context.Context, query Query) ([]Quote, error) {
	if query.AppID != 0 && query.AppID != 730 && query.AppID != 440 && query.AppID != 570 {
		return []Quote{}, nil
	}
	client := p.Client
	if client == nil {
		client = &http.Client{Timeout: 20 * time.Second}
	}
	appID := query.AppID
	if appID == 0 {
		appID = 730
	}
	cacheKey := strconv.Itoa(appID) + ":" + query.Currency
	params := url.Values{"app_id": {strconv.Itoa(appID)}, "currency": {query.Currency}, "tradable": {"1"}}
	p.mu.Lock()
	cached, ok := p.cache[cacheKey]
	p.mu.Unlock()
	items := cached.items
	if !ok || time.Now().After(cached.expires) {
		if err := getJSON(ctx, client, p.BaseURL+"?"+params.Encode(), map[string]string{"Accept-Encoding": "br"}, &items); err != nil {
			return nil, err
		}
		p.mu.Lock()
		if p.cache == nil {
			p.cache = make(map[string]skinportCache)
		}
		p.cache[cacheKey] = skinportCache{items: items, expires: time.Now().Add(5 * time.Minute)}
		p.mu.Unlock()
	}
	wanted := make(map[string]bool, len(query.MarketNames))
	for _, name := range query.MarketNames {
		wanted[name] = true
	}
	quotes := make([]Quote, 0, len(query.MarketNames))
	for _, item := range items {
		if wanted[item.Name] && item.Min != nil {
			amount := int64(math.Round(*item.Min * 100))
			count := item.Quantity
			quotes = append(quotes, Quote{Source: p.ID(), MarketName: item.Name, Currency: strings.ToUpper(item.Currency), AmountMinor: &amount, DisplayPrice: formatMinor(amount, item.Currency), ListingCount: &count, URL: item.Page, ObservedAt: nowRFC3339()})
		}
	}
	return quotes, nil
}

type CSFloatProvider struct {
	Client          HTTPDoer
	BaseURL, APIKey string
}

type csfloatListing struct {
	ID    string `json:"id"`
	Price int64  `json:"price"`
}
type csfloatListings []csfloatListing

func (listings *csfloatListings) UnmarshalJSON(data []byte) error {
	var direct []csfloatListing
	if err := json.Unmarshal(data, &direct); err == nil {
		*listings = direct
		return nil
	}
	var envelope struct {
		Data []csfloatListing `json:"data"`
	}
	if err := json.Unmarshal(data, &envelope); err != nil {
		return err
	}
	*listings = envelope.Data
	return nil
}

func NewCSFloatProvider(client HTTPDoer, apiKey string) *CSFloatProvider {
	return &CSFloatProvider{Client: client, BaseURL: "https://csfloat.com/api/v1/listings", APIKey: apiKey}
}
func (*CSFloatProvider) ID() string { return "csfloat" }
func (p *CSFloatProvider) Scan(ctx context.Context, query Query) ([]Quote, error) {
	if query.AppID != 0 && query.AppID != 730 {
		return []Quote{}, nil
	}
	if query.Currency != "USD" {
		return nil, fmt.Errorf("CSFloat quotes are USD; requested %s (no exchange-rate conversion is performed)", query.Currency)
	}
	client := p.Client
	if client == nil {
		client = &http.Client{Timeout: 15 * time.Second}
	}
	quotes := make([]Quote, 0, len(query.MarketNames))
	for _, name := range query.MarketNames {
		params := url.Values{"market_hash_name": {name}, "type": {"buy_now"}, "sort_by": {"lowest_price"}, "limit": {"1"}}
		var payload csfloatListings
		headers := map[string]string{}
		if p.APIKey != "" {
			headers["Authorization"] = p.APIKey
		}
		if err := getJSON(ctx, client, p.BaseURL+"?"+params.Encode(), headers, &payload); err != nil {
			return nil, fmt.Errorf("%s: %w", name, err)
		}
		if len(payload) == 0 {
			continue
		}
		amount := payload[0].Price
		quotes = append(quotes, Quote{Source: p.ID(), MarketName: name, Currency: "USD", AmountMinor: &amount, DisplayPrice: formatMinor(amount, "USD"), URL: "https://csfloat.com/item/" + payload[0].ID, ObservedAt: nowRFC3339()})
	}
	return quotes, nil
}

type WaxpeerProvider struct {
	Client  HTTPDoer
	BaseURL string
}

type MarketNetProvider struct {
	Client  HTTPDoer
	BaseURL string
	Source  string
	AppID   int
	mu      sync.Mutex
	cache   map[string]marketCSGOCache
}

type marketCSGOItem struct {
	Name   string `json:"market_hash_name"`
	Volume string `json:"volume"`
	Price  string `json:"price"`
}

type marketCSGOCache struct {
	items   []marketCSGOItem
	expires time.Time
}

func NewMarketCSGOProvider(client HTTPDoer) *MarketNetProvider {
	return &MarketNetProvider{Client: client, BaseURL: "https://market.csgo.com/api/v2/prices", Source: "marketcsgo", AppID: 730}
}

func NewMarketDotaProvider(client HTTPDoer) *MarketNetProvider {
	return &MarketNetProvider{Client: client, BaseURL: "https://market.dota2.net/api/v2/prices", Source: "marketdota", AppID: 570}
}

func (p *MarketNetProvider) ID() string { return p.Source }

func (p *MarketNetProvider) Scan(ctx context.Context, query Query) ([]Quote, error) {
	if query.AppID != 0 && query.AppID != p.AppID {
		return []Quote{}, nil
	}
	if query.Currency != "USD" && query.Currency != "EUR" && query.Currency != "RUB" {
		return nil, fmt.Errorf("%s supports USD, EUR, and RUB; requested %s", p.ID(), query.Currency)
	}
	client := p.Client
	if client == nil {
		client = &http.Client{Timeout: 20 * time.Second}
	}
	p.mu.Lock()
	cached, ok := p.cache[query.Currency]
	p.mu.Unlock()
	items := cached.items
	if !ok || time.Now().After(cached.expires) {
		var payload struct {
			Success bool             `json:"success"`
			Items   []marketCSGOItem `json:"items"`
		}
		if err := getJSON(ctx, client, p.BaseURL+"/"+query.Currency+".json", nil, &payload); err != nil {
			return nil, err
		}
		if !payload.Success {
			return nil, fmt.Errorf("%s price catalogue request failed", p.ID())
		}
		items = payload.Items
		p.mu.Lock()
		if p.cache == nil {
			p.cache = make(map[string]marketCSGOCache)
		}
		p.cache[query.Currency] = marketCSGOCache{items: items, expires: time.Now().Add(5 * time.Minute)}
		p.mu.Unlock()
	}
	wanted := make(map[string]bool, len(query.MarketNames))
	for _, name := range query.MarketNames {
		wanted[name] = true
	}
	quotes := make([]Quote, 0, len(query.MarketNames))
	for _, item := range items {
		if !wanted[item.Name] {
			continue
		}
		amount := parseDecimalMinor(item.Price)
		if amount == nil {
			continue
		}
		quotes = append(quotes, Quote{Source: p.ID(), MarketName: item.Name, Currency: query.Currency, AmountMinor: amount, DisplayPrice: formatMinor(*amount, query.Currency), ListingCount: parseCount(item.Volume), ObservedAt: nowRFC3339()})
	}
	return quotes, nil
}

type waxpeerPrice struct {
	Name  string `json:"name"`
	Count int    `json:"count"`
	Min   int64  `json:"min"`
}

func NewWaxpeerProvider(client HTTPDoer) *WaxpeerProvider {
	return &WaxpeerProvider{Client: client, BaseURL: "https://api.waxpeer.com/v1/prices"}
}

func (*WaxpeerProvider) ID() string { return "waxpeer" }

func (p *WaxpeerProvider) Scan(ctx context.Context, query Query) ([]Quote, error) {
	if query.AppID != 0 && query.AppID != 730 && query.AppID != 440 {
		return []Quote{}, nil
	}
	if query.Currency != "USD" {
		return nil, fmt.Errorf("Waxpeer quotes are USD; requested %s (no exchange-rate conversion is performed)", query.Currency)
	}
	client := p.Client
	if client == nil {
		client = &http.Client{Timeout: 15 * time.Second}
	}
	quotes := make([]Quote, 0, len(query.MarketNames))
	game := "csgo"
	marketPath := "csgo"
	if query.AppID == 440 {
		game = "tf2"
		marketPath = "tf2"
	}
	for _, name := range query.MarketNames {
		params := url.Values{"game": {game}, "search": {name}, "minified": {"1"}}
		var payload struct {
			Success bool           `json:"success"`
			Items   []waxpeerPrice `json:"items"`
			Message string         `json:"msg"`
		}
		if err := getJSON(ctx, client, p.BaseURL+"?"+params.Encode(), nil, &payload); err != nil {
			return nil, fmt.Errorf("%s: %w", name, err)
		}
		if !payload.Success {
			return nil, fmt.Errorf("%s: Waxpeer request failed: %s", name, payload.Message)
		}
		for _, item := range payload.Items {
			if item.Name != name || item.Min <= 0 {
				continue
			}
			// Waxpeer prices use thousandths of USD (1000 = USD 1.00).
			amount := int64(math.Round(float64(item.Min) / 10))
			count := item.Count
			quotes = append(quotes, Quote{Source: p.ID(), MarketName: name, Currency: "USD", AmountMinor: &amount, DisplayPrice: formatMinor(amount, "USD"), ListingCount: &count, URL: "https://waxpeer.com/" + marketPath + "?search=" + url.QueryEscape(name), ObservedAt: nowRFC3339()})
			break
		}
	}
	return quotes, nil
}

type PriceDBProvider struct {
	Client  HTTPDoer
	BaseURL string
}

func NewPriceDBProvider(client HTTPDoer) *PriceDBProvider {
	return &PriceDBProvider{Client: client, BaseURL: "https://pricedb.io/api/search"}
}

func (*PriceDBProvider) ID() string { return "backpacktf" }

func (p *PriceDBProvider) Scan(ctx context.Context, query Query) ([]Quote, error) {
	if query.AppID != 440 {
		return []Quote{}, nil
	}
	client := p.Client
	if client == nil {
		client = &http.Client{Timeout: 15 * time.Second}
	}
	quotes := make([]Quote, 0, len(query.MarketNames))
	for _, name := range query.MarketNames {
		var payload struct {
			Success bool `json:"success"`
			Data    struct {
				Results []struct {
					Name   string `json:"name"`
					Source string `json:"source"`
					Buy    struct {
						Keys  float64 `json:"keys"`
						Metal float64 `json:"metal"`
					} `json:"buy"`
					Sell struct {
						Keys  float64 `json:"keys"`
						Metal float64 `json:"metal"`
					} `json:"sell"`
				} `json:"results"`
			} `json:"data"`
		}
		params := url.Values{"q": {name}}
		if err := getJSON(ctx, client, p.BaseURL+"?"+params.Encode(), nil, &payload); err != nil {
			return nil, fmt.Errorf("%s: %w", name, err)
		}
		if !payload.Success {
			return nil, fmt.Errorf("%s: PriceDB request failed", name)
		}
		for _, item := range payload.Data.Results {
			if item.Name != name || item.Source != "bptf" {
				continue
			}
			quotes = append(quotes, Quote{Source: p.ID(), MarketName: name, Currency: "TF2", DisplayPrice: formatTF2Range(item.Buy.Keys, item.Buy.Metal, item.Sell.Keys, item.Sell.Metal), ObservedAt: nowRFC3339()})
			break
		}
	}
	return quotes, nil
}

func formatTF2Range(buyKeys, buyMetal, sellKeys, sellMetal float64) string {
	format := func(keys, metal float64) string {
		parts := make([]string, 0, 2)
		if keys > 0 {
			parts = append(parts, strconv.FormatFloat(keys, 'f', -1, 64)+" keys")
		}
		if metal > 0 || len(parts) == 0 {
			parts = append(parts, strconv.FormatFloat(metal, 'f', -1, 64)+" ref")
		}
		return strings.Join(parts, " + ")
	}
	return format(buyKeys, buyMetal) + " – " + format(sellKeys, sellMetal)
}

func nowRFC3339() string { return time.Now().UTC().Format(time.RFC3339) }
func formatMinor(value int64, currency string) string {
	return strings.ToUpper(currency) + " " + strconv.FormatFloat(float64(value)/100, 'f', 2, 64)
}
func parseCount(value string) *int {
	value = strings.ReplaceAll(strings.ReplaceAll(value, ",", ""), ".", "")
	n, err := strconv.Atoi(value)
	if err != nil {
		return nil
	}
	return &n
}
func parseFormattedMinor(value string) *int64 {
	clean := strings.Map(func(r rune) rune {
		if r >= '0' && r <= '9' || r == '.' || r == ',' {
			return r
		}
		return -1
	}, value)
	lastDot, lastComma := strings.LastIndex(clean, "."), strings.LastIndex(clean, ",")
	decimal := lastDot
	if lastComma > decimal {
		decimal = lastComma
	}
	if decimal >= 0 && len(clean)-decimal-1 == 2 {
		clean = strings.ReplaceAll(strings.ReplaceAll(clean[:decimal], ".", ""), ",", "") + "." + clean[decimal+1:]
	} else {
		clean = strings.ReplaceAll(strings.ReplaceAll(clean, ".", ""), ",", "")
	}
	n, err := strconv.ParseFloat(clean, 64)
	if err != nil {
		return nil
	}
	minor := int64(math.Round(n * 100))
	return &minor
}
func parseDecimalMinor(value string) *int64 {
	n, err := strconv.ParseFloat(value, 64)
	if err != nil {
		return nil
	}
	minor := int64(math.Round(n * 100))
	return &minor
}
func steamCurrency(currency string) string {
	return map[string]string{"USD": "1", "GBP": "2", "EUR": "3", "CHF": "4", "RUB": "5", "PLN": "6", "BRL": "7", "JPY": "8", "NOK": "9", "IDR": "10", "MYR": "11", "PHP": "12", "SGD": "13", "THB": "14", "VND": "15", "KRW": "16", "TRY": "17", "UAH": "18", "MXN": "19", "CAD": "20", "AUD": "21", "NZD": "22", "CNY": "23", "INR": "24", "CLP": "25", "PEN": "26", "COP": "27", "ZAR": "28", "HKD": "29", "TWD": "30", "SAR": "31", "AED": "32", "SEK": "33", "ARS": "34", "ILS": "35", "BYN": "36", "KZT": "37", "KWD": "38", "QAR": "39", "CRC": "40", "UYU": "41"}[currency]
}
