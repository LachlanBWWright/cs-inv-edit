package app

import (
	"testing"

	"cs-inv-edit/backend/internal/domain"
	multigamepb "cs-inv-edit/backend/internal/proto/generated/multigamepb"
	"cs-inv-edit/backend/internal/protocol"
	"cs-inv-edit/backend/internal/transport"
	"google.golang.org/protobuf/proto"
)

func TestTF2PermanentOperationsAreBackendBlockedByDefault(t *testing.T) {
	service := NewService()
	for _, operation := range []string{"tf2.crafting.craft", "tf2.containers.open", "tf2.items.use", "tf2.tools.strange-part"} {
		receipt := service.SubmitOperation(operation, map[string]any{})
		if receipt.State != "blocked_by_feature_flag" {
			t.Fatalf("%s state = %q, want blocked_by_feature_flag", operation, receipt.State)
		}
	}
}

func TestTF2LegacyPermanentOperationCannotSendEvenWhenFlagEnabled(t *testing.T) {
	service := NewService()
	client := transport.NewTestGCClient()
	service.gcClient = client
	settings := service.Settings()
	settings.FeatureFlags.EnableTF2Unboxing = true
	service.UpdateSettings(settings)
	receipt := service.SubmitOperation("tf2.containers.open", map[string]any{"itemId": "1"})
	if receipt.State != "blocked_by_feature_flag" {
		t.Fatalf("state = %q, want blocked_by_feature_flag", receipt.State)
	}
	if len(client.SentProtoMessages) != 0 {
		t.Fatal("capture-gated unboxing reached the GC transport")
	}
}

func TestTF2StrangePartUsesAppIDScopedAuthoritativeProtobuf(t *testing.T) {
	service := NewService()
	client := transport.NewTestGCClient()
	service.gcClient = client
	service.connection = domain.ConnectionStatus{State: "connected", SteamID: "7656119"}
	service.settings.FeatureFlags.EnableTF2Tools = true
	service.settings.ValidationMode = false
	service.gameInventories[gameInventoryKey("7656119", "tf2")] = domain.GameInventorySnapshot{
		Game: "tf2", AppID: protocol.AppIDTF2, Status: "ready",
		Items: []domain.EconomyInventoryItem{{Game: "tf2", AppID: protocol.AppIDTF2, AssetID: "11"}, {Game: "tf2", AppID: protocol.AppIDTF2, AssetID: "22"}},
	}
	receipt := service.SubmitOperation("tf2.tools.strange-part", map[string]any{"toolItemId": "11", "targetItemId": "22"})
	if receipt.State != "awaiting_gc_confirmation" {
		t.Fatalf("receipt = %#v", receipt)
	}
	if len(client.SentProtoMessages) != 1 {
		t.Fatalf("sent messages = %d", len(client.SentProtoMessages))
	}
	sent := client.SentProtoMessages[0]
	if sent.AppID != protocol.AppIDTF2 || sent.EMsg != protocol.TF2EMsgApplyStrangePart {
		t.Fatalf("sent message = %#v", sent)
	}
	decoded := new(multigamepb.CMsgApplyStrangePart)
	if err := proto.Unmarshal(sent.Body, decoded); err != nil {
		t.Fatal(err)
	}
	if decoded.GetStrangePartItemId() != 11 || decoded.GetItemItemId() != 22 {
		t.Fatalf("decoded = %#v", decoded)
	}
}

func TestTF2OperationRejectsCommunityOnlyItem(t *testing.T) {
	service := NewService()
	client := transport.NewTestGCClient()
	service.gcClient = client
	service.connection = domain.ConnectionStatus{State: "connected", SteamID: "7656119"}
	service.settings.FeatureFlags.EnableTF2Tools = true
	service.settings.ValidationMode = false
	service.gameInventories[gameInventoryKey("7656119", "tf2")] = domain.GameInventorySnapshot{Game: "tf2", AppID: protocol.AppIDTF2, Status: "ready", Items: []domain.EconomyInventoryItem{{Game: "tf2", AppID: protocol.AppIDTF2, AssetID: "11"}}}
	receipt := service.SubmitOperation("tf2.tools.strange-part", map[string]any{"toolItemId": "11", "targetItemId": "22"})
	if receipt.State != "failed" || len(client.SentProtoMessages) != 0 {
		t.Fatalf("unsafe receipt=%#v sends=%d", receipt, len(client.SentProtoMessages))
	}
}

func TestTF2PermanentOperationRequiresExplicitConfirmationInValidationMode(t *testing.T) {
	service := NewService()
	service.connection = domain.ConnectionStatus{State: "connected", SteamID: "7656119"}
	service.settings.FeatureFlags.EnableTF2ItemUse = true
	receipt := service.SubmitOperation("tf2.items.use", map[string]any{"game": "tf2", "itemId": "11"})
	if receipt.State != "requires_validation" {
		t.Fatalf("receipt = %#v", receipt)
	}
}
