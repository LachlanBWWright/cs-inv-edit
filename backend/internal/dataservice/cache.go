package dataservice

import (
	"context"
	"sort"
	"strconv"
	"strings"
	"sync"
	"time"

	"cs-inv-edit/backend/pricescanner"
)

type Scanner interface {
	Scan(context.Context, pricescanner.Query) (pricescanner.Result, error)
}

type cacheEntry struct {
	result     pricescanner.Result
	expiresAt  time.Time
	staleUntil time.Time
}

type inflight struct {
	done   chan struct{}
	result pricescanner.Result
	err    error
}

type PriceCache struct {
	mu      sync.Mutex
	scanner Scanner
	ttl     time.Duration
	now     func() time.Time
	entries map[string]cacheEntry
	active  map[string]*inflight
}

func NewPriceCache(scanner Scanner, ttl time.Duration) *PriceCache {
	if ttl <= 0 {
		ttl = 5 * time.Minute
	}
	return &PriceCache{
		scanner: scanner, ttl: ttl, now: time.Now,
		entries: make(map[string]cacheEntry), active: make(map[string]*inflight),
	}
}

func (c *PriceCache) Query(ctx context.Context, query pricescanner.Query) (pricescanner.Result, error) {
	key := cacheKey(query)
	now := c.now()
	c.mu.Lock()
	if cached, ok := c.entries[key]; ok && now.Before(cached.expiresAt) {
		c.mu.Unlock()
		return withCacheState(cached.result, query.MarketNames, "fresh"), nil
	}
	stale, hasStale := c.entries[key]
	if running, ok := c.active[key]; ok {
		c.mu.Unlock()
		select {
		case <-ctx.Done():
			return pricescanner.Result{}, ctx.Err()
		case <-running.done:
			return orderItems(running.result, query.MarketNames), running.err
		}
	}
	running := &inflight{done: make(chan struct{})}
	c.active[key] = running
	c.mu.Unlock()

	// Multipliers are caller presentation policy and must not affect canonical
	// observations shared between users.
	query.PriceMultipliers = nil
	result, err := c.scanner.Scan(ctx, query)
	c.mu.Lock()
	state := "fresh"
	if err == nil {
		freshUntil := c.now().Add(c.ttl)
		c.entries[key] = cacheEntry{result: result, expiresAt: freshUntil, staleUntil: freshUntil.Add(6 * c.ttl)}
	} else if hasStale && now.Before(stale.staleUntil) {
		result = stale.result
		result.Errors = append(result.Errors, pricescanner.ProviderError{Source: "data-service", Message: "refresh failed: " + err.Error()})
		err = nil
		state = "stale"
	}
	result.CacheState = state
	running.result, running.err = result, err
	delete(c.active, key)
	close(running.done)
	c.mu.Unlock()
	return withCacheState(result, query.MarketNames, state), err
}

func cacheKey(query pricescanner.Query) string {
	names := make([]string, 0, len(query.MarketNames))
	seen := make(map[string]bool, len(query.MarketNames))
	for _, name := range query.MarketNames {
		if trimmed := strings.TrimSpace(name); trimmed != "" && !seen[trimmed] {
			names = append(names, trimmed)
			seen[trimmed] = true
		}
	}
	sort.Strings(names)
	appID := query.AppID
	if appID == 0 {
		appID = 730
	}
	currency := strings.ToUpper(strings.TrimSpace(query.Currency))
	if currency == "" {
		currency = "USD"
	}
	return strings.Join([]string{strings.Join(names, "\x00"), currency, strconv.Itoa(appID)}, "\x01")
}

func orderItems(result pricescanner.Result, requested []string) pricescanner.Result {
	byName := make(map[string]pricescanner.ItemResult, len(result.Items))
	for _, item := range result.Items {
		byName[item.MarketName] = item
	}
	items := make([]pricescanner.ItemResult, 0, len(requested))
	seen := make(map[string]bool, len(requested))
	for _, name := range requested {
		name = strings.TrimSpace(name)
		if name == "" || seen[name] {
			continue
		}
		seen[name] = true
		if item, ok := byName[name]; ok {
			items = append(items, item)
		}
	}
	result.Items = items
	return result
}

func withCacheState(result pricescanner.Result, requested []string, state string) pricescanner.Result {
	result = orderItems(result, requested)
	result.CacheState = state
	return result
}
