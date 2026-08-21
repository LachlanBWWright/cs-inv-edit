package app

import (
	"strings"
	"testing"

	"cs-inv-edit/backend/internal/domain"
	"cs-inv-edit/backend/internal/econ"
	"cs-inv-edit/backend/internal/transport"
)

func TestDescriptionForGCItemAssociatesUniqueExactName(t *testing.T) {
	description := econ.InventoryDescription{Name: "Loyalty Badge", MarketHashName: "Loyalty Badge", IconURL: "https://example.invalid/icon", Tradable: false}
	descriptions := map[string]econ.InventoryDescription{"name:loyalty badge": description}
	got, ok := descriptionForGCItem(descriptions, transport.GCInventoryItem{ID: 123}, econ.Metadata{Name: "Loyalty Badge", MarketName: "Loyalty Badge"})
	if !ok || got.IconURL != description.IconURL {
		t.Fatalf("unique exact-name description was not associated with GC item: %#v", got)
	}
}

func TestDescriptionForGCItemRejectsAmbiguousExactName(t *testing.T) {
	descriptions := map[string]econ.InventoryDescription{
		"name:sealed graffiti | test":           {Name: "Sealed Graffiti | Test"},
		"ambiguous:name:sealed graffiti | test": {},
	}
	if got, ok := descriptionForGCItem(descriptions, transport.GCInventoryItem{ID: 123}, econ.Metadata{Name: "Sealed Graffiti | Test", MarketName: "Sealed Graffiti | Test"}); ok {
		t.Fatalf("ambiguous exact-name description was associated: %#v", got)
	}
}

func TestContainerDetectionSurvivesMislabeledCapsuleDescription(t *testing.T) {
	item := domain.InventoryItem{Name: "Sticker | Sticker Name", Kind: "sticker_item", ContainerItems: []domain.RelatedItem{{Name: "Sticker"}}}
	if !isContainerLikeInventoryItem(item) {
		t.Fatal("capsule with authoritative contents was not recognized as a container")
	}
}

