package app

import (
	"context"
	"errors"
	"strings"
	"testing"

	"cs-inv-edit/backend/internal/domain"
	"cs-inv-edit/backend/internal/operations"
	cs2pb "cs-inv-edit/backend/internal/proto/gametracking"
	"cs-inv-edit/backend/internal/proto/tracking"
	"cs-inv-edit/backend/internal/protocol"
	"cs-inv-edit/backend/internal/transport"
)

func TestCS2StoreCurrencyUsesEconomyEnum(t *testing.T) {
	tests := map[int32]string{0: "USD", 1: "GBP", 2: "EUR", 20: "CAD", 21: "AUD", 24: "CHF"}
	for id, expected := range tests {
		if actual := steamCurrencyCode(id); actual != expected {
			t.Fatalf("CS2 store currency %d = %q, want %q", id, actual, expected)
		}
	}
}

func TestStorePurchaseSendsAuthoritativeFieldsForMaximumCS2Quantity(t *testing.T) {
	service := NewService()
	service.settings.FeatureFlags.EnableFullCS2Store = true
	client := transport.NewTestGCClient()
	client.StorePurchaseResult = transport.StorePurchaseTransportResult{TransactionID: 1, OrderID: 1, CheckoutURL: "https://checkout.steampowered.com/checkout/approvetxn/1/"}
	service.gcClient = client
	service.connection = domain.ConnectionStatus{State: "connected", SteamID: "7656119"}
	service.storeCurrencyID = 2
	service.storeCountry = "DE"
	service.store = domain.StoreSnapshot{Status: "ready", PriceSheetVersion: 7, Currency: "EUR", Offers: []domain.StoreOffer{{ID: "Name Tag", DefIndex: 1200, Name: "Name Tag", Currency: "EUR", AmountMinor: 175, PurchaseType: 3, Purchasable: true}}}
	session := service.InitializeStorePurchase(map[string]any{"offerId": "Name Tag", "quantity": uint64(20), "expectedPriceSheetVersion": uint64(7), "expectedAmountMinor": uint64(175)})
	if session.Status != domain.PurchaseStatusAwaitingUser {
		t.Fatalf("purchase session = %#v", session)
	}
	if session.CheckoutURL != "https://checkout.steampowered.com/checkout/approvetxn/1/" {
		t.Fatalf("checkout URL = %q", session.CheckoutURL)
	}
	if len(client.StorePurchaseCalls) != 1 {
		t.Fatalf("purchase calls = %d", len(client.StorePurchaseCalls))
	}
	request := client.StorePurchaseCalls[0]
	if request.Country != "" || !request.CountryPresent || !request.LanguagePresent || request.ItemDefID != 1200 || request.Quantity != 20 || request.Cost != 3500 || request.Currency != 2 || request.PurchaseType != 0 || request.PurchaseTypePresent || request.OmitSupplementalData || request.SupplementalData != 0 {
		t.Fatalf("purchase request = %#v", request)
	}
}

func TestStorePurchaseRejectsQuantityAboveCS2DropdownLimit(t *testing.T) {
	service := NewService()
	client := transport.NewTestGCClient()
	service.gcClient = client
	service.connection = domain.ConnectionStatus{State: "connected", SteamID: "7656119"}
	service.storeCurrencyID = 2
	service.storeCountry = "DE"
	service.store = domain.StoreSnapshot{Status: "ready", PriceSheetVersion: 7, Currency: "EUR", Offers: []domain.StoreOffer{{ID: "Name Tag", DefIndex: 1200, Name: "Name Tag", Currency: "EUR", AmountMinor: 175, Purchasable: true}}}
	session := service.InitializeStorePurchase(map[string]any{"offerId": "Name Tag", "quantity": uint64(21), "expectedPriceSheetVersion": uint64(7), "expectedAmountMinor": uint64(175)})
	if session.Status != "failed" || !strings.Contains(session.Message, "between 1 and 20") {
		t.Fatalf("purchase session = %#v", session)
	}
	if len(client.StorePurchaseCalls) != 0 {
		t.Fatal("invalid quantity reached the GC transport")
	}
}

