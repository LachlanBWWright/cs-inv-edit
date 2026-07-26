package app

import (
	"testing"

	"cs-inv-edit/backend/internal/domain"
	"cs-inv-edit/backend/internal/transport"
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

func TestVirtualItemBelongsToTerminalRequiresExactCasketID(t *testing.T) {
	terminalID := uint64(52994080407)
	exact := transport.GCVirtualEconItem{
		ID: 1,
		Attributes: map[uint32]uint32{
			272: uint32(terminalID),
			273: uint32(terminalID >> 32),
		},
	}
	if !virtualItemBelongsToTerminal(exact, terminalID) {
		t.Fatal("exact casket-id attributes were not matched")
	}

	sameLowOnly := transport.GCVirtualEconItem{
		ID:        2,
		Inventory: 0,
		Attributes: map[uint32]uint32{
			272: uint32(terminalID),
			273: uint32(terminalID>>32) + 1,
		},
	}
	if virtualItemBelongsToTerminal(sameLowOnly, terminalID) {
		t.Fatal("partial casket-id match was accepted")
	}
}

func TestRankedTerminalVirtualCandidatesPrefersPricedNewestOffer(t *testing.T) {
	candidates := map[uint64]transport.GCVirtualEconItem{
		100: {ID: 100, Attributes: map[uint32]uint32{316: 95}},
		300: {ID: 300, Attributes: map[uint32]uint32{}},
		200: {ID: 200, Attributes: map[uint32]uint32{316: 95}},
	}
	ranked := rankedTerminalVirtualCandidates(candidates)
	if len(ranked) != 3 || ranked[0].ID != 200 || ranked[1].ID != 100 || ranked[2].ID != 300 {
		t.Fatalf("candidate ranking = %#v", ranked)
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

func TestContainerOpenResultKinds(t *testing.T) {
	ordinaryResult := containerOpenResult{Kind: "inventory_award", OpenedItem: &domain.InventoryItem{ID: "500", Name: "AK-47 | Redline"}}
	if ordinaryResult.Kind != "inventory_award" || ordinaryResult.OpenedItem == nil {
		t.Fatalf("ordinary result kind = %s, want inventory_award", ordinaryResult.Kind)
	}

	unsealedResult := containerOpenResult{Kind: "terminal_unsealed", TerminalItemID: "101"}
	if unsealedResult.Kind != "terminal_unsealed" || unsealedResult.TerminalItemID != "101" {
		t.Fatalf("unsealed result kind = %s, want terminal_unsealed", unsealedResult.Kind)
	}

	points := uint32(3)
	offerResult := containerOpenResult{
		Kind:            "terminal_offer",
		TerminalItemID:  "101",
		OfferItemID:     "9999",
		Offer:           &domain.RelatedItem{Name: "Desert Eagle | Printstream"},
		PointsRemaining: &points,
	}
	if offerResult.Kind != "terminal_offer" || offerResult.Offer == nil || offerResult.Offer.Name != "Desert Eagle | Printstream" {
		t.Fatalf("offer result kind = %s, want terminal_offer", offerResult.Kind)
	}
}
