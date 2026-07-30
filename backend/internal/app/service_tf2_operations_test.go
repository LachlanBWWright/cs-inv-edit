package app

import (
	"encoding/json"
	"testing"
	"time"

	"cs-inv-edit/backend/internal/domain"
	"cs-inv-edit/backend/internal/operations"
	"cs-inv-edit/backend/internal/proto/tf2tracking"
	"cs-inv-edit/backend/internal/proto/tracking"
	"cs-inv-edit/backend/internal/protocol"
	"cs-inv-edit/backend/internal/transport"
)

func TestTF2PermanentOperationsAreBackendBlockedByDefault(t *testing.T) {
	service := NewService()
	for _, operation := range []string{
		"tf2.crafting.craft",
		"tf2.containers.open",
		"tf2.items.use",
		"tf2.tools.strange-part",
		"tf2.tools.strange-restriction",
		"tf2.tools.strange-transfer",
		"tf2.tools.strange-remove",
		"tf2.tools.strange-reset",
	} {
		receipt := service.SubmitOperation(operation, map[string]any{})
		if receipt.State != operations.StateBlockedByFeatureFlag {
			t.Fatalf("%s state = %q, want blocked_by_feature_flag", operation, receipt.State)
		}
	}
}

func TestTF2LegacyPermanentOperationCannotSendEvenWhenFlagEnabled(t *testing.T) {
	for _, test := range []struct {
		name      string
		operation string
		enable    func(*domain.FeatureFlags)
	}{
		{name: "unboxing", operation: "tf2.containers.open", enable: func(flags *domain.FeatureFlags) { flags.EnableTF2Unboxing = true }},
		{name: "crafting", operation: "tf2.crafting.craft", enable: func(flags *domain.FeatureFlags) { flags.EnableTF2Crafting = true }},
	} {
		t.Run(test.name, func(t *testing.T) {
			service := NewService()
			client := transport.NewTestGCClient()
			service.gcClient = client
			settings := service.Settings()
			test.enable(&settings.FeatureFlags)
			service.UpdateSettings(settings)
			receipt := service.SubmitOperation(test.operation, map[string]any{"itemId": "1", "itemIds": []any{"1"}})
			if receipt.State != operations.StateBlockedByFeatureFlag {
				t.Fatalf("state = %q, want blocked_by_feature_flag", receipt.State)
			}
			if len(client.SentProtoMessages) != 0 {
				t.Fatalf("capture-gated %s reached the GC transport", test.name)
			}
		})
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
	if receipt.State != operations.StateAwaitingGCConfirmation {
		t.Fatalf("receipt = %#v", receipt)
	}
	if len(client.SentProtoMessages) != 1 {
		t.Fatalf("sent messages = %d", len(client.SentProtoMessages))
	}
	sent := client.SentProtoMessages[0]
	if sent.AppID != protocol.AppIDTF2 || sent.EMsg != protocol.TF2EMsgApplyStrangePart {
		t.Fatalf("sent message = %#v", sent)
	}
	decoded, err := tf2tracking.UnmarshalMessage("CMsgApplyStrangePart", sent.Body)
	if err != nil {
		t.Fatal(err)
	}
	if tracking.Uint(decoded, "strange_part_item_id") != 11 || tracking.Uint(decoded, "item_item_id") != 22 {
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
	if receipt.State != operations.StateFailed || len(client.SentProtoMessages) != 0 {
		t.Fatalf("unsafe receipt=%#v sends=%d", receipt, len(client.SentProtoMessages))
	}
}

func TestTF2PermanentOperationRequiresExplicitConfirmationInValidationMode(t *testing.T) {
	service := NewService()
	service.connection = domain.ConnectionStatus{State: "connected", SteamID: "7656119"}
	service.settings.FeatureFlags.EnableTF2ItemUse = true
	receipt := service.SubmitOperation("tf2.items.use", map[string]any{"game": "tf2", "itemId": "11"})
	if receipt.State != operations.StateRequiresValidation {
		t.Fatalf("receipt = %#v", receipt)
	}
}

func TestTF2ExtensionEncodersMatchAuthoritativeFields(t *testing.T) {
	body, items, err := encodeTF2Operation("tf2.loadout.set-preset-item", map[string]any{
		"itemId": "99", "classId": float64(3), "presetId": float64(2), "slotId": float64(7),
	})
	if err != nil {
		t.Fatal(err)
	}
	decoded, err := tf2tracking.DecodeMessageJSON("CMsgSetPresetItemPosition", body)
	if err != nil {
		t.Fatal(err)
	}
	var preset map[string]any
	if err := json.Unmarshal(decoded, &preset); err != nil {
		t.Fatal(err)
	}
	if preset["class_id"] != float64(3) || preset["preset_id"] != float64(2) || preset["slot_id"] != float64(7) || preset["item_id"] != "99" || len(items) != 1 || items[0] != 99 {
		t.Fatalf("preset=%#v items=%v", preset, items)
	}

	body, _, err = encodeTF2Operation("tf2.inspect.resolve", map[string]any{
		"paramS": "76561198000000000", "paramA": "123", "paramD": "456",
	})
	if err != nil {
		t.Fatal(err)
	}
	decoded, err = tf2tracking.DecodeMessageJSON("CMsgGC_Client2GCEconPreviewDataBlockRequest", body)
	if err != nil {
		t.Fatal(err)
	}
	var inspect map[string]any
	if err := json.Unmarshal(decoded, &inspect); err != nil {
		t.Fatal(err)
	}
	if inspect["param_s"] != "76561198000000000" || inspect["param_a"] != "123" || inspect["param_d"] != "456" {
		t.Fatalf("inspect=%#v", inspect)
	}
}

func TestTF2InspectRequiresCompleteParameters(t *testing.T) {
	if _, _, err := encodeTF2Operation("tf2.inspect.resolve", map[string]any{"paramA": "1"}); err == nil {
		t.Fatal("incomplete inspect parameters were accepted")
	}
}

func TestTF2InspectParsesSteamActionWithoutManualIDs(t *testing.T) {
	body, _, err := encodeTF2Operation("tf2.inspect.resolve", map[string]any{
		"inspectUrl": "steam://rungame/440/76561202255233023/+tf_econ_item_preview%20S76561198000000000A123D456",
	})
	if err != nil {
		t.Fatal(err)
	}
	decoded, err := tf2tracking.DecodeMessageJSON("CMsgGC_Client2GCEconPreviewDataBlockRequest", body)
	if err != nil {
		t.Fatal(err)
	}
	var inspect map[string]any
	if err := json.Unmarshal(decoded, &inspect); err != nil {
		t.Fatal(err)
	}
	if inspect["param_s"] != "76561198000000000" || inspect["param_a"] != "123" || inspect["param_d"] != "456" {
		t.Fatalf("inspect=%#v", inspect)
	}
}

func TestTF2LoadoutReceiptCompletesOnlyAfterMatchingAuthoritativeState(t *testing.T) {
	service := NewService()
	client := transport.NewTestGCClient()
	service.gcClient = client
	service.connection = domain.ConnectionStatus{State: "connected", SteamID: "7656119"}
	service.settings.FeatureFlags.EnableTF2Loadouts = true
	service.gameInventories[gameInventoryKey("7656119", "tf2")] = domain.GameInventorySnapshot{
		Game: "tf2", AppID: protocol.AppIDTF2, Status: "ready",
		Items: []domain.EconomyInventoryItem{{Game: "tf2", AppID: protocol.AppIDTF2, AssetID: "99"}},
	}
	receipt := service.SubmitOperation("tf2.loadout.set-preset-item", map[string]any{
		"game": "tf2", "itemId": "99", "classId": float64(3), "presetId": float64(2), "slotId": float64(7),
	})
	if receipt.State != operations.StateAwaitingGCConfirmation {
		t.Fatalf("receipt=%#v", receipt)
	}
	client.TF2FeatureResult = transport.TF2FeatureSnapshot{
		Status: "ready", RefreshedAt: time.Now().UTC().Format(time.RFC3339Nano),
		PresetItems: []transport.TF2PresetItem{{ClassID: 3, PresetID: 2, SlotID: 7, ItemID: "98"}},
	}
	service.TF2Features()
	if state := latestOperationState(service.Operations(), receipt.OperationID); state != operations.StateAwaitingGCConfirmation {
		t.Fatalf("mismatched state completed receipt: %q", state)
	}
	client.TF2FeatureResult.PresetItems[0].ItemID = "99"
	service.TF2Features()
	if state := latestOperationState(service.Operations(), receipt.OperationID); state != operations.StateCompleted {
		t.Fatalf("matching state did not complete receipt: %q", state)
	}
}

func latestOperationState(receipts []operations.Receipt, operationID string) operations.State {
	var state operations.State
	for _, receipt := range receipts {
		if receipt.OperationID == operationID {
			state = receipt.State
		}
	}
	return state
}
