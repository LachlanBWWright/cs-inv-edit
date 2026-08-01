package econ

import (
	"context"
	_ "embed"
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"net/url"
	"strings"
	"sync"
	"time"
)

func (p *Provider) LoadInventoryDescriptions(ctx context.Context, steamID string) (map[string]InventoryDescription, error) {
	if steamID == "" {
		return nil, nil
	}
	if p.client == nil {
		p.client = &http.Client{Timeout: 15 * time.Second}
	}
	out := make(map[string]InventoryDescription)
	startAssetID := ""
	for {
		page, err := p.fetchInventoryPage(ctx, steamID, startAssetID)
		if err != nil {
			return nil, err
		}
		descriptions := make(map[string]InventoryDescription, len(page.Descriptions))
		for _, desc := range page.Descriptions {
			key := desc.ClassID + "_" + desc.InstanceID
			descriptions[key] = InventoryDescription{
				ClassID:           desc.ClassID,
				InstanceID:        desc.InstanceID,
				Name:              desc.Name,
				MarketName:        desc.MarketName,
				MarketHashName:    desc.MarketHashName,
				IconURL:           steamIconURL(desc.IconURL),
				IconURLLarge:      steamIconURL(desc.IconURLLarge),
				Type:              desc.Type,
				Tradable:          desc.Tradable != 0,
				Marketable:        desc.Marketable != 0,
				AppliedItemImages: appliedItemImages(desc.Descriptions),
				TradableAfter:     tradableAfter(desc.Descriptions),
				InspectURL:        inventoryInspectURL(append(desc.Actions, desc.OwnerActions...)),
			}
		}
		for _, asset := range page.Assets {
			key := asset.ClassID + "_" + asset.InstanceID
			desc, ok := descriptions[key]
			if !ok {
				continue
			}
			desc.AssetID = asset.AssetID
			desc.InspectURL = expandInventoryInspectURL(desc.InspectURL, steamID, asset.AssetID)
			out[asset.AssetID] = desc
			for _, name := range []string{desc.MarketHashName, desc.MarketName, desc.Name} {
				for _, key := range inventoryDescriptionNameKeys(name) {
					if _, ambiguous := out["ambiguous:"+key]; ambiguous {
						continue
					}
					if existing, present := out[key]; !present || sameInventoryDescription(existing, desc) {
						out[key] = desc
					} else {
						// Ambiguous names must never be used as a fallback join.
						delete(out, key)
						out["ambiguous:"+key] = InventoryDescription{}
					}
				}
			}
		}
		if !page.MoreItems.Bool() || page.LastAssetID == "" {
			return out, nil
		}
		startAssetID = page.LastAssetID
	}
}

func inventoryDescriptionNameKey(name string) string {
	name = strings.ToLower(strings.TrimSpace(name))
	if name == "" {
		return ""
	}
	return "name:" + name
}

func inventoryDescriptionNameKeys(name string) []string {
	exact := inventoryDescriptionNameKey(name)
	if exact == "" {
		return nil
	}
	keys := []string{exact}
	normalized := strings.TrimSpace(name)
	if cut := strings.LastIndex(normalized, " ("); cut > 0 && strings.HasSuffix(normalized, ")") {
		base := inventoryDescriptionNameKey(normalized[:cut])
		if base != "" && base != exact {
			keys = append(keys, base)
		}
	}
	return keys
}

func sameInventoryDescription(a InventoryDescription, b InventoryDescription) bool {
	return a.ClassID == b.ClassID && a.InstanceID == b.InstanceID
}

func (p *Provider) LoadMarketDescriptions(ctx context.Context, marketNames []string) (map[string]MarketDescription, error) {
	return p.LoadMarketDescriptionsForApp(ctx, 730, marketNames)
}

func (p *Provider) LoadMarketDescriptionsForApp(ctx context.Context, appID uint32, marketNames []string) (map[string]MarketDescription, error) {
	if len(marketNames) == 0 {
		return nil, nil
	}
	if p.client == nil {
		p.client = &http.Client{Timeout: 15 * time.Second}
	}
	out := make(map[string]MarketDescription)
	var errs []string
	seen := make(map[string]bool)
	var unique []string
	for _, marketName := range marketNames {
		marketName = strings.TrimSpace(marketName)
		if marketName == "" || seen[marketName] {
			continue
		}
		seen[marketName] = true
		cacheKey := marketDescriptionCacheKey(appID, marketName)
		p.previewMu.Lock()
		cached, ok := p.previewCache[cacheKey]
		p.previewMu.Unlock()
		if ok {
			addMarketDescription(out, marketName, cached)
			continue
		}
		unique = append(unique, marketName)
	}
	var mu sync.Mutex
	var wait sync.WaitGroup
	workers := make(chan struct{}, 4)
	for _, marketName := range unique {
		wait.Add(1)
		go func(name string) {
			defer wait.Done()
			select {
			case workers <- struct{}{}:
			case <-ctx.Done():
				return
			}
			defer func() { <-workers }()
			desc, err := p.fetchMarketDescription(ctx, appID, name, false)
			mu.Lock()
			defer mu.Unlock()
			if err != nil {
				errs = append(errs, fmt.Sprintf("%s: %v", name, err))
				return
			}
			addMarketDescription(out, name, desc)
			p.previewMu.Lock()
			if p.previewCache == nil {
				p.previewCache = make(map[string]MarketDescription)
			}
			p.previewCache[marketDescriptionCacheKey(appID, name)] = desc
			p.previewMu.Unlock()
		}(marketName)
	}
	wait.Wait()
	if ctx.Err() != nil && len(out) == 0 {
		return out, fmt.Errorf("fetch Steam market descriptions: %w", ctx.Err())
	}
	if len(errs) > 0 && len(out) == 0 {
		return out, fmt.Errorf("fetch Steam market descriptions: %s", strings.Join(errs, "; "))
	}
	return out, nil
}

