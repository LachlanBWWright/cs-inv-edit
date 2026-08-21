package pricescanner

import (
	"context"
	"fmt"
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

func TestSkinportProviderUsesTF2AppID(t *testing.T) {
	client := roundTripFunc(func(request *http.Request) (*http.Response, error) {
		if request.URL.Query().Get("app_id") != "440" {
			t.Fatalf("app_id query = %q", request.URL.RawQuery)
		}
		return jsonResponse(`[{"market_hash_name":"Mann Co. Supply Crate Key","currency":"USD","min_price":1.85,"quantity":12}]`), nil
	})
	quotes, err := NewSkinportProvider(client).Scan(context.Background(), Query{MarketNames: []string{"Mann Co. Supply Crate Key"}, Currency: "USD", AppID: 440})
	if err != nil || len(quotes) != 1 {
		t.Fatalf("quotes=%#v err=%v", quotes, err)
	}
}

func TestSkinportProviderUsesDotaAppID(t *testing.T) {
	client := roundTripFunc(func(request *http.Request) (*http.Response, error) {
		if request.URL.Query().Get("app_id") != "570" {
			t.Fatalf("app_id query = %q", request.URL.RawQuery)
		}
		return jsonResponse(`[{"market_hash_name":"Dota Item","currency":"USD","min_price":2.50,"quantity":3}]`), nil
	})
	quotes, err := NewSkinportProvider(client).Scan(context.Background(), Query{MarketNames: []string{"Dota Item"}, Currency: "USD", AppID: 570})
	if err != nil || len(quotes) != 1 {
		t.Fatalf("quotes=%#v err=%v", quotes, err)
	}
}

func TestSteamProviderUsesRequestedAppID(t *testing.T) {
	client := roundTripFunc(func(request *http.Request) (*http.Response, error) {
		if request.URL.Query().Get("appid") != "440" {
			t.Fatalf("appid query = %q", request.URL.RawQuery)
		}
		return jsonResponse(`{"success":true,"lowest_price":"$1.25","volume":"4"}`), nil
	})
	quotes, err := NewSteamProvider(client).Scan(context.Background(), Query{MarketNames: []string{"TF2 Item"}, Currency: "USD", AppID: 440})
	if err != nil {
		t.Fatal(err)
	}
	if len(quotes) != 1 || !strings.Contains(quotes[0].URL, "/440/") {
		t.Fatalf("quotes=%#v", quotes)
	}
}

func TestSteamProviderFallsBackToMedianPrice(t *testing.T) {
	client := roundTripFunc(func(*http.Request) (*http.Response, error) {
		return jsonResponse(`{"success":true,"volume":"222","median_price":"$0.07"}`), nil
	})
	quotes, err := NewSteamProvider(client).Scan(context.Background(), Query{MarketNames: []string{"Sticker | Skelly Stabby"}, Currency: "USD", AppID: 730})
	if err != nil {
		t.Fatal(err)
	}
	if len(quotes) != 1 || quotes[0].DisplayPrice != "$0.07" || quotes[0].AmountMinor == nil || *quotes[0].AmountMinor != 7 || quotes[0].ListingCount == nil || *quotes[0].ListingCount != 222 {
		t.Fatalf("quotes=%#v", quotes)
	}
}

func TestSteamProviderRetainsQuotesBeforeAnItemFailure(t *testing.T) {
	client := roundTripFunc(func(request *http.Request) (*http.Response, error) {
		if request.URL.Query().Get("market_hash_name") == "Unavailable item" {
			return nil, fmt.Errorf("rate limited")
		}
		return jsonResponse(`{"success":true,"lowest_price":"$0.42","volume":"3"}`), nil
	})
	quotes, err := NewSteamProvider(client).Scan(context.Background(), Query{MarketNames: []string{"Available item", "Unavailable item"}, Currency: "USD", AppID: 753})
	if err == nil {
		t.Fatal("expected the failed item to remain visible as a provider error")
	}
	if len(quotes) != 1 || quotes[0].MarketName != "Available item" || !strings.Contains(quotes[0].URL, "/753/") {
		t.Fatalf("quotes=%#v err=%v", quotes, err)
	}
}

func TestCSFloatProviderDoesNotSilentlyMixCurrencies(t *testing.T) {
	_, err := NewCSFloatProvider(roundTripFunc(func(*http.Request) (*http.Response, error) { t.Fatal("request should not run"); return nil, nil }), "").Scan(context.Background(), Query{MarketNames: []string{"Item"}, Currency: "AUD"})
	if err == nil {
		t.Fatal("expected currency error")
	}
}

func TestWaxpeerProviderMatchesExactNameAndNormalizesPrice(t *testing.T) {
	client := roundTripFunc(func(request *http.Request) (*http.Response, error) {
		if request.URL.Query().Get("game") != "csgo" || request.URL.Query().Get("search") != "AK-47 | Redline (Field-Tested)" {
			t.Fatalf("query = %q", request.URL.RawQuery)
		}
		return jsonResponse(`{"success":true,"items":[{"name":"Souvenir AK-47 | Redline (Field-Tested)","count":1,"min":235556},{"name":"AK-47 | Redline (Field-Tested)","count":879,"min":32005}]}`), nil
	})
	quotes, err := NewWaxpeerProvider(client).Scan(context.Background(), Query{MarketNames: []string{"AK-47 | Redline (Field-Tested)"}, Currency: "USD"})
	if err != nil {
		t.Fatal(err)
	}
	if len(quotes) != 1 || quotes[0].AmountMinor == nil || *quotes[0].AmountMinor != 3201 || quotes[0].ListingCount == nil || *quotes[0].ListingCount != 879 {
		t.Fatalf("quotes=%#v", quotes)
	}
}

func TestWaxpeerProviderDoesNotSilentlyMixCurrencies(t *testing.T) {
	_, err := NewWaxpeerProvider(roundTripFunc(func(*http.Request) (*http.Response, error) { t.Fatal("request should not run"); return nil, nil })).Scan(context.Background(), Query{MarketNames: []string{"Item"}, Currency: "AUD"})
	if err == nil {
		t.Fatal("expected currency error")
	}
}

func TestWaxpeerProviderUsesTF2Market(t *testing.T) {
	client := roundTripFunc(func(request *http.Request) (*http.Response, error) {
		if request.URL.Query().Get("game") != "tf2" {
			t.Fatalf("game query = %q", request.URL.RawQuery)
		}
		return jsonResponse(`{"success":true,"items":[{"name":"Mann Co. Supply Crate Key","count":20,"min":1680}]}`), nil
	})
	quotes, err := NewWaxpeerProvider(client).Scan(context.Background(), Query{MarketNames: []string{"Mann Co. Supply Crate Key"}, Currency: "USD", AppID: 440})
	if err != nil || len(quotes) != 1 || !strings.Contains(quotes[0].URL, "/tf2?") {
		t.Fatalf("quotes=%#v err=%v", quotes, err)
	}
}

func TestPriceDBProviderReturnsBackpackTFRange(t *testing.T) {
	client := roundTripFunc(func(request *http.Request) (*http.Response, error) {
		if request.URL.Query().Get("q") != "Mann Co. Supply Crate Key" {
			t.Fatalf("query = %q", request.URL.RawQuery)
		}
		return jsonResponse(`{"success":true,"data":{"results":[{"name":"Mann Co. Supply Crate Key","source":"bptf","buy":{"keys":0,"metal":61},"sell":{"keys":0,"metal":62}}]}}`), nil
	})
	quotes, err := NewPriceDBProvider(client).Scan(context.Background(), Query{MarketNames: []string{"Mann Co. Supply Crate Key"}, Currency: "USD", AppID: 440})
	if err != nil || len(quotes) != 1 || quotes[0].DisplayPrice != "61 ref – 62 ref" || quotes[0].AmountMinor != nil {
		t.Fatalf("quotes=%#v err=%v", quotes, err)
	}
}

func TestMarketCSGOProviderMatchesExactNamesAndCachesCatalogue(t *testing.T) {
	requests := 0
	client := roundTripFunc(func(request *http.Request) (*http.Response, error) {
		requests++
		if request.URL.Path != "/api/v2/prices/USD.json" {
			t.Fatalf("path = %q", request.URL.Path)
		}
		return jsonResponse(`{"success":true,"currency":"USD","items":[{"market_hash_name":"Item A","volume":"42","price":"12.345"},{"market_hash_name":"Other","volume":"2","price":"1.000"}]}`), nil
	})
	provider := NewMarketCSGOProvider(client)
	for range 2 {
		quotes, err := provider.Scan(context.Background(), Query{MarketNames: []string{"Item A"}, Currency: "USD"})
		if err != nil {
			t.Fatal(err)
		}
		if len(quotes) != 1 || quotes[0].AmountMinor == nil || *quotes[0].AmountMinor != 1235 || quotes[0].ListingCount == nil || *quotes[0].ListingCount != 42 {
			t.Fatalf("quotes=%#v", quotes)
		}
	}
	if requests != 1 {
		t.Fatalf("requests=%d want 1", requests)
	}
}

func TestMarketDotaProviderUsesDotaCatalogue(t *testing.T) {
	client := roundTripFunc(func(request *http.Request) (*http.Response, error) {
		if request.URL.Host != "market.dota2.net" || request.URL.Path != "/api/v2/prices/USD.json" {
			t.Fatalf("url = %q", request.URL.String())
		}
		return jsonResponse(`{"success":true,"items":[{"market_hash_name":"Dota Item","volume":"7","price":"0.015"}]}`), nil
	})
	quotes, err := NewMarketDotaProvider(client).Scan(context.Background(), Query{MarketNames: []string{"Dota Item"}, Currency: "USD", AppID: 570})
	if err != nil || len(quotes) != 1 || quotes[0].AmountMinor == nil || *quotes[0].AmountMinor != 2 {
		t.Fatalf("quotes=%#v err=%v", quotes, err)
	}
}
