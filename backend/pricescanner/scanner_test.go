package pricescanner

import (
	"context"
	"errors"
	"fmt"
	"testing"
)

type stubProvider struct {
	id     string
	quotes []Quote
	err    error
}

func (p stubProvider) ID() string                                   { return p.id }
func (p stubProvider) Scan(context.Context, Query) ([]Quote, error) { return p.quotes, p.err }

func TestScannerAggregatesAndSortsWhileRetainingProviderFailures(t *testing.T) {
	high, low := int64(1500), int64(1200)
	scanner := New(
		stubProvider{id: "higher", quotes: []Quote{{Source: "higher", MarketName: "AK-47 | Redline (Field-Tested)", Currency: "USD", AmountMinor: &high}}},
		stubProvider{id: "lower", quotes: []Quote{{Source: "lower", MarketName: "AK-47 | Redline (Field-Tested)", Currency: "USD", AmountMinor: &low}}},
		stubProvider{id: "offline", err: errors.New("rate limited")},
	)
	result, err := scanner.Scan(context.Background(), Query{MarketNames: []string{" AK-47 | Redline (Field-Tested) ", "AK-47 | Redline (Field-Tested)"}, Currency: "usd", PriceMultipliers: map[string]float64{"HIGHER": 0.5}})
	if err != nil {
		t.Fatal(err)
	}
	if len(result.Items) != 1 || len(result.Items[0].Quotes) != 2 {
		t.Fatalf("unexpected result: %#v", result)
	}
	if result.Items[0].Quotes[0].Source != "higher" {
		t.Fatalf("quotes not sorted: %#v", result.Items[0].Quotes)
	}
	if len(result.Listings) != 2 || result.Listings[0].AdjustedAmountMinor == nil || *result.Listings[0].AdjustedAmountMinor != 750 || result.Listings[0].PriceMultiplier != 0.5 {
		t.Fatalf("combined listings=%#v", result.Listings)
	}
	if len(result.Errors) != 1 || result.Errors[0].Source != "offline" {
		t.Fatalf("provider failure missing: %#v", result.Errors)
	}
}

func TestScannerRetainsPartialQuotesAlongsideProviderFailure(t *testing.T) {
	amount := int64(42)
	scanner := New(stubProvider{id: "steam", quotes: []Quote{{Source: "steam", MarketName: "Item", Currency: "USD", AmountMinor: &amount, DisplayPrice: "$0.42"}}, err: fmt.Errorf("second item failed")})
	result, err := scanner.Scan(context.Background(), Query{MarketNames: []string{"Item"}, Currency: "USD", AppID: 753})
	if err != nil {
		t.Fatal(err)
	}
	if len(result.Items[0].Quotes) != 1 || len(result.Errors) != 1 {
		t.Fatalf("result=%#v", result)
	}
}

func TestScannerValidatesInput(t *testing.T) {
	if _, err := New().Scan(context.Background(), Query{}); err == nil {
		t.Fatal("expected empty query to fail")
	}
	if _, err := New().Scan(context.Background(), Query{MarketNames: []string{"Item"}, PriceMultipliers: map[string]float64{"steam": 0}}); err == nil {
		t.Fatal("expected invalid multiplier to fail")
	}
}

func TestParseFormattedMinor(t *testing.T) {
	for input, want := range map[string]int64{"$1,234.56": 123456, "1.234,56€": 123456, "0,42€": 42} {
		got := parseFormattedMinor(input)
		if got == nil || *got != want {
			t.Errorf("parseFormattedMinor(%q)=%v want %d", input, got, want)
		}
	}
}
