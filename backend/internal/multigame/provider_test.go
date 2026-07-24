package multigame

import (
	"context"
	"io"
	"net/http"
	"strings"
	"testing"
	"time"
)

type roundTripFunc func(*http.Request) (*http.Response, error)

func (fn roundTripFunc) RoundTrip(request *http.Request) (*http.Response, error) {
	return fn(request)
}

func providerWithResponse(status int, body string) *Provider {
	provider := NewProvider()
	provider.communityBase = "https://inventory.test"
	provider.client = &http.Client{Timeout: time.Second, Transport: roundTripFunc(func(*http.Request) (*http.Response, error) {
		return &http.Response{
			StatusCode: status,
			Header:     http.Header{"Content-Type": []string{"application/json"}},
			Body:       io.NopCloser(strings.NewReader(body)),
		}, nil
	})}
	return provider
}

func TestEnrichOwnedUsesCommunityInventoryOnlyAsOverlay(t *testing.T) {
	provider := providerWithResponse(http.StatusOK, `{
          "success": 1,
          "assets": [
            {"appid": 570, "contextid": "2", "assetid": "100", "classid": "10", "instanceid": "0", "amount": "1"},
            {"appid": 570, "contextid": "2", "assetid": "200", "classid": "20", "instanceid": "0", "amount": "1"},
            {"appid": 570, "contextid": "2", "assetid": "999", "classid": "99", "instanceid": "0", "amount": "1"}
          ],
          "descriptions": [
            {"appid": 570, "classid": "10", "instanceid": "0", "name": "Owned courier", "market_hash_name": "Owned courier", "icon_url": "token", "tradable": 1, "marketable": 1},
            {"appid": 570, "classid": "20", "instanceid": "0", "name": "Nonmarketable badge", "icon_url": "badge", "tradable": 0, "marketable": 0},
            {"appid": 570, "classid": "99", "instanceid": "0", "name": "Not owned", "market_hash_name": "Not owned", "icon_url": "extra"}
          ]
        }`)
	snapshot := provider.EnrichOwned(context.Background(), "7656119", games["dota2"], []OwnedItem{
		{ID: 100, DefIndex: 7, Quantity: 1},
		{ID: 200, DefIndex: 8, Quantity: 2},
		{ID: 300, DefIndex: 9, Quantity: 1},
	})

	if len(snapshot.Items) != 3 {
		t.Fatalf("items=%d, want exactly the three GC-owned items", len(snapshot.Items))
	}
	if snapshot.Items[0].Name != "Owned courier" || !strings.HasSuffix(snapshot.Items[0].ImageURL, "/token") {
		t.Fatalf("matched overlay item=%#v", snapshot.Items[0])
	}
	if snapshot.Items[1].Name != "Nonmarketable badge" || snapshot.Items[1].Tradable || snapshot.Items[1].Marketable {
		t.Fatalf("nonmarketable overlay item=%#v", snapshot.Items[1])
	}
	if snapshot.Items[2].AssetID != "300" || snapshot.Items[2].Name != "Definition 9" {
		t.Fatalf("unmatched GC item=%#v", snapshot.Items[2])
	}
}

func TestEnrichOwnedSurvivesUnavailableCommunityOverlay(t *testing.T) {
	provider := providerWithResponse(http.StatusForbidden, "private")
	snapshot := provider.EnrichOwned(context.Background(), "7656119", games["dota2"], []OwnedItem{{ID: 123, DefIndex: 42}})
	if snapshot.Status != "ready" || len(snapshot.Items) != 1 || snapshot.Items[0].AssetID != "123" {
		t.Fatalf("snapshot=%#v", snapshot)
	}
	foundOverlayDiagnostic := false
	for _, diagnostic := range snapshot.Diagnostics {
		foundOverlayDiagnostic = foundOverlayDiagnostic || strings.Contains(diagnostic, "overlay unavailable")
	}
	if !foundOverlayDiagnostic {
		t.Fatalf("diagnostics=%#v", snapshot.Diagnostics)
	}
}

