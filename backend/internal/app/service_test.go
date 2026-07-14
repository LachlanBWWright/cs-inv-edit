package app

import (
	"testing"

	"cs-inv-edit/backend/internal/protocol"
)

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

func TestSubmitOperationAttachesGametrackingMessageMetadata(t *testing.T) {
	service := NewService()
	service.SubmitOperation("settings", map[string]any{
		"validationMode": false,
		"featureFlags": map[string]any{
			"enableNameTags": true,
		},
	})

	receipt := service.SubmitOperation("nametags.apply", map[string]any{})
	result, ok := receipt.Result.(map[string]any)
	if !ok {
		t.Fatalf("expected receipt result map, got %T", receipt.Result)
	}
	if got := result["requestBody"]; got != "CMsgSetItemName" {
		t.Fatalf("expected requestBody CMsgSetItemName, got %#v", got)
	}
	if got := result["featureFlag"]; got != "enableNameTags" {
		t.Fatalf("expected featureFlag enableNameTags, got %#v", got)
	}
	if got, ok := result["requestEmsg"].(uint32); !ok || got != protocol.EMsgSetItemName {
		t.Fatalf("expected requestEmsg %d, got %#v", protocol.EMsgSetItemName, result["requestEmsg"])
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

func TestArmoryReadEnabledAndPurchasesDisabledByDefault(t *testing.T) {
	service := NewService()
	settings := service.Settings()
	if !settings.FeatureFlags.EnableArmoryRead { t.Fatal("expected Armory reads enabled by default") }
	if settings.FeatureFlags.EnableArmoryRedemption { t.Fatal("expected Armory purchases disabled by default") }
	receipt := service.RedeemArmory(map[string]any{})
	if receipt.State != "blocked_by_feature_flag" { t.Fatalf("expected blocked purchase, got %q", receipt.State) }
}
