package econ

import (
	"encoding/hex"
	"testing"
)

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

func TestApplyTF2QuestLocalizationResolvesContractDetails(t *testing.T) {
	definitions := map[uint32]TF2Definition{25000: {DefIndex: 25000, Name: "Quest25000"}}
	localization := `"lang" { "Tokens" { "quest25000name0" "Scout Contract" "quest25000desc0" "Complete Scout tasks." "quest25000objectivedesc0" "Score points as Scout: %s1" "quest25000objectivedesc2" "Capture an objective: %s1" } }`
	if err := ApplyTF2QuestLocalization(definitions, localization); err != nil {
		t.Fatalf("apply quest localization: %v", err)
	}
	definition := definitions[25000]
	if definition.Name != "Scout Contract" || definition.Description != "Complete Scout tasks." {
		t.Fatalf("definition = %#v", definition)
	}
	if len(definition.QuestObjectives) != 2 || definition.QuestObjectives[0] != "Score points as Scout: " {
		t.Fatalf("objectives = %#v", definition.QuestObjectives)
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

func TestParseTF2DefinitionsResolvesContainerContentsWithoutInventingOdds(t *testing.T) {
	items := `"items_game" {
		"prefabs" { "crate" { "item_class" "supply_crate" "equip_conflicts" { "whole_head" "1" } "item_slot_per_class" { "scout" "head" } } }
		"items" {
			"1" { "name" "demo_weapon" "item_name" "#Weapon" "item_class" "tf_weapon_demo" "item_rarity" "rare" }
			"2" { "name" "demo_hat" "item_name" "#Hat" "item_class" "tf_wearable" "item_rarity" "mythical" }
			"100" { "name" "demo_crate" "item_name" "#Crate" "prefab" "crate" "attributes" { "set supply crate series" "42" } }
		}
		"client_loot_lists" { "demo_nested" { "demo_hat" "1" } "demo_list" { "demo_weapon" "1" "demo_nested" "1" "unknown_future_entry" "1" } }
		"revolving_loot_lists" { "demo_list" "42" }
	}`
	english := `"lang" { "Tokens" { "Weapon" "Demo Weapon" "Hat" "Demo Hat" "Crate" "Demo Crate" } }`
	definitions, err := ParseTF2Definitions(items, english)
	if err != nil {
		t.Fatal(err)
	}
	crate := definitions[100]
	if len(crate.ContainerItems) != 3 {
		t.Fatalf("container items = %#v", crate.ContainerItems)
	}
	if crate.ContainerItems[0].Name != "Demo Hat" || crate.ContainerItems[0].Rarity != "mythical" || crate.ContainerItems[0].PoolKind != "primary" {
		t.Fatalf("resolved nested item = %#v", crate.ContainerItems[0])
	}
	if crate.ContainerItems[2].PoolKind != "unresolved" {
		t.Fatalf("unknown entry must remain explicit: %#v", crate.ContainerItems[2])
	}
	if len(crate.EquipConflicts) != 1 || crate.LoadoutSlots["scout"] != "head" || len(crate.PrefabChain) != 1 || crate.PrefabChain[0] != "crate" {
		t.Fatalf("inherited read-only metadata = %#v", crate)
	}
}

func TestClassifyTF2DefinitionIncludesReadOnlyToolKinds(t *testing.T) {
	tests := map[string]string{
		classifyTF2Definition("tf_wearable", "paint_can"):          "paint_can",
		classifyTF2Definition("tool", "decoder_ring"):              "tool",
		classifyTF2Definition("tool", "strangifier"):               "strangifier",
		classifyTF2Definition("tool", "killstreakifier"):           "killstreak_kit",
		classifyTF2Definition("tf_wearable", "taunt_unusualifier"): "taunt",
	}
	for got, want := range tests {
		if got != want {
			t.Fatalf("classification = %q, want %q", got, want)
		}
	}
}

func TestDecodeTF2AttributesUsesSchemaTypes(t *testing.T) {
	definitions := map[uint32]TF2AttributeDefinition{
		134: {DefIndex: 134, Name: "attach particle effect", DescriptionFormat: "value_is_particle_index", ValueNames: map[uint32]string{57: "Unusual Zap Green"}},
		211: {DefIndex: 211, Name: "tradable after date", DescriptionFormat: "value_is_date", StoredAsInteger: true},
		500: {DefIndex: 500, Name: "custom name attr", AttributeType: "string"},
		501: {DefIndex: 501, Name: "custom desc attr", AttributeType: "string"},
		519: {DefIndex: 519, Name: "particle effect vertical offset"},
		520: {DefIndex: 520, Name: "particle effect use head origin", AttributeClass: "particle_effect_use_head_origin", StoredAsInteger: true},
	}
	decodeHex := func(value string) []byte {
		decoded, err := hex.DecodeString(value)
		if err != nil {
			t.Fatal(err)
		}
		return decoded
	}
	decoded := DecodeTF2Attributes(
		map[uint32]uint32{134: 1113849856, 211: 1745218800, 500: 1752502026, 501: 1953045258, 519: 1090519040, 520: 1065353216},
		map[uint32][]byte{500: decodeHex("0a0f75686d2c2061636b636875616c6c79"), 501: decodeHex("0a1b69742773206672616e6b656e737465696e2773204d4f4e53544552")},
		definitions,
	)
	wants := map[uint32]string{134: "Unusual Zap Green (effect #57)", 211: "21 Apr 2025, 07:00 UTC", 500: "uhm, ackchually", 501: "it's frankenstein's MONSTER", 519: "8", 520: "Enabled"}
	for _, attribute := range decoded {
		if want := wants[attribute.DefIndex]; attribute.Value != want {
			t.Errorf("attribute %d = %q, want %q", attribute.DefIndex, attribute.Value, want)
		}
	}
}