func TestLoadRejectsCommunityAppIDMismatch(t *testing.T) {
	provider := providerWithResponse(http.StatusOK, `{"success":1,"assets":[{"appid":440,"assetid":"1","classid":"1","instanceid":"0","amount":"1"}],"descriptions":[]}`)
	_, err := provider.Load(context.Background(), "7656119", games["dota2"])
	if err == nil || !strings.Contains(err.Error(), "did not match requested AppID") {
		t.Fatalf("error=%v", err)
	}
}

func TestSteamInventoryUsesApp753Context6AsAuthoritativeOwnership(t *testing.T) {
	var requestedPath string
	var requestedCount string
	var loginCookie *http.Cookie
	provider := NewProvider()
	provider.communityBase = "https://inventory.test"
	provider.client = &http.Client{Transport: roundTripFunc(func(request *http.Request) (*http.Response, error) {
		requestedPath = request.URL.Path
		requestedCount = request.URL.Query().Get("count")
		loginCookie, _ = request.Cookie("steamLoginSecure")
		return &http.Response{StatusCode: http.StatusOK, Header: http.Header{}, Body: io.NopCloser(strings.NewReader(`{
			"success":1,
			"assets":[{"appid":753,"contextid":"6","assetid":"10","classid":"20","instanceid":"0","amount":"2"}],
			"descriptions":[{"appid":753,"classid":"20","instanceid":"0","name":"Test Emoticon","market_hash_name":"Test Emoticon","type":"Emoticon","icon_url":"token","tradable":1,"marketable":1,"tags":[{"category":"item_class","internal_name":"item_class_4","localized_tag_name":"Emoticon"}]}]
		}`))}, nil
	})}
	snapshot, err := provider.LoadAuthenticated(context.Background(), "7656119", games["steam"], "web-token")
	if err != nil {
		t.Fatal(err)
	}
	if requestedPath != "/inventory/7656119/753/6" {
		t.Fatalf("path=%q, want Steam Community context 6", requestedPath)
	}
	if requestedCount != "2000" {
		t.Fatalf("count=%q, want Steam-supported page size 2000", requestedCount)
	}
	if loginCookie == nil || loginCookie.Value != "7656119%7C%7Cweb-token" {
		t.Fatalf("authenticated Steam cookie=%#v", loginCookie)
	}
	if len(snapshot.Items) != 1 || snapshot.Items[0].Name != "Test Emoticon" || snapshot.Items[0].Quantity != 2 || snapshot.Items[0].ContextID != "6" {
		t.Fatalf("Steam snapshot=%#v", snapshot)
	}
	if !strings.Contains(strings.Join(snapshot.Diagnostics, "\n"), "authoritative") {
		t.Fatalf("Steam diagnostics=%#v", snapshot.Diagnostics)
	}
}

func TestCommunityOverlayIsPositivelyCached(t *testing.T) {
	calls := 0
	provider := NewProvider()
	provider.communityBase = "https://inventory.test"
	provider.client = &http.Client{Transport: roundTripFunc(func(*http.Request) (*http.Response, error) {
		calls++
		return &http.Response{StatusCode: http.StatusOK, Header: http.Header{}, Body: io.NopCloser(strings.NewReader(`{"success":1,"assets":[],"descriptions":[]}`))}, nil
	})}
	for range 2 {
		if _, err := provider.Load(context.Background(), "7656119", games["dota2"]); err != nil {
			t.Fatal(err)
		}
	}
	if calls != 1 {
		t.Fatalf("HTTP calls=%d, want one positive cached request", calls)
	}
}

func TestMetadataFetchRetriesTransientFailure(t *testing.T) {
	calls := 0
	provider := NewProvider()
	provider.communityBase = "https://inventory.test"
	provider.client = &http.Client{Transport: roundTripFunc(func(*http.Request) (*http.Response, error) {
		calls++
		status, body := http.StatusServiceUnavailable, "busy"
		if calls == 2 {
			status, body = http.StatusOK, `{"success":1,"assets":[],"descriptions":[]}`
		}
		return &http.Response{StatusCode: status, Header: http.Header{}, Body: io.NopCloser(strings.NewReader(body))}, nil
	})}
	if _, err := provider.Load(context.Background(), "7656119", games["dota2"]); err != nil {
		t.Fatal(err)
	}
	if calls != 2 {
		t.Fatalf("HTTP calls=%d, want one retry", calls)
	}
}

