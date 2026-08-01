package transport

import (
	"testing"

	"cs-inv-edit/backend/internal/proto/gametracking"
	"cs-inv-edit/backend/internal/protocol"
)

func TestCS2ClientWelcomePublishesEquipSlots(t *testing.T) {
	equip, err := gametracking.Marshal("CSOEconEquipSlot", map[string]uint64{
		"account_id":      123,
		"class_id":        2,
		"slot_id":         14,
		"item_id":         456,
		"item_definition": 7,
	})
	if err != nil {
		t.Fatal(err)
	}
	welcome, err := gametracking.MarshalMessage("CMsgClientWelcome", map[string]any{
		"outofdate_subscribed_caches": []any{
			map[string]any{
				"objects": []any{
					map[string]any{
						"type_id":     int32(2),
						"object_data": []any{equip},
					},
				},
			},
		},
	})
	if err != nil {
		t.Fatal(err)
	}
	client := NewSteamGCClient()
	client.recordCS2State("received", protocol.AppIDCS2, protocol.EMsgGCClientWelcome, welcome)
	snapshot := client.CS2Features()
	if len(snapshot.EquipSlots) != 1 {
		t.Fatalf("equip slots = %#v", snapshot.EquipSlots)
	}
	slot := snapshot.EquipSlots[0]
	if slot.ClassID != 2 || slot.SlotID != 14 || slot.ItemID != "456" || slot.DefinitionID != 7 {
		t.Fatalf("equip slot = %#v", slot)
	}
}
