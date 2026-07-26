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
	for _, operation := range []string{"tf2.crafting.craft", "tf2.containers.open"} {
		mapping, ok := TF2OperationMapping(operation)
		if !ok || mapping.Verified || mapping.Protobuf || mapping.FeatureFlag == "" {
			t.Fatalf("unsafe TF2 mapping for %s: %#v", operation, mapping)
		}
	}
}
