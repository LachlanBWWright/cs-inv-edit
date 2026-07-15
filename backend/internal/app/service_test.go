package app

import (
	"context"
	"errors"
	"math"
	"strings"
	"testing"

	"cs-inv-edit/backend/internal/domain"
	"cs-inv-edit/backend/internal/econ"
	"cs-inv-edit/backend/internal/operations"
	cs2pb "cs-inv-edit/backend/internal/proto/generated"
	"cs-inv-edit/backend/internal/protocol"
	"cs-inv-edit/backend/internal/transport"
	"google.golang.org/protobuf/proto"
)

func TestSubmitOperationBlocksNameTagsByDefault(t *testing.T) {
	service := NewService()
	receipt := service.SubmitOperation("nametags.apply", map[string]any{})
	if receipt.State != "blocked_by_feature_flag" {
		t.Fatalf("expected blocked_by_feature_flag, got %q", receipt.State)
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
	if receipt.State != "awaiting_gc_confirmation" || len(client.SentProtoMessages) != 2 {
		t.Fatalf("bulk receipt=%#v messages=%d", receipt, len(client.SentProtoMessages))
	}
	for index, wantBalance := range []uint32{10, 6} {
		var message cs2pb.CMsgGCCstrike15V2ClientRedeemMissionReward
		if err := proto.Unmarshal(client.SentProtoMessages[index].Body, &message); err != nil {
			t.Fatal(err)
		}
		if message.GetRedeemableBalance() != wantBalance {
			t.Fatalf("message %d balance=%d want=%d", index, message.GetRedeemableBalance(), wantBalance)
		}
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
	if receipt.State != "awaiting_gc_confirmation" {
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
	if receipt.State != "blocked_by_feature_flag" {
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
		if receipt.State != "failed" || !strings.Contains(receipt.Message, "read-only") {
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
	if receipt.State != "requires_connection" {
		t.Fatalf("expected requires_connection, got %q", receipt.State)
	}
}

func TestArmoryReadEnabledAndPurchasesDisabledByDefault(t *testing.T) {
	service := NewService()
	settings := service.Settings()
	if !settings.FeatureFlags.EnableArmoryRead {
		t.Fatal("expected Armory reads enabled by default")
	}
	if settings.FeatureFlags.EnableArmoryRedemption {
		t.Fatal("expected Armory purchases disabled by default")
	}
	receipt := service.RedeemArmory(map[string]any{})
	if receipt.State != "blocked_by_feature_flag" {
		t.Fatalf("expected blocked purchase, got %q", receipt.State)
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
}

func TestMultiGameInventoryFlagsDefaultOffAndDoNotChangeCS2Snapshot(t *testing.T) {
	service := NewService()
	before := service.Inventory()
	settings := service.Settings()
	if settings.FeatureFlags.EnableTF2Inventory || settings.FeatureFlags.EnableDota2Inventory {
		t.Fatalf("multi-game flags must default off: %#v", settings.FeatureFlags)
	}
	if _, supported, enabled := service.GameInventory("tf2"); !supported || enabled {
		t.Fatalf("TF2 inventory supported=%t enabled=%t, want true/false", supported, enabled)
	}
	if _, supported, enabled := service.GameInventory("dota2"); !supported || enabled {
		t.Fatalf("Dota inventory supported=%t enabled=%t, want true/false", supported, enabled)
	}
	after := service.Inventory()
	if before.Status != after.Status || len(before.Items) != len(after.Items) {
		t.Fatalf("reading disabled game inventories changed CS2 snapshot: before=%#v after=%#v", before, after)
	}
}

func TestDisabledGameRefreshNeverTouchesGC(t *testing.T) {
	service := NewService()
	client := transport.NewTestGCClient()
	called := false
	client.GameInventoryFunc = func(context.Context, uint32) ([]transport.GCInventoryItem, error) {
		called = true
		return nil, nil
	}
	service.gcClient = client
	service.connection = domain.ConnectionStatus{State: "connected", SteamID: "7656119"}
	receipt := service.RefreshGameInventory("tf2")
	if receipt.State != "blocked_by_feature_flag" || called {
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
	if receipt.State != "failed" {
		t.Fatalf("receipt=%#v", receipt)
	}
	after := service.Inventory()
	if after.Status != "ready" || after.RefreshedAt != "before" || len(after.Items) != 1 || after.Items[0].ID != "cs2-owned" {
		t.Fatalf("CS2 inventory changed after TF2 failure: %#v", after)
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
	if receipt.State != "completed" || !strings.Contains(receipt.Message, "superseded") {
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
	if receipt.State != "completed" || !strings.Contains(receipt.Message, "superseded") {
		t.Fatalf("old-account receipt=%#v", receipt)
	}
	snapshot, _, _ := service.GameInventory("dota2")
	if len(snapshot.Items) != 0 || service.ConnectionStatus().SteamID != "2" {
		t.Fatalf("new account inherited old state: connection=%#v snapshot=%#v", service.ConnectionStatus(), snapshot)
	}
}