func TestTerminalPurchaseUsesEmbeddedPriceAndTerminalAsSupplementalData(t *testing.T) {
	service := NewService()
	service.settings.FeatureFlags.EnableFullCS2Store = true
	client := transport.NewTestGCClient()
	client.StorePurchaseResult = transport.StorePurchaseTransportResult{TransactionID: 1, OrderID: 2, CheckoutURL: "https://checkout.steampowered.com/checkout/approvetxn/1/"}
	service.gcClient = client
	service.connection = domain.ConnectionStatus{State: "connected", SteamID: "7656119"}
	service.storeCurrencyID = 2
	service.storeCountry = "DE"
	service.store = domain.StoreSnapshot{Status: "ready", Currency: "EUR"}
	defIndex := uint32(5176)
	service.inventory = domain.InventorySnapshot{Status: "ready", Items: []domain.InventoryItem{{
		ID: "52994080407", Name: "Active Genesis Terminal", Defindex: &defIndex, IsTerminal: true, IsActiveTerminal: true,
		TerminalOffers: []domain.TerminalOffer{{FauxItemID: "700", PurchasePrice: 1299, Item: domain.RelatedItem{Defindex: 24, PaintKit: 1351, MarketName: "UMP-45 | Continuum"}}},
	}}}
	terminalItemID := uint64(52994080407)
	offerBody, err := cs2pb.MarshalMessage("CSOEconItem", map[string]any{"id": uint64(700), "def_index": uint32(7), "attribute": []any{
		map[string]any{"def_index": uint32(272), "value": uint32(terminalItemID)},
		map[string]any{"def_index": uint32(273), "value": uint32(terminalItemID >> 32)},
		map[string]any{"def_index": uint32(316), "value": uint32(1299)},
	}})
	if err != nil {
		t.Fatal(err)
	}
	singleBody, err := cs2pb.MarshalMessage("CMsgSOSingleObject", map[string]any{"type_id": int32(1), "object_data": offerBody})
	if err != nil {
		t.Fatal(err)
	}
	decodedOffers, err := transport.DecodeCS2VirtualEconItems(protocol.EMsgSOCreate, singleBody)
	if err != nil || len(decodedOffers) != 1 || decodedOffers[0].Attributes[316] != 1299 {
		t.Fatalf("decoded terminal offer price: offers=%#v err=%v", decodedOffers, err)
	}
	confirmationBody, err := cs2pb.MarshalMessage("CMsgGCItemCustomizationNotification", map[string]any{"request": protocol.CustomizationCasketContents, "item_id": []any{terminalItemID}})
	if err != nil {
		t.Fatal(err)
	}
	client.SendProtoFunc = func(_ context.Context, _ uint32, emsg uint32, _ []byte) error {
		if emsg == protocol.EMsgVolatileItemLoadContents {
			client.Emit(transport.GCEvent{Type: "gc.message", Payload: transport.GCMessage{AppID: protocol.AppIDCS2, EMsg: protocol.EMsgSOCreate, Body: singleBody}})
			client.Emit(transport.GCEvent{Type: "gc.message", Payload: transport.GCMessage{AppID: protocol.AppIDCS2, EMsg: protocol.EMsgItemCustomizationNotification, Body: confirmationBody}})
		}
		return nil
	}
	session := service.InitializeStorePurchase(map[string]any{"offerId": "terminal:52994080407", "quantity": uint64(1), "expectedPriceSheetVersion": uint64(0), "expectedAmountMinor": uint64(1299), "expectedTerminalOfferItemId": "700"})
	if session.Status != domain.PurchaseStatusAwaitingUser || len(client.StorePurchaseCalls) != 1 {
		t.Fatalf("terminal purchase session = %#v calls=%#v", session, client.StorePurchaseCalls)
	}
	request := client.StorePurchaseCalls[0]
	if request.Country != "" || request.ItemDefID != 5176 || request.Cost != 1299 || request.SupplementalData != 52994080407 || request.OmitSupplementalData || request.PurchaseTypePresent {
		t.Fatalf("terminal purchase request = %#v", request)
	}
}

