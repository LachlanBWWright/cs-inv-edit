package econ

import "testing"

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
	}
	"sticker_kits"
	{
		"42"
		{
			"name" "kawaiikiller"
			"item_name" "#StickerKit_comm02_kawaiikiller"
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
	capsule := schema.Metadata(4599, 0, nil)
	if capsule.Kind != "container" {
		t.Fatalf("sticker capsule kind = %q, want container; metadata=%#v", capsule.Kind, capsule)
	}
	capsules := map[uint32]string{
		4600: "graffiti capsule",
		4601: "pin capsule",
		4602: "patch capsule",
	}
	for defIndex, label := range capsules {
		got := schema.Metadata(defIndex, 0, nil)
		if got.Kind != "container" {
			t.Fatalf("%s kind = %q, want container; metadata=%#v", label, got.Kind, got)
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
	}
}
