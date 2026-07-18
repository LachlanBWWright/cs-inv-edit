package pricescanner

import (
	"context"
	"io"
	"net/http"
	"strings"
	"testing"
)

type roundTripFunc func(*http.Request) (*http.Response, error)

func (f roundTripFunc) Do(request *http.Request) (*http.Response, error) { return f(request) }
func jsonResponse(body string) *http.Response {
	return &http.Response{StatusCode: 200, Body: io.NopCloser(strings.NewReader(body)), Header: make(http.Header)}
}

func TestSkinportProviderMatchesExactMarketNames(t *testing.T) {
	client := roundTripFunc(func(request *http.Request) (*http.Response, error) {
		if request.URL.Query().Get("currency") != "USD" {
			t.Fatalf("currency query = %q", request.URL.RawQuery)
		}
		return jsonResponse(`[{"market_hash_name":"Item A","currency":"USD","min_price":12.34,"quantity":5,"item_page":"https://example/item-a"},{"market_hash_name":"Other","currency":"USD","min_price":1}]`), nil
	})
	quotes, err := NewSkinportProvider(client).Scan(context.Background(), Query{MarketNames: []string{"Item A"}, Currency: "USD"})
	if err != nil {
		t.Fatal(err)
	}
	if len(quotes) != 1 || quotes[0].AmountMinor == nil || *quotes[0].AmountMinor != 1234 {
		t.Fatalf("quotes=%#v", quotes)
	}
}

func TestCSFloatProviderDoesNotSilentlyMixCurrencies(t *testing.T) {
	_, err := NewCSFloatProvider(roundTripFunc(func(*http.Request) (*http.Response, error) { t.Fatal("request should not run"); return nil, nil }), "").Scan(context.Background(), Query{MarketNames: []string{"Item"}, Currency: "AUD"})
	if err == nil {
		t.Fatal("expected currency error")
	}
}
