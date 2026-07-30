package app

import (
	"encoding/json"
	"testing"

	"cs-inv-edit/backend/internal/domain"
	"cs-inv-edit/backend/internal/operations"
	"cs-inv-edit/backend/internal/proto/gametracking"
	"cs-inv-edit/backend/internal/protocol"
	"cs-inv-edit/backend/internal/transport"
)

func TestCS2LoadoutMutationIsBlockedByDefault(t *testing.T) {
	service := NewService()
	client := transport.NewTestGCClient()
	service.gcClient = client
	receipt := service.SubmitOperation("cs2.loadout.set", map[string]any{
		"game": "cs2", "itemId": "99", "classId": float64(2), "slotId": float64(1),
	})
	if receipt.State != operations.StateBlockedByFeatureFlag {
		t.Fatalf("receipt=%#v", receipt)
	}
	if len(client.SentProtoMessages) != 0 {
		t.Fatal("default-off CS2 loadout mutation reached the GC")
	}
}

func TestCS2LoadoutUsesDirectGameTrackingMessage(t *testing.T) {
	service := NewService()
	client := transport.NewTestGCClient()
	service.gcClient = client
	service.connection = domain.ConnectionStatus{State: "connected", SteamID: "76561198000000000"}
	service.settings.FeatureFlags.EnableCS2Loadouts = true
	service.inventory = domain.InventorySnapshot{Items: []domain.InventoryItem{{ID: "99"}}}
	receipt := service.SubmitOperation("cs2.loadout.set", map[string]any{
		"game": "cs2", "itemId": "99", "classId": float64(2), "slotId": float64(7),
	})
	if receipt.State != operations.StateAwaitingGCConfirmation {
		t.Fatalf("receipt=%#v", receipt)
	}
	if len(client.SentProtoMessages) != 1 || client.SentProtoMessages[0].AppID != protocol.AppIDCS2 {
		t.Fatalf("messages=%#v", client.SentProtoMessages)
	}
	decoded, err := gametracking.DecodeMessageJSON("CMsgAdjustEquipSlots", client.SentProtoMessages[0].Body)
	if err != nil {
		t.Fatal(err)
	}
	var value map[string]any
	if err := json.Unmarshal(decoded, &value); err != nil {
		t.Fatal(err)
	}
	slots, _ := value["slots"].([]any)
	slot, _ := slots[0].(map[string]any)
	if slot["class_id"] != float64(2) || slot["slot_id"] != float64(7) || slot["item_id"] != "99" {
		t.Fatalf("decoded=%#v", value)
	}
}

func TestCS2InspectRejectsManualOrMalformedInput(t *testing.T) {
	if _, _, err := encodeCS2FeatureOperation("cs2.inspect.resolve", map[string]any{"paramA": "1"}, "76561198000000000"); err == nil {
		t.Fatal("CS2 inspect accepted manual protocol parameters")
	}
}
