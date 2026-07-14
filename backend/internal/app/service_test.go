package app

import (
	"strings"
	"testing"

	"cs-inv-edit/backend/internal/econ"
	"cs-inv-edit/backend/internal/protocol"
	"cs-inv-edit/backend/internal/transport"
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
	if !settings.FeatureFlags.EnableArmoryRead {
		t.Fatal("expected Armory reads enabled by default")
	}
	if settings.FeatureFlags.EnableArmoryRedemption {
		t.Fatal("expected Armory purchases disabled by default")
	}
	receipt := service.RedeemArmory(map[string]any{})
	if receipt.State != "blocked_by_feature_flag" {
		t.Fatalf("expected blocked purchase, got %q", receipt.State)
	}
}

func TestDescriptionForGCItemDoesNotAssociateByName(t *testing.T) {
	description := econ.InventoryDescription{Name: "Loyalty Badge", MarketHashName: "Loyalty Badge", IconURL: "https://example.invalid/icon", Tradable: false}
	descriptions := map[string]econ.InventoryDescription{"name:loyalty badge": description}
	got, ok := descriptionForGCItem(descriptions, transport.GCInventoryItem{ID: 123}, econ.Metadata{Name: "Loyalty Badge", MarketName: "Loyalty Badge"})
	if ok {
		t.Fatalf("name-only description was associated with GC item: %#v", got)
	}
}

func TestInstanceMarketNameAddsExteriorForExactSkinIconLookup(t *testing.T) {
	wear := 0.02760651
	item := transport.GCInventoryItem{PaintWear: &wear}
	got := instanceMarketName("R8 Revolver | Blaze", item)
	if got != "R8 Revolver | Blaze (Factory New)" {
		t.Fatalf("instance market name = %q", got)
	}
	if exterior := paintExterior(&wear); exterior != "Factory New" {
		t.Fatalf("exterior = %q", exterior)
	}
}

func TestInventoryItemDiagnosticsIdentifiesSchemaOnlyGCItem(t *testing.T) {
	diagnostics := inventoryItemDiagnostics(
		transport.GCInventoryItem{ID: 123, OriginalID: 99, DefIndex: 36, Inventory: 7, Quantity: 0, Quality: 4, Rarity: 2, PaintKit: 0},
		econ.Metadata{Name: "P250", MarketName: "P250"},
		false,
		false,
		nil,
		nil,
	)
	joined := strings.Join(diagnostics, "\n")
	for _, want := range []string{"schema-only", "phantom or misclassified", "id=123", "original_id=99", "defindex=36", "quantity=0", `name="P250"`, "GC attributes: none decoded", "Steam market overlay: not used"} {
		if !strings.Contains(joined, want) {
			t.Fatalf("diagnostics %q do not contain %q", joined, want)
		}
	}
}

func TestInventoryItemDiagnosticsDescribeMatchedDescription(t *testing.T) {
	got := strings.Join(inventoryItemDiagnostics(transport.GCInventoryItem{ID: 123, DefIndex: 36}, econ.Metadata{Name: "P250"}, true, false, nil, nil), "\n")
	if !strings.Contains(got, "GC identity:") || !strings.Contains(got, "matched by GC asset id or original id") {
		t.Fatalf("matched item diagnostics = %q", got)
	}
}

func TestRevealAnimationsDefaultIndependently(t *testing.T) {
	settings := NewService().Settings()
	if settings.Animations.Container != "slot-machine" {
		t.Fatalf("container animation = %q", settings.Animations.Container)
	}
	if settings.Animations.TradeUp != "slot-machine" {
		t.Fatalf("trade-up animation = %q", settings.Animations.TradeUp)
	}
	if settings.Animations.Armory != "slot-machine" {
		t.Fatalf("Armory animation = %q", settings.Animations.Armory)
	}
}