func marketDescriptionCacheKey(appID uint32, marketName string) string {
	return fmt.Sprintf("%d:%s", appID, marketName)
}

func addMarketDescription(out map[string]MarketDescription, requestedName string, desc MarketDescription) {
	if desc.IconURL == "" && desc.IconURLLarge == "" {
		return
	}
	for _, name := range []string{requestedName, desc.HashName, desc.MarketHashName, desc.MarketName} {
		if name != "" {
			out[name] = desc
		}
	}
}

func (p *Provider) LoadPreviewDescriptions(ctx context.Context, marketNames []string) (map[string]MarketDescription, error) {
	if p.client == nil {
		p.client = &http.Client{Timeout: 15 * time.Second}
	}
	out := make(map[string]MarketDescription)
	seen := make(map[string]bool)
	unique := make([]string, 0, len(marketNames))
	for _, marketName := range marketNames {
		marketName = strings.TrimSpace(marketName)
		if marketName == "" || seen[marketName] {
			continue
		}
		seen[marketName] = true
		p.previewMu.Lock()
		cached, ok := p.previewCache[marketDescriptionCacheKey(730, marketName)]
		p.previewMu.Unlock()
		if ok {
			out[marketName] = cached
			continue
		}
		unique = append(unique, marketName)
	}
	var mu sync.Mutex
	var wait sync.WaitGroup
	var errs []string
	// Steam's public market search throttles short high-concurrency bursts.
	// Keep this deliberately small; the session cache prevents repeat work.
	workers := make(chan struct{}, 3)
	for _, marketName := range unique {
		wait.Add(1)
		go func(name string) {
			defer wait.Done()
			select {
			case workers <- struct{}{}:
			case <-ctx.Done():
				return
			}
			defer func() { <-workers }()
			desc, err := p.fetchMarketDescription(ctx, 730, name, true)
			mu.Lock()
			defer mu.Unlock()
			if err != nil {
				errs = append(errs, fmt.Sprintf("%s: %v", name, err))
				return
			}
			out[name] = desc
			p.previewMu.Lock()
			if p.previewCache == nil {
				p.previewCache = make(map[string]MarketDescription)
			}
			p.previewCache[marketDescriptionCacheKey(730, name)] = desc
			p.previewMu.Unlock()
		}(marketName)
	}
	wait.Wait()
	if len(errs) > 0 {
		return out, fmt.Errorf("fetch Steam preview descriptions: %s", strings.Join(errs, "; "))
	}
	return out, nil
}

func (p *Provider) fetchMarketDescription(ctx context.Context, appID uint32, marketName string, allowExteriorVariant bool) (MarketDescription, error) {
	var errs []string
	for _, query := range marketSearchQueries(marketName) {
		desc, err := p.fetchMarketDescriptionQuery(ctx, appID, marketName, query, allowExteriorVariant)
		if err == nil {
			return desc, nil
		}
		errs = append(errs, fmt.Sprintf("%s: %v", query, err))
	}
	return MarketDescription{}, errors.New(strings.Join(errs, "; "))
}

func (p *Provider) fetchMarketDescriptionQuery(ctx context.Context, appID uint32, marketName string, query string, allowExteriorVariant bool) (MarketDescription, error) {
	var lastErr error
	for attempt := 0; attempt < 3; attempt++ {
		if attempt > 0 {
			delay := time.Duration(attempt*500) * time.Millisecond
			select {
			case <-time.After(delay):
			case <-ctx.Done():
				return MarketDescription{}, ctx.Err()
			}
		}
		description, err := p.fetchMarketDescriptionQueryOnce(ctx, appID, marketName, query, allowExteriorVariant)
		if err == nil {
			return description, nil
		}
		lastErr = err
		if !isTransientSteamMarketError(err) {
			break
		}
	}
	return MarketDescription{}, lastErr
}

func isTransientSteamMarketError(err error) bool {
	if err == nil {
		return false
	}
	message := strings.ToLower(err.Error())
	return strings.Contains(message, "http 429") || strings.Contains(message, "http 5") || strings.Contains(message, "timeout") || strings.Contains(message, "connection reset") || strings.Contains(message, "eof")
}

