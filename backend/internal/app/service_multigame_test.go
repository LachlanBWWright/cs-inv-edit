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
	"cs-inv-edit/backend/internal/protocol"
	"cs-inv-edit/backend/internal/transport"
)

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
	if !settings.FeatureFlags.EnableTF2Store {
		t.Fatalf("TF2 store must default on: %#v", settings.FeatureFlags)
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
	if after.Status != domain.SnapshotStatusReady || after.RefreshedAt != "before" || len(after.Items) != 1 || after.Items[0].ID != "cs2-owned" {
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
	client.SteamInventoryServiceFunc = func(_ context.Context, appID uint32, _ uint64) (transport.SteamInventoryServiceResponse, error) {
		if appID != 10 {
			return transport.SteamInventoryServiceResponse{}, errors.New("inventory service unavailable")
		}
		return transport.SteamInventoryServiceResponse{
			ItemJSON:    `[{"itemid":"1","itemdefid":"2","quantity":"1"}]`,
			ItemDefJSON: `{"itemdefs":[{"itemdefid":"2","name":"Owned item"}]}`,
		}, nil
	}
	service.gcClient = client
	service.connection = domain.ConnectionStatus{State: "connected", SteamID: "76561198000000000"}

	result := service.SteamInventoryServiceGames(context.Background())
	if result.Status != domain.SnapshotStatusReady || len(result.Games) != 1 {
		t.Fatalf("games = %#v", result)
	}
	if result.Games[0].AppID != 10 {
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
