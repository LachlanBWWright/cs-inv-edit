package econ

import "testing"

func TestParseArmoryOffersUsesCurrentXpShopGoods(t *testing.T) {
	schema := &Schema{
		tokens:    map[string]string{"first": "First Collection", "second": "Second Capsule", "weapon": "Test Weapon"},
		lootLists: map[string][]string{"set_first": {"weapon_test"}},
		items:     map[uint32]itemDefinition{1: {Name: "weapon_test", ItemName: "#weapon"}},
	}
	items := `
"seasonaloperations" { "10" { "operational_point_redeemable" { "points" "99" "item_name" "retired" } } }
"seasonaloperations" { "11" {
  "redeemable_goods" "xpshop"
  "operational_point_redeemable" { "points" "4" "item_name" "lootlist:set_first" "callout" "#first" "ui_order" "2" }
  "operational_point_redeemable" { "points" "1" "item_name" "lootlist:second" "callout" "#second" "ui_order" "3" }
} }
"pro_event_results" {}`
	offers := parseArmoryOffers(items, schema)
	if len(offers) != 2 {
		t.Fatalf("offers = %#v, want two current XP Shop goods", offers)
	}
	if offers[0].CampaignID != 11 || offers[0].RedeemID != 0 || offers[0].ExpectedCost != 4 || offers[0].Name != "First Collection" {
		t.Fatalf("first offer = %#v", offers[0])
	}
	if len(offers[0].Items) != 1 || offers[0].Items[0].Name != "Test Weapon" {
		t.Fatalf("first offer contents = %#v", offers[0].Items)
	}
	if offers[1].RedeemID != 1 || offers[1].ExpectedCost != 1 || offers[1].Name != "Second Capsule" {
		t.Fatalf("second offer = %#v", offers[1])
	}
}

func TestRelatedItemsSortHighToLowAndApplySteamIcons(t *testing.T) {
	schema := &Schema{
		tokens: map[string]string{"common": "Common Item", "ancient": "Ancient Item"},
		items:  map[uint32]itemDefinition{1: {Name: "common", ItemName: "#common", Rarity: "common"}, 2: {Name: "ancient", ItemName: "#ancient", Rarity: "ancient"}},
	}
	items := schema.relatedItems([]string{"common", "ancient"})
	if len(items) != 2 || items[0].Rarity != "ancient" {
		t.Fatalf("related items not sorted high-to-low: %#v", items)
	}
	items = ApplyRelatedItemDescriptions(items, map[string]MarketDescription{"Ancient Item": {IconURL: "https://steamcdn.example/icon"}})
	if items[0].ImageURL != "https://steamcdn.example/icon" {
		t.Fatalf("Steam icon not applied: %#v", items[0])
	}
}

func TestRelatedItemsResolveStickerKitsInsteadOfGenericSticker(t *testing.T) {
	schema := &Schema{
		tokens:      map[string]string{"stickerkit_test": "Actual Sticker"},
		stickerKits: map[uint32]stickerKitDefinition{10: {Name: "paper_actual", ItemName: "#StickerKit_test", Rarity: "rare"}},
	}
	items := schema.relatedItems([]string{"[paper_actual]sticker"})
	if len(items) != 1 || items[0].Name != "Actual Sticker" || items[0].MarketName != "Sticker | Actual Sticker" || items[0].Rarity != "rare" {
		t.Fatalf("sticker kit contents = %#v", items)
	}
}

func TestArmoryCaseResolvesRevolvingLootList(t *testing.T) {
	schema := &Schema{
		items:              map[uint32]itemDefinition{7007: {Name: "crate_test", SupplyCrateSeries: "430"}},
		revolvingLootLists: map[string]string{"430": "crate_test_lootlist"},
	}
	if got := schema.armoryLootListName("crate_test"); got != "crate_test_lootlist" {
		t.Fatalf("case loot list = %q", got)
	}
}

func TestRelatedItemsResolveGraffitiPatchCharmAndPin(t *testing.T) {
	schema := &Schema{
		tokens: map[string]string{"graffiti": "Chicken", "patch": "Howl", "charm": "Hot Sauce", "pin": "Guardian Pin"},
		stickerKits: map[uint32]stickerKitDefinition{
			1: {Name: "spray_chicken", ItemName: "#graffiti", Rarity: "rare"},
			2: {Name: "patch_howl", ItemName: "#patch", Rarity: "legendary"},
		},
		keychains: map[uint32]keychainDefinition{1: {Name: "kc_hot_sauce", ItemName: "#charm", Rarity: "mythical"}},
		items:     map[uint32]itemDefinition{1: {Name: "Commodity Pin - Guardian", ItemName: "#pin", Rarity: "ancient"}},
	}
	items := schema.relatedItems([]string{"[spray_chicken]spray", "[patch_howl]patch", "[kc_hot_sauce]keychain", "Commodity Pin - Guardian"})
	if len(items) != 4 {
		t.Fatalf("resolved cosmetic contents = %#v", items)
	}
	want := []string{"Guardian Pin", "Patch | Howl", "Charm | Hot Sauce", "Sealed Graffiti | Chicken"}
	for index, marketName := range want {
		if items[index].MarketName != marketName {
			t.Fatalf("item %d market name=%q want=%q; all=%#v", index, items[index].MarketName, marketName, items)
		}
	}
}