func TestTradeUpPreviewUsesExteriorQualifiedDescription(t *testing.T) {
	wear := 0.12797817
	min, max := 0.0, 1.0
	input := transport.GCInventoryItem{PaintWear: &wear}
	items := []econ.RelatedItem{{Name: "M4A4", MarketName: "M4A4 | Converter", WearMin: &min, WearMax: &max}}
	name := "M4A4 | Converter (Minimal Wear)"
	descriptions := map[string]econ.MarketDescription{name: {IconURL: "https://steam.example/converter", Price: econ.MarketPrice{SellPriceText: "$1.77"}}}
	out := domainTradeUpItems(items, input, &min, &max, descriptions)
	if len(out) != 1 || out[0].MarketName != name || out[0].ImageURL == "" || out[0].Price != "$1.77" {
		t.Fatalf("trade-up outcome = %#v", out)
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

func TestXRayScannerLoadedCaseDetection(t *testing.T) {
	loadedCase := transport.GCInventoryItem{DefIndex: 4001, Inventory: 0xc0000005, Quantity: 0}
	if !isXRayScannerLoadedCase(loadedCase, econ.Metadata{Kind: "container"}) {
		t.Fatal("expected the zero-quantity scanner case to be excluded")
	}
	for name, candidate := range map[string]struct {
		item     transport.GCInventoryItem
		metadata econ.Metadata
	}{
		"owned case in the same position": {transport.GCInventoryItem{DefIndex: 4001, Inventory: 0xc0000005, Quantity: 1}, econ.Metadata{Kind: "container"}},
		"ordinary zero-default item":      {transport.GCInventoryItem{DefIndex: 4001, Inventory: 5, Quantity: 0}, econ.Metadata{Kind: "container"}},
		"sticker in the same position":    {transport.GCInventoryItem{DefIndex: 1209, Inventory: 0xc0000005, Quantity: 0}, econ.Metadata{Kind: "sticker_item"}},
		"scanner reward position":         {transport.GCInventoryItem{DefIndex: 7, Inventory: 0xc0000004, Quantity: 0}, econ.Metadata{Kind: "weapon_skin"}},
	} {
		if isXRayScannerLoadedCase(candidate.item, candidate.metadata) {
			t.Fatalf("%s was incorrectly identified as the loaded scanner case", name)
		}
	}
}

func TestTerminalMetadataRemainsVisibleAtHiddenInventoryPosition(t *testing.T) {
	activeTerminal := transport.GCInventoryItem{DefIndex: 5001, Inventory: xRayScannerLoadedCaseInventoryPosition, Quantity: 0}
	terminalMetadata := econ.Metadata{Name: "任務裝置", Kind: "container", IsVolatileContainer: true}
	if !isActiveTerminalGCItem(activeTerminal, terminalMetadata) {
		t.Fatal("terminal in the active GC slot was not classified as active")
	}
	if isXRayScannerLoadedCase(activeTerminal, terminalMetadata) {
		t.Fatal("active terminal was incorrectly hidden as an X-Ray Scanner case")
	}
	if got := activeTerminalName("Sealed Genesis Terminal"); got != "Active Genesis Terminal" {
		t.Fatalf("active terminal name = %q", got)
	}
}

func TestSealedTerminalIsNotClassifiedAsActiveFromSchemaOrVolatileCatalogue(t *testing.T) {
	sealed := transport.GCInventoryItem{
		ID:        53040587310,
		DefIndex:  5176,
		Inventory: 0xc0000003,
		Quantity:  0,
		Quality:   4,
		Attributes: map[uint32]uint32{
			75: 1785668400, volatileContainerAttributeDefIndex: 1,
		},
		VolatileOffers: []transport.GCVolatileOffer{{FauxItemID: 17293822569190457352}},
	}
	if isActiveTerminalGCItem(sealed, econ.Metadata{Kind: "container", IsVolatileContainer: true}) {
		t.Fatal("sealed terminal was classified as active")
	}
}

func TestActiveTerminalDiagnosticsIncludeStateProtocolAndOfferEvidence(t *testing.T) {
	active := transport.GCInventoryItem{
		ID: 52994080407, DefIndex: 5176, Inventory: xRayScannerLoadedCaseInventoryPosition, Quantity: 0, Quality: 14,
		Attributes: map[uint32]uint32{169: 3, 183: 1785068424},
	}
	state := strings.Join(activeTerminalStateDiagnostics(active), "\n")
	for _, expected := range []string{"active=true", "quest_points_remaining(#169)=3", "expiration_date(#183)=2026-07-26T12:20:24Z", "resume/current-offer=EMsg 2536 CMsgCasketItem", "supplemental_data=52994080407"} {
		if !strings.Contains(state, expected) {
			t.Fatalf("terminal state diagnostics omitted %q:\n%s", expected, state)
		}
	}
	offer := transport.GCInventoryItem{
		ID: 700, DefIndex: 7, Inventory: 0, Quantity: 1, Quality: 9, Rarity: 5, PaintKit: 123,
		Attributes: map[uint32]uint32{272: uint32(active.ID), 273: uint32(active.ID >> 32), 316: 1299},
	}
	diagnostic := terminalOfferDiagnostic(offer, econ.Metadata{Name: "Offered weapon", MarketName: "AK-47 | Offer", Kind: "weapon_skin", Rarity: "classified"})
	for _, expected := range []string{"item_id=700", "casket_id=52994080407", "purchase_price(#316)=1299", `market_name="AK-47 | Offer"`, "#316=1299"} {
		if !strings.Contains(diagnostic, expected) {
			t.Fatalf("terminal offer diagnostics omitted %q:\n%s", expected, diagnostic)
		}
	}
}

func TestRelatedItemForFauxIDMatchesPackedDefindexAndPaintKit(t *testing.T) {
	candidates := []domain.RelatedItem{{Defindex: 7, PaintKit: 999, MarketName: "AK-47 | Test"}}
	item, ok := relatedItemForFauxID(0xf000000003e70007, candidates)
	if !ok || item.MarketName != "AK-47 | Test" {
		t.Fatalf("item=%#v ok=%t", item, ok)
	}
}
