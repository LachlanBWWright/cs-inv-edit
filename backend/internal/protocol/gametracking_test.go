package protocol

import "testing"

func TestOperationMessageMappingIncludesStorageMutationMetadata(t *testing.T) {
	mapping, ok := OperationMessageMapping("storage.move-in")
	if !ok {
		t.Fatal("expected storage.move-in mapping")
	}
	if mapping.RequestEMsg != EMsgCasketItemAdd {
		t.Fatalf("expected request emsg %d, got %d", EMsgCasketItemAdd, mapping.RequestEMsg)
	}
	if mapping.RequestBody != "CMsgCasketItem" {
		t.Fatalf("expected request body CMsgCasketItem, got %q", mapping.RequestBody)
	}
	if mapping.FeatureFlag != "enableStorageMutations" {
		t.Fatalf("expected feature flag enableStorageMutations, got %q", mapping.FeatureFlag)
	}
}

func TestOperationMessageMappingIncludesContainerOpenMetadata(t *testing.T) {
	mapping, ok := OperationMessageMapping("containers.open")
	if !ok {
		t.Fatal("expected containers.open mapping")
	}
	if mapping.RequestEMsg != EMsgOpenCrate {
		t.Fatalf("expected request emsg %d, got %d", EMsgOpenCrate, mapping.RequestEMsg)
	}
	if mapping.RequestBody != "CMsgOpenCrate" {
		t.Fatalf("expected request body CMsgOpenCrate, got %q", mapping.RequestBody)
	}
	if len(mapping.ResponseEMsgs) != 2 {
		t.Fatalf("expected two response emsgs, got %d", len(mapping.ResponseEMsgs))
	}
}
