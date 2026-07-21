package econ

import (
	"errors"
	"math"
	"strings"
	"testing"
)

func TestSchemaParsesPaintKitWearCaps(t *testing.T) {
	root, err := parseKeyValues(`"items_game" { "paint_kits" { "101" { "name" "test_finish" "wear_remap_min" "0.06" "wear_remap_max" "0.80" } } }`)
	if err != nil {
		t.Fatal(err)
	}
	schema := &Schema{paintKits: make(map[uint32]paintKitDefinition)}
	schema.parseItems(root)
	paint := schema.paintKits[101]
	if paint.WearMin == nil || *paint.WearMin != 0.06 || paint.WearMax == nil || *paint.WearMax != 0.80 {
		t.Fatalf("wear caps = %#v, %#v", paint.WearMin, paint.WearMax)
	}
}

func TestCovertTradeUpFindsRareSpecialsFromContainingLootList(t *testing.T) {
	schema := &Schema{
		items: map[uint32]itemDefinition{
			7:  {Name: "weapon_ak47", ItemName: "AK-47", Rarity: "ancient"},
			42: {Name: "weapon_knife", ItemName: "Knife", Rarity: "unusual"},
		},
		paintKits: map[uint32]paintKitDefinition{
			1: {Name: "red", Description: "Red", Rarity: "ancient"},
			2: {Name: "fade", Description: "Fade", Rarity: "unusual"},
		},
		lootLists: map[string][]string{
			"case":       {"case_skins", "case_rare"},
			"case_skins": {"[red]weapon_ak47"},
			"case_rare":  {"[fade]weapon_knife"},
		},
	}
	items := schema.rareSpecialTradeUpItems("[red]weapon_ak47")
	if len(items) != 1 || items[0].MarketName != "weapon_knife | fade" {
		t.Fatalf("rare-special outcomes = %#v", items)
	}
}

func TestInventoryDescriptionDoesNotDiscardSchemaWeaponFinish(t *testing.T) {
	metadata := Metadata{
		Name:       "R8 Revolver",
		MarketName: "R8 Revolver | Blaze",
		Kind:       "weapon_skin",
	}

	got := metadata.WithInventoryDescription(InventoryDescription{
		Name:           "R8 Revolver",
		MarketHashName: "R8 Revolver",
	})

	if got.MarketName != "R8 Revolver | Blaze" {
		t.Fatalf("market name = %q, want schema-derived finish", got.MarketName)
	}
}

func TestInventoryDescriptionCanRefineWeaponFinish(t *testing.T) {
	metadata := Metadata{
		Name:       "R8 Revolver",
		MarketName: "R8 Revolver | Blaze",
		Kind:       "weapon_skin",
	}

	got := metadata.WithInventoryDescription(InventoryDescription{
		MarketHashName: "StatTrak™ R8 Revolver | Blaze (Factory New)",
	})

	if got.MarketName != "StatTrak™ R8 Revolver | Blaze (Factory New)" {
		t.Fatalf("market name = %q", got.MarketName)
	}
}

func TestInventoryInspectURLUsesSteamPreviewActionAndExpandsAssetPlaceholders(t *testing.T) {
	actions := []inventoryAction{
		{Name: "Unrelated", Link: "https://example.invalid/"},
		{Name: "Inspect in Game...", Link: "steam://rungame/730/76561202255233023/+csgo_econ_action_preview%20S%owner_steamid%A%assetid%D123"},
	}

	link := expandInventoryInspectURL(inventoryInspectURL(actions), "76561198000000000", "123456789")
	want := "steam://rungame/730/76561202255233023/+csgo_econ_action_preview%20S76561198000000000A123456789D123"
	if link != want {
		t.Fatalf("inspect link = %q, want %q", link, want)
	}
}

func TestInventoryInspectURLRejectsOtherSteamCommands(t *testing.T) {
	got := inventoryInspectURL([]inventoryAction{{Link: "steam://rungame/730/0/+connect%20example.invalid"}})
	if got != "" {
		t.Fatalf("inspect link = %q, want empty", got)
	}
}