func TestTF2SchemaEnrichmentRecordsContentRevision(t *testing.T) {
	provider := NewProvider()
	provider.communityBase = "https://inventory.test"
	provider.tf2ItemsURL = "https://schema.test/items_game.txt"
	provider.tf2EnglishURL = "https://schema.test/tf_english.txt"
	provider.client = &http.Client{Transport: roundTripFunc(func(request *http.Request) (*http.Response, error) {
		body := `{"success":1,"assets":[],"descriptions":[]}`
		switch request.URL.Host {
		case "schema.test":
			if strings.HasSuffix(request.URL.Path, "items_game.txt") {
				body = `"items_game" { "prefabs" { "hat" { "item_type_name" "#Type_Hat" "item_slot" "head" "item_quality" "unique" } } "items" { "42" { "prefab" "hat" "item_name" "#Item_Hat" } } }`
			} else {
				body = `"lang" { "Tokens" { "Type_Hat" "Cosmetic Item" "Item_Hat" "Fixture Hat" } }`
			}
		}
		return &http.Response{StatusCode: http.StatusOK, Header: http.Header{}, Body: io.NopCloser(strings.NewReader(body))}, nil
	})}
	snapshot := provider.EnrichOwned(context.Background(), "7656119", games["tf2"], []OwnedItem{{ID: 1, DefIndex: 42, Quantity: 1}})
	if len(snapshot.Items) != 1 || snapshot.Items[0].Name != "Fixture Hat" || snapshot.Items[0].Details.EquipSlot != "head" {
		t.Fatalf("TF2 enrichment=%#v", snapshot)
	}
	if !strings.HasPrefix(snapshot.SchemaRevision, "gametracking-tf2-sha256:") {
		t.Fatalf("schema revision=%q", snapshot.SchemaRevision)
	}
}

func TestTF2SchemaNameRemainsCanonicalWhenItemHasCustomName(t *testing.T) {
	provider := NewProvider()
	provider.communityBase = "https://inventory.test"
	provider.tf2ItemsURL = "https://schema.test/items_game.txt"
	provider.tf2EnglishURL = "https://schema.test/tf_english.txt"
	provider.client = &http.Client{Transport: roundTripFunc(func(request *http.Request) (*http.Response, error) {
		body := `{"success":1,"assets":[{"appid":440,"contextid":"2","assetid":"1","classid":"10","instanceid":"0","amount":"1"}],"descriptions":[{"appid":440,"classid":"10","instanceid":"0","name":"uhm, ackchually","icon_url":"token","tradable":1,"marketable":0}]}`
		if request.URL.Host == "schema.test" {
			if strings.HasSuffix(request.URL.Path, "items_game.txt") {
				body = `"items_game" { "items" { "42" { "name" "actual_hat" "item_name" "#Item_Hat" } } "attributes" {} }`
			} else {
				body = `"lang" { "Tokens" { "Item_Hat" "Actual Hat" } }`
			}
		}
		return &http.Response{StatusCode: http.StatusOK, Header: http.Header{}, Body: io.NopCloser(strings.NewReader(body))}, nil
	})}
	snapshot := provider.EnrichOwned(context.Background(), "7656119", games["tf2"], []OwnedItem{{ID: 1, DefIndex: 42, Quantity: 1, CustomName: "uhm, ackchually"}})
	if got := snapshot.Items[0]; got.Name != "Actual Hat" || got.Details.CustomName != "uhm, ackchually" {
		t.Fatalf("TF2 canonical/custom names = %#v", got)
	}
}

func TestDescriptionTradableAfterParsesOwnerDescription(t *testing.T) {
	got := descriptionTradableAfter([]descriptionLine{{Value: `<span>Tradable After Jul 24, 2026 (16:00:00) GMT</span>`}})
	if got != "2026-07-24T16:00:00Z" {
		t.Fatalf("tradable after=%q", got)
	}
}
