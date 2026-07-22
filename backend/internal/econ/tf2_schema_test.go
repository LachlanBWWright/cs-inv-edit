package econ

import "testing"

func TestParseTF2DefinitionsMergesPrefabAndLocalization(t *testing.T) {
	items := `"items_game" { "prefabs" { "hat" { "item_type_name" "#Type_Hat" "item_slot" "head" "item_quality" "unique" "used_by_classes" { "scout" "1" } } } "items" { "42" { "name" "demo_hat" "prefab" "hat" "item_name" "#Item_Demo_Hat" } } }`
	english := `"lang" { "Tokens" { "Type_Hat" "Cosmetic Item" "Item_Demo_Hat" "Demo Hat" } }`
	definitions, err := ParseTF2Definitions(items, english)
	if err != nil {
		t.Fatal(err)
	}
	definition := definitions[42]
	if definition.Name != "Demo Hat" || definition.Type != "Cosmetic Item" || definition.Slot != "head" || definition.Quality != "unique" || len(definition.UsedByClass) != 1 || definition.UsedByClass[0] != "scout" {
		t.Fatalf("definition = %#v", definition)
	}
}

func TestParseTF2DefinitionsPreservesOperationMetadata(t *testing.T) {
	items := `"items_game" {
		"prefabs" { "crate" { "item_class" "supply_crate" "craft_class" "supply_crate" "equip_regions" { "medal" "1" } "capabilities" { "can_trade" "1" } } }
		"items" { "5022" { "name" "demo_crate" "prefab" "crate" "item_name" "#Crate" "item_description" "#CrateDesc" "min_ilevel" "10" "max_ilevel" "20" "propername" "1" "tags" { "is_supply_crate" "1" } "attributes" { "set supply crate series" { "value" "42" } } } }
		"item_collections" { "demo_collection" { "items" { "demo_crate" "1" } } }
	}`
	english := `"lang" { "Tokens" { "Crate" "Demo Crate" "CrateDesc" "Contains demo items" } }`
	definitions, err := ParseTF2Definitions(items, english)
	if err != nil {
		t.Fatal(err)
	}
	definition := definitions[5022]
	if definition.ItemKind != "container" || definition.ItemClass != "supply_crate" || definition.Collection != "demo_collection" {
		t.Fatalf("classification = %#v", definition)
	}
	if definition.Description != "Contains demo items" || definition.MinLevel != 10 || definition.MaxLevel != 20 || !definition.ProperName {
		t.Fatalf("presentation metadata = %#v", definition)
	}
	if definition.StaticAttributes["set supply crate series"] != "42" || len(definition.EquipRegions) != 1 || len(definition.Tags) != 1 {
		t.Fatalf("operation metadata = %#v", definition)
	}
}