func TestSchemaMetadataMergesRepeatedItemsSections(t *testing.T) {
	itemsRoot, err := parseKeyValues(`
"items_game"
{
	"items"
	{
		"970"
		{
			"name" "Fortius Quo Fidelius"
			"item_name" "#CSGO_CollectibleCoin_FortiusQuoFidelius"
			"item_rarity" "ancient"
			"capabilities" { "can_trade" "0" }
		}
	}
	"items"
	{
		"1209"
		{
			"name" "sticker"
			"item_name" "#CSGO_Tool_Sticker"
			"prefab" "csgo_tool"
			"tool"
			{
				"type" "sticker"
			}
		}
		"1314"
		{
			"name" "musickit"
			"prefab" "musickit_prefab"
		}
		"1355"
		{
			"name" "keychain"
			"item_name" "#CSGO_Tool_Keychain"
			"tool"
			{
				"type" "keychain"
			}
		}
		"1348"
		{
			"name" "spray"
			"item_name" "#CSGO_Tool_Spray"
			"tool"
			{
				"type" "spray"
			}
			"inv_graphic_art" "graffiti"
		}
		"4599"
		{
			"name" "crate_sticker_pack_feral_predators_capsule"
			"item_name" "#CSGO_crate_sticker_pack_feral_predators_capsule"
			"item_class" "supply_crate"
			"prefab" "sticker_capsule"
		}
		"4600"
		{
			"name" "crate_spray_pack_example_capsule"
			"item_name" "#CSGO_crate_spray_pack_example_capsule"
			"item_class" "supply_crate"
			"prefab" "spray_capsule"
		}
		"4601"
		{
			"name" "crate_pin_pack_example_capsule"
			"item_name" "#CSGO_crate_pin_pack_example_capsule"
			"item_class" "supply_crate"
			"prefab" "pin_capsule"
		}
		"4602"
		{
			"name" "crate_patch_pack_example_capsule"
			"item_name" "#CSGO_crate_patch_pack_example_capsule"
			"item_class" "supply_crate"
			"prefab" "patch_capsule"
		}
		"4001"
		{
			"name" "crate_valve_1"
			"item_name" "#CSGO_crate_valve_1"
			"item_class" "supply_crate"
			"associated_items" { "1203" "1" }
		}
	}
	"sticker_kits"
	{
		"42"
		{
			"name" "kawaiikiller"
			"item_name" "#StickerKit_comm02_kawaiikiller"
			"item_rarity" "rare"
		}
		"43"
		{
			"name" "spray_std_gg_01"
			"item_name" "#StickerKit_spray_std_gg_01"
		}
	}
	"music_definitions"
	{
		"7"
		{
			"name" "feedme_01"
			"loc_name" "#musickit_feedme_01"
		}
	}
	"keychain_definitions"
	{
		"11"
		{
			"name" "kc_missinglink_howl"
			"loc_name" "#keychain_kc_missinglink_howl"
		}
	}
}

`)
	if err != nil {
		t.Fatal(err)
	}
	englishRoot, err := parseKeyValues(`
"lang"
{
	"Tokens"
	{
		"CSGO_CollectibleCoin_FortiusQuoFidelius" "Loyalty Badge"
		"CSGO_crate_sticker_pack_feral_predators_capsule" "Feral Predators Capsule"
		"CSGO_crate_spray_pack_example_capsule" "Example Graffiti Capsule"
		"CSGO_crate_pin_pack_example_capsule" "Example Pin Capsule"
		"CSGO_crate_patch_pack_example_capsule" "Example Patch Capsule"
		"CSGO_Tool_Sticker" "Sticker"
		"CSGO_Tool_Keychain" "Charm"
		"StickerKit_comm02_kawaiikiller" "Kawaii Killer CT"
		"StickerKit_spray_std_gg_01" "GG"
		"musickit_feedme_01" "Feed Me, High Noon"
		"keychain_kc_missinglink_howl" "Lil' Howl"
	}
}

`)
	if err != nil {
		t.Fatal(err)
	}
	schema := &Schema{
		items:            make(map[uint32]itemDefinition),
		paintKits:        make(map[uint32]paintKitDefinition),
		stickerKits:      make(map[uint32]stickerKitDefinition),
		musicDefinitions: make(map[uint32]musicDefinition),
		keychains:        make(map[uint32]keychainDefinition),
		tokens:           parseTokens(englishRoot),
	}
	schema.parseItems(itemsRoot)
	tests := map[uint32]string{
		970:  "Loyalty Badge",
		4599: "Feral Predators Capsule",
	}
	for defIndex, want := range tests {
		got := schema.Metadata(defIndex, 0, nil)
		if got.Name != want {
			t.Fatalf("defindex %d name = %q, want %q; metadata=%#v", defIndex, got.Name, want, got)
		}
		if got.Kind == "unknown" {
			t.Fatalf("defindex %d resolved unknown kind: %#v", defIndex, got)
		}
	}
	if tradable := schema.Metadata(970, 0, nil).Tradable; tradable == nil || *tradable {
		t.Fatalf("Loyalty Badge tradable = %#v, want explicit false from items_game capabilities", tradable)
	}
	capsule := schema.Metadata(4599, 0, nil)
	if capsule.Kind != "container" {
		t.Fatalf("sticker capsule kind = %q, want container; metadata=%#v", capsule.Kind, capsule)
	}
	if len(capsule.RequiredKeyDefIndexes) != 0 {
		t.Fatalf("keyless capsule required keys = %#v, want none", capsule.RequiredKeyDefIndexes)
	}
	caseMetadata := schema.Metadata(4001, 0, nil)
	if len(caseMetadata.RequiredKeyDefIndexes) != 1 || caseMetadata.RequiredKeyDefIndexes[0] != 1203 {
		t.Fatalf("case required keys = %#v, want [1203]", caseMetadata.RequiredKeyDefIndexes)
	}
	capsules := map[uint32]string{
		4600: "graffiti capsule",
		4601: "pin capsule",
		4602: "patch capsule",
	}
	for defIndex, label := range capsules {
		got := schema.Metadata(defIndex, 0, map[uint32]uint32{113: 42})
		if got.Kind != "container" {
			t.Fatalf("%s kind = %q, want container; metadata=%#v", label, got.Kind, got)
		}
		if strings.Contains(got.MarketName, "Sticker |") || strings.Contains(got.MarketName, "Graffiti |") {
			t.Fatalf("%s market name was replaced by contained-item metadata: %#v", label, got)
		}
		if applied := schema.AppliedItems(defIndex, map[uint32]uint32{113: 42}); len(applied) != 0 {
			t.Fatalf("%s exposed container metadata as applied items: %#v", label, applied)
		}
	}
	enriched := []struct {
		name       string
		defIndex   uint32
		attributes map[uint32]uint32
		wantName   string
		wantMarket string
	}{
		{name: "sticker", defIndex: 1209, attributes: map[uint32]uint32{113: 42}, wantName: "Kawaii Killer CT", wantMarket: "Sticker | Kawaii Killer CT"},
		{name: "graffiti", defIndex: 1348, attributes: map[uint32]uint32{113: 43}, wantName: "GG", wantMarket: "Sealed Graffiti | GG"},
		{name: "music", defIndex: 1314, attributes: map[uint32]uint32{166: 7}, wantName: "Feed Me, High Noon", wantMarket: "Music Kit | Feed Me, High Noon"},
		{name: "keychain", defIndex: 1355, attributes: map[uint32]uint32{299: 11}, wantName: "Lil' Howl", wantMarket: "Charm | Lil' Howl"},
	}
	for _, tt := range enriched {
		got := schema.Metadata(tt.defIndex, 0, tt.attributes)
		if got.Name != tt.wantName || got.MarketName != tt.wantMarket {
			t.Fatalf("%s metadata = %#v, want name=%q market=%q", tt.name, got, tt.wantName, tt.wantMarket)
		}
		if tt.name == "sticker" && got.Rarity != "rare" {
			t.Fatalf("sticker rarity = %q, want rare (High Grade/blue)", got.Rarity)
		}
	}
	if got := schema.AppliedItems(1209, map[uint32]uint32{113: 42}); len(got) != 0 {
		t.Fatalf("generic sticker applied items = %#v, want none", got)
	}
}

