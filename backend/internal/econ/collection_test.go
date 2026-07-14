package econ

import "testing"

func TestSchemaResolvesCollectionsAndContainerContents(t *testing.T) {
	root, err := parseKeyValues(`
"items_game"
{
  "items"
  {
    "7" { "name" "weapon_ak47" "item_name" "#AK47" "item_rarity" "rare" }
    "4001" { "name" "crate_test" "item_name" "#Crate" "item_class" "supply_crate" "loot_list_name" "crate_test_list" }
  }
  "paint_kits" { "101" { "name" "cu_test" "description_tag" "#TestFinish" } }
  "paint_kits_rarity" { "101" "mythical" }
  "item_sets" { "set_test" { "name" "#TestCollection" "items" { "[cu_test]weapon_ak47" "1" } } }
  "client_loot_lists"
  {
    "crate_test_list" { "nested_test_list" "1" }
    "nested_test_list" { "[cu_test]weapon_ak47" "1" }
  }
}`)
	if err != nil {
		t.Fatal(err)
	}
	localization, err := parseKeyValues(`"lang" { "Tokens" { "AK47" "AK-47" "Crate" "Test Case" "TestFinish" "Test Finish" "TestCollection" "The Test Collection" } }`)
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
	container := schema.Metadata(4001, 0, nil)
	if len(container.ContainerItems) != 1 || container.ContainerItems[0].MarketName != "AK-47 | Test Finish" {
		t.Fatalf("container contents = %#v", container.ContainerItems)
	}
}
