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