func TestMarketSearchQueriesAvoidLiteralWeaponSeparator(t *testing.T) {
	queries := marketSearchQueries("M4A4 | Converter (Minimal Wear)")
	if len(queries) != 2 || queries[0] != "Converter (Minimal Wear)" || queries[1] != "M4A4 | Converter (Minimal Wear)" {
		t.Fatalf("market queries = %#v", queries)
	}
}

func TestSteamIconURLNormalizesSteamDescriptionShapes(t *testing.T) {
	tests := map[string]string{
		"token":                "https://community.fastly.steamstatic.com/economy/image/token",
		"/economy/image/token": "https://community.fastly.steamstatic.com/economy/image/token",
		"//community.fastly.steamstatic.com/icon":   "https://community.fastly.steamstatic.com/icon",
		"https://steamcommunity.example/image/icon": "https://steamcommunity.example/image/icon",
		" https://cdn.example/icon&amp;x=1 ":        "https://cdn.example/icon&x=1",
	}
	for input, want := range tests {
		if got := steamIconURL(input); got != want {
			t.Errorf("steamIconURL(%q) = %q, want %q", input, got, want)
		}
	}
}

func TestAddMarketDescriptionIndexesImageByAllSteamNames(t *testing.T) {
	description := MarketDescription{
		HashName:       "AK-47 | Redline (Field-Tested)",
		MarketHashName: "AK-47 | Redline (Field-Tested)",
		MarketName:     "AK-47 | Redline (Field-Tested)",
		IconURL:        "https://community.fastly.steamstatic.com/economy/image/token",
	}
	got := make(map[string]MarketDescription)
	addMarketDescription(got, "requested name", description)
	for _, name := range []string{"requested name", description.HashName, description.MarketHashName, description.MarketName} {
		if got[name].IconURL != description.IconURL {
			t.Errorf("market description was not indexed by %q", name)
		}
	}
}

