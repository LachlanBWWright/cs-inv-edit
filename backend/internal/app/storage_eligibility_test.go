package app

import (
	"testing"
	"time"

	"cs-inv-edit/backend/internal/domain"
	"cs-inv-edit/backend/internal/transport"
)

func TestStorageEligibilityUsesAuthoritativeGCState(t *testing.T) {
	tests := []struct {
		name string
		item transport.GCInventoryItem
		dto  domain.InventoryItem
		want bool
	}{
		{name: "owned item", item: transport.GCInventoryItem{ID: 1}, dto: domain.InventoryItem{Kind: "weapon_skin"}, want: true},
		{name: "storage unit", item: transport.GCInventoryItem{ID: 1}, dto: domain.InventoryItem{Kind: "storage_unit"}},
		{name: "already contained", item: transport.GCInventoryItem{ID: 1, Attributes: map[uint32]uint32{272: 10}}, dto: domain.InventoryItem{Kind: "weapon_skin"}},
		{name: "active terminal", item: transport.GCInventoryItem{ID: 1}, dto: domain.InventoryItem{Kind: "container", IsActiveTerminal: true}},
		{name: "trade protected", item: transport.GCInventoryItem{ID: 1, Attributes: map[uint32]uint32{312: uint32(time.Now().Add(time.Hour).Unix())}}, dto: domain.InventoryItem{Kind: "weapon_skin"}},
		{name: "expired protection", item: transport.GCInventoryItem{ID: 1, Attributes: map[uint32]uint32{312: uint32(time.Now().Add(-time.Hour).Unix())}}, dto: domain.InventoryItem{Kind: "weapon_skin"}, want: true},
	}
	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			eligible, _ := storageEligibility(test.item, test.dto)
			if eligible != test.want {
				t.Fatalf("eligible=%t want=%t", eligible, test.want)
			}
		})
	}
}
