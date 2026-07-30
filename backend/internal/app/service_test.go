package app

import (
	"context"
	"encoding/json"
	"errors"
	"math"
	"reflect"
	"strings"
	"testing"

	"cs-inv-edit/backend/internal/domain"
	"cs-inv-edit/backend/internal/econ"
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
	client := transport.NewTestGCClient()
	client.StorePurchaseResult = transport.StorePurchaseTransportResult{TransactionID: 1, OrderID: 1, CheckoutURL: "https://checkout.steampowered.com/checkout/approvetxn/1/"}
	service.gcClient = client
	service.connection = domain.ConnectionStatus{State: "connected", SteamID: "7656119"}
	service.storeCurrencyID = 2
	service.storeCountry = "DE"
	service.store = domain.StoreSnapshot{Status: "ready", PriceSheetVersion: 7, Currency: "EUR", Offers: []domain.StoreOffer{{ID: "Name Tag", DefIndex: 1200, Name: "Name Tag", Currency: "EUR", AmountMinor: 175, PurchaseType: 3, Purchasable: true}}}
	session := service.InitializeStorePurchase(map[string]any{"offerId": "Name Tag", "quantity": uint64(20), "expectedPriceSheetVersion": uint64(7), "expectedAmountMinor": uint64(175)})
	if session.Status != "awaiting_user" {
		t.Fatalf("purchase session = %#v", session)
	}
	if session.CheckoutURL != "https://checkout.steampowered.com/checkout/approvetxn/1/" {
		t.Fatalf("checkout URL = %q", session.CheckoutURL)
	}
	if len(client.StorePurchaseCalls) != 1 {
		t.Fatalf("purchase calls = %d", len(client.StorePurchaseCalls))
	}
	request := client.StorePurchaseCalls[0]
	if request.Country != "DE" || !request.CountryPresent || !request.LanguagePresent || request.ItemDefID != 1200 || request.Quantity != 20 || request.Cost != 3500 || request.Currency != 2 || request.PurchaseType != 3 || !request.PurchaseTypePresent || !request.OmitSupplementalData {
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
	client := transport.NewTestGCClient()
	client.StorePurchaseResult = transport.StorePurchaseTransportResult{TransactionID: 1, OrderID: 2, CheckoutURL: "https://checkout.steampowered.com/checkout/approvetxn/1/"}
	service.gcClient = client
	service.connection = domain.ConnectionStatus{State: "connected", SteamID: "7656119"}
	service.storeCurrencyID = 2
	service.storeCountry = "DE"
	service.store = domain.StoreSnapshot{Status: "ready", Currency: "EUR"}
	defIndex := uint32(5176)
	service.inventory = domain.InventorySnapshot{Status: "ready", Items: []domain.InventoryItem{{
		ID: "52994080407", Name: "Active Genesis Terminal", Defindex: &defIndex,
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
	if session.Status != "awaiting_user" || len(client.StorePurchaseCalls) != 1 {
		t.Fatalf("terminal purchase session = %#v calls=%#v", session, client.StorePurchaseCalls)
	}
	request := client.StorePurchaseCalls[0]
	if request.Country != "DE" || request.ItemDefID != 5176 || request.Cost != 1299 || request.SupplementalData != 52994080407 || request.OmitSupplementalData || request.PurchaseTypePresent {
		t.Fatalf("terminal purchase request = %#v", request)
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
		ID: "52994080407", Name: "Active Genesis Terminal", Defindex: &defIndex,
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

func TestFirstNewInventoryItemFindsArmoryReward(t *testing.T) {
	before := domain.InventorySnapshot{Items: []domain.InventoryItem{{ID: "1", Name: "Existing"}}}
	after := domain.InventorySnapshot{Items: []domain.InventoryItem{{ID: "1", Name: "Existing"}, {ID: "2", Name: "Armory reward", MarketName: "AK-47 | Reward"}}}

	reward := firstNewInventoryItem(before, after)
	if reward == nil || reward.ID != "2" || reward.MarketName != "AK-47 | Reward" {
		t.Fatalf("reward=%#v", reward)
	}
}

func TestArmoryInventoryBaselineIncludesUnrefreshedMarketItems(t *testing.T) {
	cached := domain.InventorySnapshot{Items: []domain.InventoryItem{{ID: "1", Name: "Existing"}}}
	baseline := includeGCInventoryIDs(cached, []transport.GCInventoryItem{{ID: 1}, {ID: 2}})
	after := domain.InventorySnapshot{Items: []domain.InventoryItem{
		{ID: "1", Name: "Existing"},
		{ID: "2", Name: "Recent market purchase"},
		{ID: "3", Name: "Armory reward"},
	}}

	reward := firstNewInventoryItem(baseline, after)
	if reward == nil || reward.ID != "3" {
		t.Fatalf("reward=%#v baseline=%#v", reward, baseline.Items)
	}
}

func TestConfirmedArmoryRedemptionUpdatesBalanceForNextRequest(t *testing.T) {
	service := NewService()
	service.armory = domain.ArmorySnapshot{Status: "ready", Balance: 10, GenerationTime: 7}

	service.applyConfirmedArmoryRedemptionLocked(4)

	if service.armory.Balance != 6 || service.armory.GenerationTime != 7 {
		t.Fatalf("armory=%#v, want balance 6 with unchanged generation", service.armory)
	}
}

func TestSubmitOperationAllowsNameTagsWhenEnabled(t *testing.T) {
	service := NewService()
	service.SubmitOperation("settings", map[string]any{
		"validationMode": false,
		"featureFlags": map[string]any{
			"enableNameTags": true,
		},
	})

	receipt := service.SubmitOperation("nametags.apply", map[string]any{})
	if receipt.State != operations.StateAwaitingGCConfirmation {
		t.Fatalf("expected awaiting_gc_confirmation, got %q", receipt.State)
	}
}

func TestSubmitOperationAttachesGametrackingMessageMetadata(t *testing.T) {
	service := NewService()
	service.SubmitOperation("settings", map[string]any{
		"validationMode": false,
		"featureFlags": map[string]any{
			"enableNameTags": true,
		},
	})

	receipt := service.SubmitOperation("nametags.apply", map[string]any{})
	result, ok := receipt.Result.(map[string]any)
	if !ok {
		t.Fatalf("expected receipt result map, got %T", receipt.Result)
	}
	if got := result["requestBody"]; got != "CMsgSetItemName" {
		t.Fatalf("expected requestBody CMsgSetItemName, got %#v", got)
	}
	if got := result["featureFlag"]; got != "enableNameTags" {
		t.Fatalf("expected featureFlag enableNameTags, got %#v", got)
	}
	if got, ok := result["requestEmsg"].(uint32); !ok || got != protocol.EMsgSetItemName {
		t.Fatalf("expected requestEmsg %d, got %#v", protocol.EMsgSetItemName, result["requestEmsg"])
	}
}

func TestSubmitOperationBlocksItemDeletionWhenDisabled(t *testing.T) {
	service := NewService()
	receipt := service.SubmitOperation("items.delete", map[string]any{})
	if receipt.State != operations.StateBlockedByFeatureFlag {
		t.Fatalf("expected blocked_by_feature_flag, got %q", receipt.State)
	}
}

func TestCS2MutationEndpointsRejectExplicitReadOnlyGameItems(t *testing.T) {
	service := NewService()
	settings := service.Settings()
	settings.ValidationMode = false
	settings.FeatureFlags.EnableItemDeletion = true
	service.UpdateSettings(settings)
	for _, game := range []string{"tf2", "dota2"} {
		receipt := service.SubmitOperation("items.delete", map[string]any{"game": game, "itemId": "123"})
		if receipt.State != operations.StateFailed || !strings.Contains(receipt.Message, "read-only") {
			t.Fatalf("%s mutation receipt=%#v", game, receipt)
		}
	}
}

func TestNewServiceStartsWithEmptyInventoryUntilConnected(t *testing.T) {
	service := NewService()
	inventory := service.Inventory()
	if inventory.Status != "requires_connection" {
		t.Fatalf("expected requires_connection status, got %q", inventory.Status)
	}
	if len(inventory.Items) != 0 {
		t.Fatalf("expected no inventory items before connection, got %d", len(inventory.Items))
	}
}

func TestRefreshInventoryRequiresConnection(t *testing.T) {
	service := NewService()
	receipt := service.RefreshInventory()
	if receipt.State != operations.StateRequiresConnection {
		t.Fatalf("expected requires_connection, got %q", receipt.State)
	}
}

func TestArmoryReadAndRedemptionEnabledByDefault(t *testing.T) {
	service := NewService()
	settings := service.Settings()
	if !settings.FeatureFlags.EnableArmoryRead {
		t.Fatal("expected Armory reads enabled by default")
	}
	if !settings.FeatureFlags.EnableArmoryRedemption {
		t.Fatal("expected Armory purchases enabled by default")
	}
	receipt := service.RedeemArmory(map[string]any{})
	if receipt.State == operations.StateBlockedByFeatureFlag || receipt.State == operations.StateRequiresValidation {
		t.Fatalf("expected redemption to pass default feature and validation gates, got %q", receipt.State)
	}
}

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
	if !isTerminalMetadata(econ.Metadata{Name: "Active Genesis Terminal", Kind: "container"}) {
		t.Fatal("active terminal metadata was not recognized")
	}
	if isTerminalMetadata(econ.Metadata{Name: "Kilowatt Case", Kind: "container"}) {
		t.Fatal("ordinary container was incorrectly recognized as a terminal")
	}
	activeTerminal := transport.GCInventoryItem{DefIndex: 5001, Inventory: xRayScannerLoadedCaseInventoryPosition, Quantity: 0}
	if !isActiveTerminalGCItem(activeTerminal, econ.Metadata{Name: "Sealed Genesis Terminal", Kind: "container"}) {
		t.Fatal("terminal in the active GC slot was not classified as active")
	}
	if isXRayScannerLoadedCase(activeTerminal, econ.Metadata{Name: "Active Genesis Terminal", Kind: "container"}) {
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
			75: 1785668400,
		},
		VolatileOffers: []transport.GCVolatileOffer{{FauxItemID: 17293822569190457352}},
	}
	if isActiveTerminalGCItem(sealed, econ.Metadata{Name: "Sealed Genesis Terminal", MarketName: "Sealed Genesis Terminal", Kind: "container"}) {
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

func TestIdenticalTradeUpNormalizesInputAndMapsOutputCaps(t *testing.T) {
	inputWear, inputMin, inputMax := 0.05, 0.0, 0.10
	outputMin, outputMax := 0.20, 0.60
	items := tradeUpItemsForInput([]econ.RelatedItem{{Name: "Output", MarketName: "AK-47 | Output", WearMin: &outputMin, WearMax: &outputMax}}, transport.GCInventoryItem{PaintWear: &inputWear}, &inputMin, &inputMax)
	if len(items) != 1 || items[0].PaintWear == nil || math.Abs(*items[0].PaintWear-0.40) > 0.0000001 {
		t.Fatalf("trade-up output = %#v, want wear 0.40", items)
	}
}

func TestRevealAnimationsDefaultIndependently(t *testing.T) {
	settings := NewService().Settings()
	if settings.Animations.Container != "slot-machine" {
		t.Fatalf("container animation = %q", settings.Animations.Container)
	}
	if settings.Animations.TradeUp != "slot-machine" {
		t.Fatalf("trade-up animation = %q", settings.Animations.TradeUp)
	}
	if settings.Animations.Armory != "slot-machine" {
		t.Fatalf("Armory animation = %q", settings.Animations.Armory)
	}
	if settings.Animations.Terminal != "slot-machine" {
		t.Fatalf("terminal animation = %q", settings.Animations.Terminal)
	}
}

func TestTerminalRevealAnimationCanBeUpdatedIndependently(t *testing.T) {
	service := NewService()
	receipt := service.SubmitOperation("settings", map[string]any{"animations": map[string]any{"terminal": "countdown"}})
	if receipt.State != operations.StateCompleted {
		t.Fatalf("settings receipt = %#v", receipt)
	}
	settings := service.Settings()
	if settings.Animations.Terminal != "countdown" || settings.Animations.Container != "slot-machine" {
		t.Fatalf("animations = %#v", settings.Animations)
	}
}

func TestTF2InventoryDefaultsOnAndDota2DefaultsOffWithoutChangingCS2Snapshot(t *testing.T) {
	service := NewService()
	before := service.Inventory()
	settings := service.Settings()
	if !settings.FeatureFlags.EnableTF2Inventory || settings.FeatureFlags.EnableDota2Inventory {
		t.Fatalf("TF2 must default on and Dota 2 must default off: %#v", settings.FeatureFlags)
	}
	if snapshot, supported, enabled := service.GameInventory("tf2"); !supported || !enabled || snapshot.Diagnostics == nil {
		t.Fatalf("TF2 inventory supported=%t enabled=%t diagnostics=%#v, want true/true/non-nil", supported, enabled, snapshot.Diagnostics)
	}
	if _, supported, enabled := service.GameInventory("dota2"); !supported || enabled {
		t.Fatalf("Dota inventory supported=%t enabled=%t, want true/false", supported, enabled)
	}
	after := service.Inventory()
	if before.Status != after.Status || len(before.Items) != len(after.Items) {
		t.Fatalf("reading disabled game inventories changed CS2 snapshot: before=%#v after=%#v", before, after)
	}
}

func TestConnectedTF2InventoryWithoutSnapshotIsWaitingForRefresh(t *testing.T) {
	service := NewService()
	service.connection = domain.ConnectionStatus{State: "connected", SteamID: "7656119"}
	snapshot, supported, enabled := service.GameInventory("tf2")
	if !supported || !enabled || snapshot.Status != "loading" {
		t.Fatalf("connected TF2 snapshot=%#v supported=%t enabled=%t", snapshot, supported, enabled)
	}
	if strings.Contains(strings.ToLower(snapshot.Message), "connect") {
		t.Fatalf("connected TF2 snapshot has false connection guidance: %q", snapshot.Message)
	}
}

func TestGameInventoryClonePreservesRequiredEmptyTagArray(t *testing.T) {
	snapshot := cloneGameInventory(domain.GameInventorySnapshot{
		Game: "tf2", AppID: 440, Status: "ready", Diagnostics: []string{},
		Items: []domain.EconomyInventoryItem{{Game: "tf2", AppID: 440, AssetID: "1", Name: "Item", Quantity: 1, Tags: []domain.EconomyTag{}}},
	})
	if snapshot.Items[0].Tags == nil {
		t.Fatal("required item tags became nil during clone")
	}
	payload, err := json.Marshal(snapshot)
	if err != nil {
		t.Fatal(err)
	}
	if !strings.Contains(string(payload), `"tags":[]`) {
		t.Fatalf("serialized snapshot=%s, want tags array", payload)
	}
}

func TestFinishedLoginStartsEnabledTF2Presence(t *testing.T) {
	service := NewService()
	client := transport.NewTestGCClient()
	service.gcClient = client
	service.finishSteamLogin("account", transport.LogonResult{SteamID: 7656119})
	if len(client.GamesPlayedCalls) != 1 || !reflect.DeepEqual(client.GamesPlayedCalls[0], []uint32{protocol.AppIDCS2, 440}) {
		t.Fatalf("login presence=%#v, want CS2 and TF2", client.GamesPlayedCalls)
	}
}

func TestDisabledGameRefreshNeverTouchesGC(t *testing.T) {
	service := NewService()
	settings := service.Settings()
	settings.FeatureFlags.EnableTF2Inventory = false
	service.UpdateSettings(settings)
	client := transport.NewTestGCClient()
	called := false
	client.GameInventoryFunc = func(context.Context, uint32) ([]transport.GCInventoryItem, error) {
		called = true
		return nil, nil
	}
	service.gcClient = client
	service.connection = domain.ConnectionStatus{State: "connected", SteamID: "7656119"}
	receipt := service.RefreshGameInventory("tf2")
	if receipt.State != operations.StateBlockedByFeatureFlag || called {
		t.Fatalf("disabled refresh receipt=%#v GC-called=%t", receipt, called)
	}
}

func TestMultiGameInventoryFlagsAreIndependent(t *testing.T) {
	service := NewService()
	settings := service.Settings()
	settings.FeatureFlags.EnableTF2Inventory = true
	service.UpdateSettings(settings)
	if _, _, enabled := service.GameInventory("tf2"); !enabled {
		t.Fatal("TF2 inventory should be enabled")
	}
	if _, _, enabled := service.GameInventory("dota2"); enabled {
		t.Fatal("Dota inventory must remain disabled")
	}
}

func TestDisablingOneGamePresencePreservesCS2AndOtherEnabledGame(t *testing.T) {
	service := NewService()
	client := transport.NewTestGCClient()
	service.gcClient = client
	service.connection = domain.ConnectionStatus{State: "connected", SteamID: "7656119"}
	settings := service.Settings()
	settings.FeatureFlags.EnableTF2Inventory = true
	settings.FeatureFlags.EnableDota2Inventory = true
	service.UpdateSettings(settings)
	settings.FeatureFlags.EnableTF2Inventory = false
	service.UpdateSettings(settings)
	if len(client.GamesPlayedCalls) != 1 || len(client.GamesPlayedCalls[0]) != 2 || client.GamesPlayedCalls[0][0] != protocol.AppIDCS2 || client.GamesPlayedCalls[0][1] != 570 {
		t.Fatalf("presence calls=%#v", client.GamesPlayedCalls)
	}
}

func TestFailedMultiGameRefreshDoesNotMutateCS2Inventory(t *testing.T) {
	service := NewService()
	client := transport.NewTestGCClient()
	client.GameInventoryErr = errors.New("fixture GC failure")
	service.gcClient = client
	service.connection = domain.ConnectionStatus{State: "connected", SteamID: "7656119"}
	service.inventory = domain.InventorySnapshot{Status: "ready", RefreshedAt: "before", Items: []domain.InventoryItem{{ID: "cs2-owned", Name: "CS2 item"}}}
	settings := service.Settings()
	settings.FeatureFlags.EnableTF2Inventory = true
	service.UpdateSettings(settings)

	receipt := service.RefreshGameInventory("tf2")
	if receipt.State != operations.StateFailed {
		t.Fatalf("receipt=%#v", receipt)
	}
	after := service.Inventory()
	if after.Status != "ready" || after.RefreshedAt != "before" || len(after.Items) != 1 || after.Items[0].ID != "cs2-owned" {
		t.Fatalf("CS2 inventory changed after TF2 failure: %#v", after)
	}
}

func TestSteamInventoryServiceRefreshUsesRequestedAppID(t *testing.T) {
	service := NewService()
	client := transport.NewTestGCClient()
	var requestedAppID uint32
	var requestedSteamID uint64
	client.SteamInventoryServiceFunc = func(_ context.Context, appID uint32, steamID uint64) (transport.SteamInventoryServiceResponse, error) {
		requestedAppID, requestedSteamID = appID, steamID
		return transport.SteamInventoryServiceResponse{
			ETag:        "v1",
			ItemJSON:    `[{"itemid":"100","itemdefid":"7","quantity":"1"}]`,
			ItemDefJSON: `[{"itemdefid":"7","name":"Owned service item"}]`,
		}, nil
	}
	service.gcClient = client
	service.connection = domain.ConnectionStatus{State: "connected", SteamID: "76561198000000000"}

	receipt := service.RefreshSteamInventoryService(480)
	if receipt.State != operations.StateCompleted || requestedAppID != 480 || requestedSteamID != 76561198000000000 {
		t.Fatalf("receipt=%#v appid=%d steamid=%d", receipt, requestedAppID, requestedSteamID)
	}
	snapshot, enabled := service.SteamInventoryService(480)
	if !enabled || snapshot.Game != "steam-service" || len(snapshot.Items) != 1 || snapshot.Items[0].Name != "Owned service item" {
		t.Fatalf("snapshot=%#v enabled=%t", snapshot, enabled)
	}
}

func TestSteamInventoryServiceGamesUsesOwnedGamesAndExcludesDedicatedImplementations(t *testing.T) {
	service := NewService()
	client := transport.NewTestGCClient()
	client.OwnedGamesFunc = func(_ context.Context, steamID uint64) ([]transport.SteamOwnedGame, error) {
		if steamID != 76561198000000000 {
			t.Fatalf("SteamID = %d", steamID)
		}
		return []transport.SteamOwnedGame{
			{AppID: 570, Name: "Dota 2"},
			{AppID: 440, Name: "Team Fortress 2"},
			{AppID: 730, Name: "Counter-Strike 2"},
			{AppID: 753, Name: "Steam"},
			{AppID: 480, Name: "Spacewar", PlaytimeForever: 12},
			{AppID: 10, Name: "Counter-Strike", HasMarket: true},
		}, nil
	}
	service.gcClient = client
	service.connection = domain.ConnectionStatus{State: "connected", SteamID: "76561198000000000"}

	result := service.SteamInventoryServiceGames(context.Background())
	if result.Status != "ready" || len(result.Games) != 2 {
		t.Fatalf("games = %#v", result)
	}
	if result.Games[0].AppID != 10 || result.Games[1].AppID != 480 {
		t.Fatalf("filtered/sorted games = %#v", result.Games)
	}
}

func TestSteamInventoryServiceSnapshotsAreAppIDScoped(t *testing.T) {
	service := NewService()
	service.connection = domain.ConnectionStatus{State: "connected", SteamID: "76561198000000000"}
	service.gameInventories[gameInventoryKey(service.connection.SteamID, steamInventoryServiceKey(10))] = domain.GameInventorySnapshot{
		Game: "steam-service", AppID: 10, Status: "ready", Items: []domain.EconomyInventoryItem{{Game: "steam-service", AppID: 10, AssetID: "one", Name: "One", Quantity: 1}},
	}
	first, _ := service.SteamInventoryService(10)
	second, _ := service.SteamInventoryService(20)
	if len(first.Items) != 1 || len(second.Items) != 0 {
		t.Fatalf("AppID 10=%#v AppID 20=%#v", first, second)
	}
}

func TestGameInventorySnapshotsAreAccountScoped(t *testing.T) {
	service := NewService()
	settings := service.Settings()
	settings.FeatureFlags.EnableTF2Inventory = true
	service.UpdateSettings(settings)
	service.connection = domain.ConnectionStatus{State: "connected", SteamID: "account-a"}
	service.gameInventories[gameInventoryKey("account-a", "tf2")] = domain.GameInventorySnapshot{
		Game: "tf2", AppID: 440, Status: "ready", Items: []domain.EconomyInventoryItem{{Game: "tf2", AppID: 440, AssetID: "owned-by-a", Name: "A", Quantity: 1}},
	}

	accountA, _, _ := service.GameInventory("tf2")
	if len(accountA.Items) != 1 || accountA.Items[0].AssetID != "owned-by-a" {
		t.Fatalf("account A snapshot=%#v", accountA)
	}
	service.connection = domain.ConnectionStatus{State: "connected", SteamID: "account-b"}
	accountB, _, _ := service.GameInventory("tf2")
	if len(accountB.Items) != 0 {
		t.Fatalf("account B saw account A items: %#v", accountB)
	}
	service.connection = domain.ConnectionStatus{State: "connected", SteamID: "account-a"}
	accountAAgain, _, _ := service.GameInventory("tf2")
	if len(accountAAgain.Items) != 1 || accountAAgain.Items[0].AssetID != "owned-by-a" {
		t.Fatalf("account A snapshot was overwritten: %#v", accountAAgain)
	}
}

func TestDisablingGameActivelyCancelsRefreshAndClearsEveryAccount(t *testing.T) {
	service := NewService()
	client := transport.NewTestGCClient()
	started := make(chan struct{})
	client.GameInventoryFunc = func(ctx context.Context, _ uint32) ([]transport.GCInventoryItem, error) {
		close(started)
		<-ctx.Done()
		return nil, ctx.Err()
	}
	service.gcClient = client
	service.connection = domain.ConnectionStatus{State: "connected", SteamID: "account-a"}
	settings := service.Settings()
	settings.FeatureFlags.EnableTF2Inventory = true
	service.UpdateSettings(settings)
	done := make(chan operations.Receipt, 1)
	go func() { done <- service.RefreshGameInventory("tf2") }()
	<-started

	settings = service.Settings()
	settings.FeatureFlags.EnableTF2Inventory = false
	service.UpdateSettings(settings)
	receipt := <-done
	if receipt.State != operations.StateCompleted || !strings.Contains(receipt.Message, "superseded") {
		t.Fatalf("cancelled receipt=%#v", receipt)
	}
	if len(service.gameInventories) != 0 || len(service.gameCancels) != 0 {
		t.Fatalf("disabled game retained state: inventories=%#v cancels=%d", service.gameInventories, len(service.gameCancels))
	}
	if len(client.GamesPlayedCalls) != 1 || len(client.GamesPlayedCalls[0]) != 1 || client.GamesPlayedCalls[0][0] != protocol.AppIDCS2 {
		t.Fatalf("disabled game presence was not stopped while preserving CS2: %#v", client.GamesPlayedCalls)
	}
}

func TestAccountChangeActivelyCancelsPreviousAccountRefresh(t *testing.T) {
	service := NewService()
	client := transport.NewTestGCClient()
	started := make(chan struct{})
	client.GameInventoryFunc = func(ctx context.Context, _ uint32) ([]transport.GCInventoryItem, error) {
		close(started)
		<-ctx.Done()
		return nil, ctx.Err()
	}
	service.gcClient = client
	service.connection = domain.ConnectionStatus{State: "connected", SteamID: "1", AccountName: "old"}
	settings := service.Settings()
	settings.FeatureFlags.EnableDota2Inventory = true
	service.UpdateSettings(settings)
	done := make(chan operations.Receipt, 1)
	go func() { done <- service.RefreshGameInventory("dota2") }()
	<-started
	service.finishSteamLogin("new", transport.LogonResult{SteamID: 2})
	receipt := <-done
	if receipt.State != operations.StateCompleted || !strings.Contains(receipt.Message, "superseded") {
		t.Fatalf("old-account receipt=%#v", receipt)
	}
	snapshot, _, _ := service.GameInventory("dota2")
	if len(snapshot.Items) != 0 || service.ConnectionStatus().SteamID != "2" {
		t.Fatalf("new account inherited old state: connection=%#v snapshot=%#v", service.ConnectionStatus(), snapshot)
	}
}