func TestCouponOnlyStoreUsesBuyItemWithoutGC(t *testing.T) {
	service := NewService()
	client := transport.NewTestGCClient()
	service.gcClient = client
	service.connection = domain.ConnectionStatus{State: "connected", SteamID: "7656119"}
	service.storeCurrencyID = 2
	service.storeCountry = "DE"
	service.store = domain.StoreSnapshot{Status: "ready", PriceSheetVersion: 7, Currency: "EUR", Offers: []domain.StoreOffer{
		{ID: "coupon", DefIndex: 20170, Name: "Music Kit Box", Currency: "EUR", AmountMinor: 100, Coupon: true, Purchasable: true},
		{ID: "key", DefIndex: 1308, Name: "Case Key", Currency: "EUR", AmountMinor: 200, Purchasable: true},
	}}

	visible := service.Store()
	if len(visible.Offers) != 1 || visible.Offers[0].ID != "coupon" {
		t.Fatalf("coupon-only offers = %#v", visible.Offers)
	}
	session := service.InitializeStorePurchase(map[string]any{"offerId": "coupon", "quantity": uint64(3), "expectedPriceSheetVersion": uint64(7), "expectedAmountMinor": uint64(100)})
	if session.Status != domain.PurchaseStatusAwaitingUser || session.CheckoutURL != "https://store.steampowered.com/buyitem/730/20170/3" {
		t.Fatalf("coupon purchase session = %#v", session)
	}
	if len(client.StorePurchaseCalls) != 0 {
		t.Fatal("coupon fallback unexpectedly reached the GC purchase transport")
	}
	hidden := service.InitializeStorePurchase(map[string]any{"offerId": "key", "quantity": uint64(1), "expectedPriceSheetVersion": uint64(7), "expectedAmountMinor": uint64(200)})
	if hidden.Status != "failed" || !strings.Contains(hidden.Message, "Full CS2 Store") {
		t.Fatalf("hidden full-store purchase = %#v", hidden)
	}
	service.settings.FeatureFlags.EnableFullCS2Store = true
	client.StorePurchaseResult = transport.StorePurchaseTransportResult{TransactionID: 10, OrderID: 20, CheckoutURL: "https://checkout.steampowered.com/checkout/approvetxn/10/"}
	if full := service.Store(); len(full.Offers) != 2 {
		t.Fatalf("full-store offers = %#v", full.Offers)
	}
	fullCoupon := service.InitializeStorePurchase(map[string]any{"offerId": "coupon", "quantity": uint64(1), "expectedPriceSheetVersion": uint64(7), "expectedAmountMinor": uint64(100)})
	if fullCoupon.CheckoutURL != client.StorePurchaseResult.CheckoutURL || len(client.StorePurchaseCalls) != 1 {
		t.Fatalf("full-store coupon did not use GC route: session=%#v calls=%#v", fullCoupon, client.StorePurchaseCalls)
	}
}

