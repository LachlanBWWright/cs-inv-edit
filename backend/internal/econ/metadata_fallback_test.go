package econ

import (
	"errors"
	"testing"
)

func TestLiveImageIndexTakesPrecedenceOverEmbeddedFallback(t *testing.T) {
	got := preferredImageURLs(`{"live/key":"https://cdn.example/live.png"}`)
	if len(got) != 1 || got["live/key"] != "https://cdn.example/live.png" {
		t.Fatalf("preferred image index = %#v", got)
	}
}

func TestInvalidLiveImageIndexUsesEmbeddedFallback(t *testing.T) {
	got := preferredImageURLs(`not json`)
	key := "econ/weapons/base_weapons/weapon_ak47"
	if !validTrackedImageURL(got[key]) {
		t.Fatalf("embedded image fallback did not contain a valid %q URL", key)
	}
}

func TestInventoryDescriptionNameKeysIncludeVariantBase(t *testing.T) {
	keys := inventoryDescriptionNameKeys("Sealed Graffiti | Chicken (Shark White)")
	if len(keys) != 2 || keys[1] != "name:sealed graffiti | chicken" {
		t.Fatalf("description keys = %#v", keys)
	}
}

func TestTransientSteamMarketErrors(t *testing.T) {
	for _, message := range []string{"HTTP 429", "HTTP 502", "request timeout", "unexpected EOF"} {
		if !isTransientSteamMarketError(errors.New(message)) {
			t.Fatalf("%q should be transient", message)
		}
	}
	if isTransientSteamMarketError(errors.New("no exact market result")) {
		t.Fatal("an exact-match miss should not be retried")
	}
}

func TestWithInventoryDescriptionPreservesMarketability(t *testing.T) {
	metadata := (Metadata{}).WithInventoryDescription(InventoryDescription{Marketable: false})
	if metadata.Marketable == nil || *metadata.Marketable {
		t.Fatalf("marketable = %#v, want explicit false", metadata.Marketable)
	}
}
