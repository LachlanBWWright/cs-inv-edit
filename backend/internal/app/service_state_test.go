package app

import (
	"testing"

	"cs-inv-edit/backend/internal/domain"
)

func TestNewServicesDoNotShareMutableSnapshots(t *testing.T) {
	first := NewService()
	second := NewService()

	first.events[0].Message = "changed in first service"
	first.gameInventories["tf2"] = emptyGameInventory("tf2", 440)
	first.purchaseSessions["purchase-1"] = domain.PurchaseSession{ID: "purchase-1"}

	if second.events[0].Message == "changed in first service" {
		t.Fatal("service event state is shared between instances")
	}
	if _, ok := second.gameInventories["tf2"]; ok {
		t.Fatal("game inventory state is shared between instances")
	}
	if _, ok := second.purchaseSessions["purchase-1"]; ok {
		t.Fatal("purchase session state is shared between instances")
	}
}

func TestEventsReturnsAnIndependentSlice(t *testing.T) {
	service := NewService()
	visible := service.Events()
	visible[0].Message = "mutated response"

	if service.Events()[0].Message == "mutated response" {
		t.Fatal("mutating an event response changed service state")
	}
}