func TestTerminalPurchaseRejectsStaleDisplayedOffer(t *testing.T) {
	service := NewService()
	client := transport.NewTestGCClient()
	service.gcClient = client
	service.connection = domain.ConnectionStatus{State: "connected", SteamID: "7656119"}
	service.storeCurrencyID = 2
	service.storeCountry = "DE"
	service.store = domain.StoreSnapshot{Status: "ready", Currency: "EUR"}
	defIndex := uint32(5176)
	service.inventory = domain.InventorySnapshot{Status: "ready", Items: []domain.InventoryItem{{
		ID: "52994080407", Name: "Active Genesis Terminal", Defindex: &defIndex, IsTerminal: true, IsActiveTerminal: true,
		TerminalOffers: []domain.TerminalOffer{{FauxItemID: "701", PurchasePrice: 1299, Item: domain.RelatedItem{Defindex: 24, MarketName: "UMP-45 | Continuum"}}},
	}}}

	session := service.InitializeStorePurchase(map[string]any{
		"offerId":                     "terminal:52994080407",
		"quantity":                    uint64(1),
		"expectedPriceSheetVersion":   uint64(0),
		"expectedAmountMinor":         uint64(1299),
		"expectedTerminalOfferItemId": "700",
	})
	if session.Status != "failed" || !strings.Contains(session.Message, "changed before purchase") {
		t.Fatalf("terminal purchase session = %#v", session)
	}
	if len(client.StorePurchaseCalls) != 0 {
		t.Fatal("stale terminal offer reached the GC purchase transport")
	}
}

func TestEncodedVolatileOfferItemID(t *testing.T) {
	if got, want := encodedVolatileOfferItemID(24, 1351), uint64(17293822569191243800); got != want {
		t.Fatalf("encoded volatile offer item id = %d, want %d", got, want)
	}
}

func TestTerminalPurchaseWireShapesExhaustAllNonCanonicalPresenceCombinations(t *testing.T) {
	shapes := terminalPurchaseWireShapes()
	if len(shapes) != 255 {
		t.Fatalf("terminal protobuf shape count = %d, want 255", len(shapes))
	}
	if got, want := shapes[0], terminalCanonicalPresence^(1<<7); got != want {
		t.Fatalf("first protobuf shape = %08b, want nearest shape %08b", got, want)
	}
}

func TestSubmitOperationBlocksNameTagsByDefault(t *testing.T) {
	service := NewService()
	receipt := service.SubmitOperation("nametags.apply", map[string]any{})
	if receipt.State != operations.StateBlockedByFeatureFlag {
		t.Fatalf("expected blocked_by_feature_flag, got %q", receipt.State)
	}
}

func TestStorageContentsAreRecognizedFromAuthoritativeCasketAttributes(t *testing.T) {
	item := transport.GCInventoryItem{Attributes: map[uint32]uint32{272: 0x89abcdef, 273: 0x01234567}}
	if got, want := gcItemCasketID(item), uint64(0x0123456789abcdef); got != want {
		t.Fatalf("casket id = %x, want %x", got, want)
	}
}

func TestGraffitiChargesUseAuthoritativeSpraysRemainingAttribute(t *testing.T) {
	item := transport.GCInventoryItem{Attributes: map[uint32]uint32{232: 494, 233: 19}}
	charges := gcItemGraffitiCharges(item, "spraypaint")
	if charges == nil || *charges != 494 {
		t.Fatalf("graffiti charges = %v, want 494", charges)
	}
	if got := gcItemGraffitiCharges(item, ""); got != nil {
		t.Fatalf("non-graffiti charges = %v, want nil", *got)
	}
}

func TestMergeGCInventoryItemsKeepsLoadedStorageContents(t *testing.T) {
	main := []transport.GCInventoryItem{{ID: 1, Inventory: 1}}
	loaded := []transport.GCInventoryItem{{ID: 1, Inventory: 1}, {ID: 2, Attributes: map[uint32]uint32{272: 9}}}
	merged := mergeGCInventoryItems(main, loaded)
	if len(merged) != 2 || merged[1].ID != 2 || gcItemCasketID(merged[1]) != 9 {
		t.Fatalf("merged inventory = %#v", merged)
	}
}

