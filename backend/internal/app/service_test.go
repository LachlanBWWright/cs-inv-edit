package app

import (
	"testing"
)

func TestValidateItemID(t *testing.T) {
	if _, err := ValidateItemID("2480000000000000000"); err != nil {
		t.Fatalf("expected valid item id: %v", err)
	}
	if _, err := ValidateItemID("abc"); err == nil {
		t.Fatalf("expected invalid decimal item id")
	}
}

func TestSubmitOperationBlockedByFeatureFlag(t *testing.T) {
	service := NewService()
	service.settings.EnableStorageMutations = false
	receipt, err := service.SubmitOperation("storage.move-in", map[string]any{"itemId": "2480000000000000000"})
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if receipt.State != "blocked_by_feature_flag" {
		t.Fatalf("expected blocked state, got %s", receipt.State)
	}
}

func TestSubmitOperationRequiresValidation(t *testing.T) {
	service := NewService()
	service.settings.EnableTradeups = true
	receipt, err := service.SubmitOperation("tradeups.execute", map[string]any{"itemIds": []any{"1", "2", "3", "4", "5", "6", "7", "8", "9"}})
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if receipt.State != "requires_validation" {
		t.Fatalf("expected requires_validation state, got %s", receipt.State)
	}
}