func TestTrackedImageIndexIsPrimaryForWeaponFinish(t *testing.T) {
	const trackedURL = "https://cdn.steamstatic.com/apps/730/icons/econ/default_generated/weapon_ak47_redline_light.hash.png"
	schema := &Schema{
		paintKits: map[uint32]paintKitDefinition{282: {Name: "redline"}},
		imageURLs: map[string]string{
			"econ/default_generated/weapon_ak47_redline_light": trackedURL,
		},
	}
	item := itemDefinition{Name: "weapon_ak47", Image: "econ/weapons/base_weapons/weapon_ak47"}
	got := schema.itemImageURL(item, 282, nil)
	if got != trackedURL {
		t.Fatalf("tracked finish image = %q, want %q", got, trackedURL)
	}
	metadata := Metadata{ImageURL: got}.WithInventoryDescription(InventoryDescription{IconURLLarge: "https://steam.example/fallback.png"})
	if metadata.ImageURL != trackedURL {
		t.Fatalf("Steam fallback replaced tracked image: %q", metadata.ImageURL)
	}
}

func TestImageDiagnosticsSourceTracksSteamFallback(t *testing.T) {
	metadata := Metadata{}.WithInventoryDescription(InventoryDescription{IconURL: "https://steam.example/inventory.png"})
	if metadata.ImageSource != "steam-inventory-description" {
		t.Fatalf("inventory image source = %q", metadata.ImageSource)
	}
	metadata = Metadata{}.WithMarketDescription(MarketDescription{IconURL: "https://steam.example/market.png"})
	if metadata.ImageSource != "steam-market-description" {
		t.Fatalf("market image source = %q", metadata.ImageSource)
	}
}

func TestTrackedWeaponFinishImageUsesWearTier(t *testing.T) {
	schema := &Schema{
		paintKits: map[uint32]paintKitDefinition{282: {Name: "cu_ak47_cobra"}},
		imageURLs: map[string]string{
			"econ/default_generated/weapon_ak47_cu_ak47_cobra_light": "https://cdn.example/light.png",
			"econ/default_generated/weapon_ak47_cu_ak47_cobra_heavy": "https://cdn.example/heavy.png",
		},
	}
	item := itemDefinition{Name: "weapon_ak47"}
	attributes := map[uint32]uint32{8: math.Float32bits(0.6)}
	if got := schema.itemImageURL(item, 282, attributes); got != "https://cdn.example/heavy.png" {
		t.Fatalf("tracked finish image = %q, want heavy wear image", got)
	}
}

func TestCollectibleImageIsNotReplacedByMatchingStickerAttribute(t *testing.T) {
	const coinKey = "econ/status_icons/operation_shattered_web"
	const coinURL = "https://cdn.example/operation-shattered-web.png"
	schema := &Schema{
		stickerKits: map[uint32]stickerKitDefinition{
			1: {Material: "dreamhack2013/very_early_sticker"},
		},
		imageURLs: map[string]string{
			coinKey: coinURL,
			"econ/stickers/dreamhack2013/very_early_sticker": "https://cdn.example/dreamhack-sticker.png",
		},
	}
	coin := itemDefinition{Name: "shattered_web_challenge_coin", ItemClass: "collectible_item", Image: coinKey}
	imageURL, imageKey := schema.itemImageLookup(coin, 0, map[uint32]uint32{113: 1, 999: 1})
	if imageURL != coinURL || imageKey != coinKey {
		t.Fatalf("collectible image lookup = (%q, %q), want (%q, %q)", imageURL, imageKey, coinURL, coinKey)
	}
}

func TestSpecialDefinitionMatchingUsesProtocolAttributeIDs(t *testing.T) {
	schema := &Schema{
		stickerKits:      map[uint32]stickerKitDefinition{7: {Name: "sticker"}},
		musicDefinitions: map[uint32]musicDefinition{8: {Name: "music"}},
		keychains:        map[uint32]keychainDefinition{9: {Name: "keychain"}},
	}
	attributes := map[uint32]uint32{900: 7, 901: 8, 902: 9}
	if schema.matchStickerKit(attributes) != nil || schema.matchMusicDefinition(attributes) != nil || schema.matchKeychain(attributes) != nil {
		t.Fatal("unrelated attribute values matched special item definitions")
	}
}

func TestTrackedImageRejectsNonHTTPSURLs(t *testing.T) {
	for _, value := range []string{"", "http://cdn.example/image.png", "javascript:alert(1)", "not a URL"} {
		if validTrackedImageURL(value) {
			t.Errorf("validTrackedImageURL(%q) = true", value)
		}
	}
}

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
