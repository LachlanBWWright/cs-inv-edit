package app

import (
	"testing"

	"cs-inv-edit/backend/internal/domain"
)

func TestOpenCrateMessageOmitsToolForKeylessContainer(t *testing.T) {
	message := openCrateMessage(101, 0, nil, nil)
	if message.SubjectItemId == nil || message.GetSubjectItemId() != 101 {
		t.Fatalf("subject item id = %#v, want 101", message.SubjectItemId)
	}
	if message.ToolItemId != nil {
		t.Fatalf("keyless tool item id = %#v, want omitted", message.ToolItemId)
	}
}

func TestOpenCrateMessageIncludesKeyForKeyedContainer(t *testing.T) {
	message := openCrateMessage(101, 202, nil, nil)
	if message.SubjectItemId == nil || message.GetSubjectItemId() != 101 {
		t.Fatalf("subject item id = %#v, want 101", message.SubjectItemId)
	}
	if message.ToolItemId == nil || message.GetToolItemId() != 202 {
		t.Fatalf("keyed tool item id = %#v, want 202", message.ToolItemId)
	}
}

func TestOpenCrateMessageIncludesTerminalOfferState(t *testing.T) {
	pointsRemaining, volatileLimit := uint32(4), uint32(2500)
	message := openCrateMessage(101, 0, &pointsRemaining, &volatileLimit)
	if message.PointsRemaining == nil || message.GetPointsRemaining() != 4 {
		t.Fatalf("points remaining = %#v, want 4", message.PointsRemaining)
	}
	if message.VolatileLimit == nil || message.GetVolatileLimit() != 2500 {
		t.Fatalf("volatile limit = %#v, want 2500", message.VolatileLimit)
	}
}

func TestActiveTerminalNextOfferUsesTerminalAsToolAndSubject(t *testing.T) {
	pointsRemaining := uint32(3)
	message := openCrateMessage(52994080407, 52994080407, &pointsRemaining, nil)
	if message.GetSubjectItemId() != 52994080407 || message.GetToolItemId() != 52994080407 || message.GetPointsRemaining() != 3 {
		t.Fatalf("active terminal next-offer message = %#v", message)
	}
}

func TestTerminalActivationCanReconcileAnInPlaceItemTransformation(t *testing.T) {
	defIndexBefore, defIndexAfter := uint32(5001), uint32(5002)
	before := domain.InventorySnapshot{Items: []domain.InventoryItem{{
		ID: "101", Name: "Sealed Genesis Terminal", MarketName: "Sealed Genesis Terminal", Defindex: &defIndexBefore,
	}}}
	after := domain.InventorySnapshot{Items: []domain.InventoryItem{{
		ID: "101", Name: "Active Genesis Terminal", MarketName: "Active Genesis Terminal", Defindex: &defIndexAfter,
	}}}
	transitioned := firstChangedTerminalItem(before, after)
	if transitioned == nil || transitioned.Name != "Active Genesis Terminal" {
		t.Fatalf("terminal transition = %#v", transitioned)
	}
}
