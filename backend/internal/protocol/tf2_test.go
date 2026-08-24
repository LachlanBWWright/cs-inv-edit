package protocol

import "testing"

func TestTF2ExtensionMappingsUseAuthoritativeMessageIDs(t *testing.T) {
	expected := map[string]uint32{
		"tf2.loadout.set-preset-item": 1064,
		"tf2.loadout.select-preset":   1063,
		"tf2.tools.strange-remove":    1073,
		"tf2.tools.strange-reset":     1074,
		"tf2.matches.load":            6526,
		"tf2.inspect.resolve":         6402,
		"tf2.market.refresh":          1080,
	}
	for operation, emsg := range expected {
		mapping, ok := TF2OperationMapping(operation)
		if !ok || !mapping.Verified || !mapping.Protobuf || mapping.EMsg != emsg {
			t.Fatalf("%s mapping=%#v ok=%t, want verified protobuf EMsg %d", operation, mapping, ok, emsg)
		}
	}
}

func TestTF2PermanentLegacyOperationsRemainUnverified(t *testing.T) {
	for _, operation := range []string{"tf2.containers.open"} {
		mapping, ok := TF2OperationMapping(operation)
		if !ok || mapping.Verified || mapping.Protobuf || mapping.FeatureFlag == "" {
			t.Fatalf("unsafe TF2 mapping for %s: %#v", operation, mapping)
		}
	}
}

func TestTF2CraftingUsesTheLegacyCraftMessage(t *testing.T) {
	mapping, ok := TF2OperationMapping("tf2.crafting.craft")
	if !ok || mapping.EMsg != TF2EMsgCraft || mapping.Protobuf || !mapping.Verified || mapping.FeatureFlag != "enableTf2Crafting" {
		t.Fatalf("unexpected TF2 crafting mapping: %#v, ok=%t", mapping, ok)
	}
}
