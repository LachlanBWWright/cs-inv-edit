package app

import "testing"

func TestSubmitOperationBlocksNameTagsByDefault(t *testing.T) {
	service := NewService()
	receipt := service.SubmitOperation("nametags.apply", map[string]any{})
	if receipt.State != "blocked_by_feature_flag" {
		t.Fatalf("expected blocked_by_feature_flag, got %q", receipt.State)
	}
}

func TestSubmitOperationAllowsNameTagsWhenEnabled(t *testing.T) {
	service := NewService()
	service.SubmitOperation("settings", map[string]any{
		"validationMode": false,
		"featureFlags": map[string]any{
			"enableNameTags": true,
		},
	})

	receipt := service.SubmitOperation("nametags.apply", map[string]any{})
	if receipt.State != "awaiting_gc_confirmation" {
		t.Fatalf("expected awaiting_gc_confirmation, got %q", receipt.State)
	}
}

func TestSubmitOperationBlocksItemDeletionWhenDisabled(t *testing.T) {
	service := NewService()
	receipt := service.SubmitOperation("items.delete", map[string]any{})
	if receipt.State != "blocked_by_feature_flag" {
		t.Fatalf("expected blocked_by_feature_flag, got %q", receipt.State)
	}
}

func TestNewServiceStartsWithEmptyInventoryUntilConnected(t *testing.T) {
	service := NewService()
	inventory := service.Inventory()
	if inventory.Status != "requires_connection" {
		t.Fatalf("expected requires_connection status, got %q", inventory.Status)
	}
	if len(inventory.Items) != 0 {
		t.Fatalf("expected no inventory items before connection, got %d", len(inventory.Items))
	}
}

func TestRefreshInventoryRequiresConnection(t *testing.T) {
	service := NewService()
	receipt := service.RefreshInventory()
	if receipt.State != "requires_connection" {
		t.Fatalf("expected requires_connection, got %q", receipt.State)
	}
}