func (p *Provider) fetchMarketDescriptionQueryOnce(ctx context.Context, appID uint32, marketName string, query string, allowExteriorVariant bool) (MarketDescription, error) {
	values := url.Values{}
	values.Set("appid", fmt.Sprintf("%d", appID))
	values.Set("norender", "1")
	values.Set("count", "10")
	values.Set("query", query)
	endpoint := "https://steamcommunity.com/market/search/render/?" + values.Encode()
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, endpoint, nil)
	if err != nil {
		return MarketDescription{}, err
	}
	req.Header.Set("User-Agent", "Mozilla/5.0 (compatible; cs-inv-edit/0.0; Steam metadata lookup)")
	resp, err := p.client.Do(req)
	if err != nil {
		return MarketDescription{}, err
	}
	defer resp.Body.Close()
	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		return MarketDescription{}, fmt.Errorf("HTTP %d", resp.StatusCode)
	}
	var page marketSearchPage
	if err := json.NewDecoder(resp.Body).Decode(&page); err != nil {
		return MarketDescription{}, err
	}
	if !page.Success {
		return MarketDescription{}, fmt.Errorf("response was not successful")
	}
	var cheapestVariant *MarketDescription
	for _, result := range page.Results {
		desc := result.AssetDescription
		hashName := firstNonEmpty(result.HashName, desc.MarketHashName, desc.MarketName, result.Name)
		exactMatch := marketNameMatches(marketName, hashName) || marketNameMatches(marketName, desc.MarketName) || marketNameMatches(marketName, result.Name)
		variantMatch := allowExteriorVariant && strings.HasPrefix(strings.ToLower(hashName), strings.ToLower(strings.TrimSpace(marketName))+" (")
		if !exactMatch && !variantMatch {
			continue
		}
		price := MarketPrice{
			SellPrice:     result.SellPrice,
			SellPriceText: result.SellPriceText,
			SalePriceText: result.SalePriceText,
			SellListings:  result.SellListings,
		}
		candidate := MarketDescription{
			Name:           firstNonEmpty(desc.Name, result.Name),
			HashName:       result.HashName,
			MarketName:     desc.MarketName,
			MarketHashName: desc.MarketHashName,
			IconURL:        steamIconURL(desc.IconURL),
			IconURLLarge:   steamIconURL(desc.IconURLLarge),
			Type:           desc.Type,
			Price:          price,
		}
		if exactMatch {
			return candidate, nil
		}
		if cheapestVariant == nil || (result.SellPrice > 0 && (cheapestVariant.Price.SellPrice <= 0 || result.SellPrice < cheapestVariant.Price.SellPrice)) {
			candidate.Price.SellPriceText = "From " + candidate.Price.SellPriceText
			cheapestVariant = &candidate
		}
	}
	if cheapestVariant != nil {
		return *cheapestVariant, nil
	}
	return MarketDescription{}, fmt.Errorf("no exact market result")
}

func marketSearchQueries(marketName string) []string {
	marketName = strings.TrimSpace(marketName)
	queries := make([]string, 0, 2)
	if _, after, ok := strings.Cut(marketName, "|"); ok {
		unqualifiedName := strings.TrimSpace(after)
		if unqualifiedName != "" {
			queries = append(queries, unqualifiedName)
		}
	}
	if marketName != "" && !containsStringFold(queries, marketName) {
		queries = append(queries, marketName)
	}
	normalizedName := normalizeTF2MarketName(marketName)
	if normalizedName != "" && !containsStringFold(queries, normalizedName) {
		queries = append(queries, normalizedName)
	}
	return queries
}

func containsStringFold(values []string, target string) bool {
	for _, value := range values {
		if strings.EqualFold(strings.TrimSpace(value), strings.TrimSpace(target)) {
			return true
		}
	}
	return false
}

func (p *Provider) fetchInventoryPage(ctx context.Context, steamID string, startAssetID string) (inventoryPage, error) {
	values := url.Values{}
	values.Set("l", "english")
	values.Set("count", "5000")
	if startAssetID != "" {
		values.Set("start_assetid", startAssetID)
	}
	endpoint := fmt.Sprintf("https://steamcommunity.com/inventory/%s/730/2?%s", url.PathEscape(steamID), values.Encode())
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, endpoint, nil)
	if err != nil {
		return inventoryPage{}, err
	}
	resp, err := p.client.Do(req)
	if err != nil {
		return inventoryPage{}, fmt.Errorf("fetch Steam inventory descriptions: %w", err)
	}
	defer resp.Body.Close()
	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		return inventoryPage{}, fmt.Errorf("fetch Steam inventory descriptions returned HTTP %d", resp.StatusCode)
	}
	var page inventoryPage
	if err := json.NewDecoder(resp.Body).Decode(&page); err != nil {
		return inventoryPage{}, fmt.Errorf("decode Steam inventory descriptions: %w", err)
	}
	if !page.Success.Bool() {
		return inventoryPage{}, fmt.Errorf("Steam inventory descriptions response was not successful")
	}
	return page, nil
}
