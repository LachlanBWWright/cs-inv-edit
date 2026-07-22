package protocol

import "testing"

func TestTF2PermanentLegacyOperationsRemainUnverified(t *testing.T) {
	for _, operation := range []string{"tf2.crafting.craft", "tf2.containers.open"} {
		mapping, ok := TF2OperationMapping(operation)
		if !ok || mapping.Verified || mapping.Protobuf || mapping.FeatureFlag == "" {
			t.Fatalf("unsafe TF2 mapping for %s: %#v", operation, mapping)
		}
	}
}