func TestStorageMoveOutSendsAuthoritativeCasketExtractMessage(t *testing.T) {
	service := NewService()
	client := transport.NewTestGCClient()
	service.gcClient = client
	service.connection = domain.ConnectionStatus{State: "connected", SteamID: "7656119"}
	service.settings.FeatureFlags.EnableStorageMutations = true
	containedIn := "17224167524"
	service.inventory.Items = []domain.InventoryItem{
		{ID: "17224167524", Kind: "storage_unit"},
		{ID: "123456789", Kind: "weapon_skin", CasketID: &containedIn},
	}

	receipt := service.SubmitOperation("storage.move-out", map[string]any{"casketId": "17224167524", "itemId": "123456789"})
	if receipt.State != operations.StateAwaitingGCConfirmation || len(client.SentProtoMessages) != 1 {
		t.Fatalf("receipt=%#v messages=%d", receipt, len(client.SentProtoMessages))
	}
	sent := client.SentProtoMessages[0]
	if sent.EMsg != protocol.EMsgCasketItemExtract {
		t.Fatalf("emsg=%d want=%d", sent.EMsg, protocol.EMsgCasketItemExtract)
	}
	message, err := cs2pb.UnmarshalMessage("CMsgCasketItem", sent.Body)
	if err != nil {
		t.Fatal(err)
	}
	if tracking.Uint(message, "casket_item_id") != 17224167524 || tracking.Uint(message, "item_item_id") != 123456789 {
		t.Fatalf("message=%#v", message)
	}
}

func TestStorageMoveInSendsAuthoritativeCasketAddMessage(t *testing.T) {
	service := NewService()
	client := transport.NewTestGCClient()
	service.gcClient = client
	service.connection = domain.ConnectionStatus{State: "connected", SteamID: "7656119"}
	service.settings.FeatureFlags.EnableStorageMutations = true
	eligible := true
	service.inventory.Items = []domain.InventoryItem{
		{ID: "17224167524", Kind: "storage_unit"},
		{ID: "123456789", Kind: "weapon_skin", StorageEligible: &eligible},
	}
	receipt := service.SubmitOperation("storage.move-in", map[string]any{"casketId": "17224167524", "itemId": "123456789"})
	if receipt.State != operations.StateAwaitingGCConfirmation || len(client.SentProtoMessages) != 1 {
		t.Fatalf("receipt=%#v messages=%d", receipt, len(client.SentProtoMessages))
	}
	if client.SentProtoMessages[0].EMsg != protocol.EMsgCasketItemAdd {
		t.Fatalf("emsg=%d want=%d", client.SentProtoMessages[0].EMsg, protocol.EMsgCasketItemAdd)
	}
}

func TestStorageMoveInRejectsIneligibleAndFullUnit(t *testing.T) {
	tests := []struct {
		name  string
		unit  domain.InventoryItem
		item  domain.InventoryItem
		match string
	}{
		{
			name:  "trade protected",
			unit:  domain.InventoryItem{ID: "10", Kind: "storage_unit"},
			item:  domain.InventoryItem{ID: "20", Kind: "weapon_skin", StorageEligible: boolPointer(false), StorageIneligibleReason: "This item is trade-protected and cannot be transferred yet."},
			match: "trade-protected",
		},
		{
			name:  "full",
			unit:  domain.InventoryItem{ID: "10", Kind: "storage_unit", StorageCount: func() *uint32 { value := uint32(1000); return &value }()},
			item:  domain.InventoryItem{ID: "20", Kind: "weapon_skin", StorageEligible: boolPointer(true)},
			match: "full",
		},
	}
	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			service := NewService()
			client := transport.NewTestGCClient()
			service.gcClient = client
			service.connection = domain.ConnectionStatus{State: "connected", SteamID: "7656119"}
			service.settings.FeatureFlags.EnableStorageMutations = true
			service.inventory.Items = []domain.InventoryItem{test.unit, test.item}
			receipt := service.SubmitOperation("storage.move-in", map[string]any{"casketId": "10", "itemId": "20"})
			if receipt.State != operations.StateFailed || !strings.Contains(receipt.Message, test.match) || len(client.SentProtoMessages) != 0 {
				t.Fatalf("receipt=%#v messages=%d", receipt, len(client.SentProtoMessages))
			}
		})
	}
}

