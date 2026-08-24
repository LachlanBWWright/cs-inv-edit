package dataservice

import (
	"context"
	"errors"
	"path/filepath"
	"sync"
	"testing"
	"time"

	"cs-inv-edit/backend/pricescanner"
)

type countingScanner struct {
	mu    sync.Mutex
	calls int
	gate  chan struct{}
}

func TestJSONLObservationStoreFiltersAndLimitsHistory(t *testing.T) {
	store, err := NewJSONLObservationStore(filepath.Join(t.TempDir(), "prices.jsonl"))
	if err != nil {
		t.Fatal(err)
	}
	one, two := int64(100), int64(125)
	if err := store.Record(730, pricescanner.Result{BaselineSource: "steam", Listings: []pricescanner.Quote{
		{Source: "steam", MarketName: "Item", Currency: "USD", AmountMinor: &one, ObservedAt: "2026-01-01T00:00:00Z"},
		{Source: "steam", MarketName: "Item", Currency: "USD", AmountMinor: &two, ObservedAt: "2026-01-02T00:00:00Z"},
	}}); err != nil {
		t.Fatal(err)
	}
	observations, err := store.History(HistoryFilter{MarketName: "Item", AppID: 730, Currency: "USD", Source: "steam", Limit: 1})
	if err != nil {
		t.Fatal(err)
	}
	if len(observations) != 1 || observations[0].AmountMinor == nil || *observations[0].AmountMinor != 125 {
		t.Fatalf("observations=%#v", observations)
	}
}

func (s *countingScanner) Scan(context.Context, pricescanner.Query) (pricescanner.Result, error) {
	if s.gate != nil {
		<-s.gate
	}
	s.mu.Lock()
	s.calls++
	s.mu.Unlock()
	return pricescanner.Result{Currency: "USD", Items: []pricescanner.ItemResult{}, Listings: []pricescanner.Quote{}, Errors: []pricescanner.ProviderError{}, ScannedAt: "now"}, nil
}

func TestPriceCacheReusesFreshResult(t *testing.T) {
	scanner := &countingScanner{}
	cache := NewPriceCache(scanner, time.Minute)
	query := pricescanner.Query{MarketNames: []string{"Item"}, Currency: "usd", AppID: 730}
	if _, err := cache.Query(context.Background(), query); err != nil {
		t.Fatal(err)
	}
	if _, err := cache.Query(context.Background(), query); err != nil {
		t.Fatal(err)
	}
	if scanner.calls != 1 {
		t.Fatalf("calls=%d, want 1", scanner.calls)
	}
}

func TestCacheKeyIgnoresNameOrderAndMultipliers(t *testing.T) {
	left := pricescanner.Query{MarketNames: []string{"B", "A"}, Currency: "usd", AppID: 730, PriceMultipliers: map[string]float64{"steam": 0.8}}
	right := pricescanner.Query{MarketNames: []string{"A", "B"}, Currency: "USD", AppID: 730}
	if cacheKey(left) != cacheKey(right) {
		t.Fatal("equivalent canonical queries produced different cache keys")
	}
}

func TestPriceCacheRefreshesExpiredResult(t *testing.T) {
	scanner := &countingScanner{}
	cache := NewPriceCache(scanner, time.Minute)
	now := time.Date(2026, 1, 1, 0, 0, 0, 0, time.UTC)
	cache.now = func() time.Time { return now }
	query := pricescanner.Query{MarketNames: []string{"Item"}, Currency: "USD"}
	if _, err := cache.Query(context.Background(), query); err != nil {
		t.Fatal(err)
	}
	now = now.Add(2 * time.Minute)
	if _, err := cache.Query(context.Background(), query); err != nil {
		t.Fatal(err)
	}
	if scanner.calls != 2 {
		t.Fatalf("calls=%d, want 2", scanner.calls)
	}
}

func TestPriceCacheReturnsItemsInRequestOrder(t *testing.T) {
	scanner := scannerFunc(func(context.Context, pricescanner.Query) (pricescanner.Result, error) {
		return pricescanner.Result{Items: []pricescanner.ItemResult{{MarketName: "B"}, {MarketName: "A"}}}, nil
	})
	cache := NewPriceCache(scanner, time.Minute)
	if _, err := cache.Query(context.Background(), pricescanner.Query{MarketNames: []string{"B", "A"}}); err != nil {
		t.Fatal(err)
	}
	result, err := cache.Query(context.Background(), pricescanner.Query{MarketNames: []string{"A", "B"}})
	if err != nil {
		t.Fatal(err)
	}
	if len(result.Items) != 2 || result.Items[0].MarketName != "A" || result.Items[1].MarketName != "B" {
		t.Fatalf("items=%v, want A then B", result.Items)
	}
}

func TestPriceCacheServesExplicitStaleResultWhenRefreshFails(t *testing.T) {
	calls := 0
	scanner := scannerFunc(func(context.Context, pricescanner.Query) (pricescanner.Result, error) {
		calls++
		if calls > 1 {
			return pricescanner.Result{}, errors.New("provider unavailable")
		}
		return pricescanner.Result{Currency: "USD", Items: []pricescanner.ItemResult{{MarketName: "Item"}}, Errors: []pricescanner.ProviderError{}}, nil
	})
	cache := NewPriceCache(scanner, time.Minute)
	now := time.Date(2026, 1, 1, 0, 0, 0, 0, time.UTC)
	cache.now = func() time.Time { return now }
	query := pricescanner.Query{MarketNames: []string{"Item"}, Currency: "USD"}
	if _, err := cache.Query(context.Background(), query); err != nil {
		t.Fatal(err)
	}
	now = now.Add(2 * time.Minute)
	result, err := cache.Query(context.Background(), query)
	if err != nil {
		t.Fatal(err)
	}
	if result.CacheState != "stale" || len(result.Errors) != 1 {
		t.Fatalf("cacheState=%q errors=%v", result.CacheState, result.Errors)
	}
}

type scannerFunc func(context.Context, pricescanner.Query) (pricescanner.Result, error)

func (fn scannerFunc) Scan(ctx context.Context, query pricescanner.Query) (pricescanner.Result, error) {
	return fn(ctx, query)
}
