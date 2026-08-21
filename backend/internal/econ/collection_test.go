package econ

import "testing"

func TestSchemaResolvesCollectionsAndContainerContents(t *testing.T) {
	root, err := parseKeyValues(`
"items_game"
{
  "items"
  {
    "7" { "name" "weapon_ak47" "item_name" "#AK47" "item_rarity" "rare" }
	"1209" { "name" "sticker" "item_name" "#Sticker" "item_class" "sticker" }
	"1348" { "name" "spray" "item_name" "#Graffiti" "item_class" "tool" "tool" { "type" "spray" } }
	"4001" { "name" "crate_test" "item_name" "#Crate" "item_class" "supply_crate" "loot_list_name" "crate_test_list" }
	"4002" { "name" "sticker_capsule_test" "item_name" "#StickerCapsule" "item_class" "supply_crate" "attributes" { "set supply crate series" { "value" "501" } } }
	"4003" { "name" "graffiti_capsule_test" "item_name" "#GraffitiCapsule" "item_class" "supply_crate" "attributes" { "set supply crate series" { "value" "502" } } }
  }
  "paint_kits" { "101" { "name" "cu_test" "description_tag" "#TestFinish" } }
	"paint_kits_rarity" { "101" "uncommon" }
	"sticker_kits"
	{
	  "201" { "name" "sticker_test" "item_name" "#StickerTest" "item_rarity" "rare" }
	  "202" { "name" "spray_test" "item_name" "#GraffitiTest" "item_rarity" "rare" }
	}
  "item_sets" { "set_test" { "name" "#TestCollection" "items" { "[cu_test]weapon_ak47" "1" } } }
  "client_loot_lists"
  {
    "crate_test_list" { "crate_test_list_mythical" "1" }
    "crate_test_list_mythical" { "[cu_test]weapon_ak47" "1" }
	"sticker_capsule_list" { "[sticker_test]sticker" "1" }
	"graffiti_capsule_list" { "[spray_test]spray" "1" }
  }
	"revolving_loot_lists" { "501" "sticker_capsule_list" "502" "graffiti_capsule_list" }
}`)
	if err != nil {
		t.Fatal(err)
	}
	localization, err := parseKeyValues(`"lang" { "Tokens" { "AK47" "AK-47" "Crate" "Test Case" "Sticker" "Sticker" "Graffiti" "Graffiti" "StickerCapsule" "Test Sticker Capsule" "GraffitiCapsule" "Test Graffiti Capsule" "StickerTest" "Test Sticker" "GraffitiTest" "Test Graffiti" "TestFinish" "Test Finish" "TestCollection" "The Test Collection" } }`)
	if err != nil {
		t.Fatal(err)
	}
	schema := &Schema{
		items: map[uint32]itemDefinition{}, paintKits: map[uint32]paintKitDefinition{},
		stickerKits: map[uint32]stickerKitDefinition{}, musicDefinitions: map[uint32]musicDefinition{},
		keychains: map[uint32]keychainDefinition{}, tokens: parseTokens(localization),
	}
	schema.parseItems(root)
	skin := schema.Metadata(7, 101, nil)
	if skin.Collection != "The Test Collection" || len(skin.CollectionItems) != 1 || skin.CollectionItems[0].MarketName != "AK-47 | Test Finish" {
		t.Fatalf("skin collection metadata = %#v", skin)
	}
	if skin.Rarity != "uncommon" || skin.CollectionItems[0].Rarity != "mythical" {
		t.Fatalf("skin rarity = %q, collection item rarity = %q; want global paint rarity uncommon and case tier mythical", skin.Rarity, skin.CollectionItems[0].Rarity)
	}
	container := schema.Metadata(4001, 0, nil)
	if len(container.ContainerItems) != 1 || container.ContainerItems[0].MarketName != "AK-47 | Test Finish" {
		t.Fatalf("container contents = %#v", container.ContainerItems)
	}
	if container.ContainerItems[0].Rarity != "mythical" {
		t.Fatalf("container rarity = %q; want loot-list tier mythical", container.ContainerItems[0].Rarity)
	}
	collections := schema.Collections()
	if len(collections) != 1 || len(collections[0].Items) != 1 || collections[0].Items[0].Rarity != "mythical" {
		t.Fatalf("collection contents = %#v; want loot-list tier mythical", collections)
	}
	stickerCapsule := schema.Metadata(4002, 0, nil)
	if len(stickerCapsule.ContainerItems) != 1 || stickerCapsule.ContainerItems[0].MarketName != "Sticker | Test Sticker" {
		t.Fatalf("sticker capsule contents = %#v", stickerCapsule.ContainerItems)
	}
	graffitiCapsule := schema.Metadata(4003, 0, nil)
	if len(graffitiCapsule.ContainerItems) != 1 || graffitiCapsule.ContainerItems[0].MarketName != "Sealed Graffiti | Test Graffiti" {
		t.Fatalf("graffiti capsule contents = %#v", graffitiCapsule.ContainerItems)
	}
}

func TestTopCollectionTierWithoutRareSpecialsCannotTradeUp(t *testing.T) {
	schema := &Schema{
		items: map[uint32]itemDefinition{
			7: {Name: "weapon_ak47", ItemName: "#ak", ItemClass: "weapon_ak47"},
		},
		paintKits: map[uint32]paintKitDefinition{
			101: {Name: "top_finish", Description: "#finish", Rarity: "legendary"},
		},
		tokens: map[string]string{"ak": "AK-47", "finish": "Top Finish"},
		collections: map[string]collectionDefinition{
			"set_no_special": {
				Name:     "No Special Collection",
				Items:    []string{"[top_finish]weapon_ak47"},
				Rarities: map[string]string{"[top_finish]weapon_ak47": "ancient"},
			},
		},
		collectionByItem: map[string]string{"[top_finish]weapon_ak47": "set_no_special"},
	}

	metadata := schema.Metadata(7, 101, nil)
	if len(metadata.TradeUpItems) != 0 {
		t.Fatalf("top-tier trade-up outcomes = %#v, want none", metadata.TradeUpItems)
	}
}

func TestAppliedItemImagesUsesSteamDescriptionImages(t *testing.T) {
	images := appliedItemImages([]inventoryDescriptionLine{{Value: `<center><img src="https://steamcdn.example/apps/730/icons/econ/stickers/kawaii.png"><br>Sticker: Kawaii Killer</center>`}})
	if len(images) != 1 || images[0] != "https://steamcdn.example/apps/730/icons/econ/stickers/kawaii.png" {
		t.Fatalf("applied item images = %#v", images)
	}
}

func TestTradableAfterParsesSteamDescriptionTimestamp(t *testing.T) {
	got := tradableAfter([]inventoryDescriptionLine{{Value: "Tradable After Jul 21, 2026 (7:00:00) GMT"}})
	if got != "2026-07-21T07:00:00Z" {
		t.Fatalf("tradable after = %q", got)
	}
}