func TestTerminalOfferLoadUsesCurrentVolatileItemRoute(t *testing.T) {
	service := NewService()
	client := transport.NewTestGCClient()
	service.gcClient = client
	service.connection = domain.ConnectionStatus{State: "connected", SteamID: "7656119"}

	receipt := service.SubmitOperation("terminal.load-offer", map[string]any{"terminalId": "52994080407"})
	if receipt.State != operations.StateAwaitingGCConfirmation || len(client.SentProtoMessages) != 1 {
		t.Fatalf("receipt=%#v messages=%d", receipt, len(client.SentProtoMessages))
	}
	sent := client.SentProtoMessages[0]
	if sent.EMsg != protocol.EMsgVolatileItemLoadContents {
		t.Fatalf("emsg=%d want volatile-item-load route %d", sent.EMsg, protocol.EMsgVolatileItemLoadContents)
	}
	message, err := cs2pb.UnmarshalMessage("CMsgCasketItem", sent.Body)
	if err != nil {
		t.Fatal(err)
	}
	if tracking.Uint(message, "casket_item_id") != 52994080407 || tracking.Uint(message, "item_item_id") != 52994080407 {
		t.Fatalf("message=%#v", message)
	}
}

func TestBulkArmoryPurchaseSendsAdjustedBalances(t *testing.T) {
	service := NewService()
	client := transport.NewTestGCClient()
	service.gcClient = client
	service.connection = domain.ConnectionStatus{State: "connected"}
	service.settings.ValidationMode = false
	service.settings.FeatureFlags.EnableArmoryRedemption = true
	service.settings.ArmoryPurchasePacingSeconds = 1
	service.armory = domain.ArmorySnapshot{Status: "ready", Balance: 10, GenerationTime: 7, Offers: []domain.ArmoryOffer{{CampaignID: 11, RedeemID: 2, ExpectedCost: 4}}}
	receipt := service.RedeemArmory(map[string]any{"campaignId": float64(11), "redeemId": float64(2), "redeemableBalance": float64(10), "expectedCost": float64(4), "generationTime": float64(7), "quantity": float64(2)})
	if receipt.State != operations.StateAwaitingGCConfirmation || len(client.SentProtoMessages) != 2 {
		t.Fatalf("bulk receipt=%#v messages=%d", receipt, len(client.SentProtoMessages))
	}
	for index, wantBalance := range []uint32{10, 6} {
		message, err := cs2pb.UnmarshalMessage("CMsgGCCstrike15_v2_ClientRedeemMissionReward", client.SentProtoMessages[index].Body)
		if err != nil {
			t.Fatal(err)
		}
		if balance := uint32(tracking.Uint(message, "redeemable_balance")); balance != wantBalance {
			t.Fatalf("message %d balance=%d want=%d", index, balance, wantBalance)
		}
	}
}

func TestArmoryPurchaseIsNotSentWhenGCSessionPreflightFails(t *testing.T) {
	service := NewService()
	client := transport.NewTestGCClient()
	client.InventoryFunc = func(context.Context) ([]transport.GCInventoryItem, error) {
		return nil, errors.New("no current ClientWelcome")
	}
	service.gcClient = client
	service.connection = domain.ConnectionStatus{State: "connected"}
	service.settings.FeatureFlags.EnableArmoryRedemption = true
	service.armory = domain.ArmorySnapshot{Status: "ready", Balance: 10, GenerationTime: 7, Offers: []domain.ArmoryOffer{{CampaignID: 11, RedeemID: 2, ExpectedCost: 4}}}

	receipt := service.RedeemArmory(map[string]any{"campaignId": float64(11), "redeemId": float64(2), "redeemableBalance": float64(10), "expectedCost": float64(4), "generationTime": float64(7), "quantity": float64(1)})

	if receipt.State != operations.StateFailed || !strings.Contains(receipt.Message, "purchase was not sent") {
		t.Fatalf("receipt=%#v", receipt)
	}
	if len(client.SentProtoMessages) != 0 {
		t.Fatalf("sent %d redemption messages after failed preflight", len(client.SentProtoMessages))
	}
}
