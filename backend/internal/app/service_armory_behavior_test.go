package app

import (
	"context"
	"strings"
	"testing"

	"cs-inv-edit/backend/internal/domain"
	"cs-inv-edit/backend/internal/operations"
	"cs-inv-edit/backend/internal/protocol"
	"cs-inv-edit/backend/internal/transport"
)

func TestArmoryPurchaseReturnsIncrementalGCReward(t *testing.T) {
	service := NewService()
	client := transport.NewTestGCClient()
	waits := 0
	client.WaitForNewCS2ItemFunc = func(_ context.Context, known map[uint64]struct{}) (transport.GCInventoryItem, error) {
		if _, exists := known[1]; !exists {
			t.Fatal("cached inventory ID was not included in incremental baseline")
		}
		waits++
		wear := 0.123
		return transport.GCInventoryItem{ID: 2, DefIndex: 7, PaintKit: 44, PaintWear: &wear, Quality: 9}, nil
	}
	service.gcClient = client
	service.connection = domain.ConnectionStatus{State: "connected", SteamID: "7656119"}
	service.settings.FeatureFlags.EnableArmoryRedemption = true
	service.inventory = domain.InventorySnapshot{Status: "ready", Items: []domain.InventoryItem{{ID: "1", Name: "Existing"}}}
	service.armory = domain.ArmorySnapshot{
		Status: "ready", Balance: 10, GenerationTime: 7,
		Offers: []domain.ArmoryOffer{{
			CampaignID: 11, RedeemID: 2, ExpectedCost: 4,
			Items: []domain.RelatedItem{{
				Defindex: 7, PaintKit: 44, Name: "AK-47 | Reward",
				MarketName: "StatTrak™ AK-47 | Reward", Kind: "weapon_skin",
				Rarity: "Covert", ImageURL: "reward.png",
			}},
		}},
	}

	receipt := service.RedeemArmory(map[string]any{"campaignId": float64(11), "redeemId": float64(2), "redeemableBalance": float64(10), "expectedCost": float64(4), "generationTime": float64(7), "quantity": float64(1)})

	if receipt.State != operations.StateCompleted {
		t.Fatalf("receipt=%#v", receipt)
	}
	result, ok := receipt.Result.(map[string]any)
	if !ok {
		t.Fatalf("result=%#v", receipt.Result)
	}
	opened, ok := result["openedItem"].(domain.InventoryItem)
	if !ok || opened.ID != "2" || opened.MarketName != "StatTrak™ AK-47 | Reward" || !opened.IsStatTrak {
		t.Fatalf("openedItem=%#v", result["openedItem"])
	}
	if service.armory.Balance != 6 {
		t.Fatalf("balance=%d want=6", service.armory.Balance)
	}
	if waits != 1 {
		t.Fatalf("incremental waits=%d want=1", waits)
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

func TestMatchingArmoryRewardPrefersOfferItemAmongConcurrentArrivals(t *testing.T) {
	defindex := uint32(7)
	before := domain.InventorySnapshot{Items: []domain.InventoryItem{{ID: "1", Name: "Existing"}}}
	after := domain.InventorySnapshot{Items: []domain.InventoryItem{
		{ID: "1", Name: "Existing"},
		{ID: "2", Name: "Unrelated market delivery", MarketName: "Sticker | Other"},
		{ID: "3", Name: "Armory reward", MarketName: "AK-47 | Reward", Defindex: &defindex},
	}}
	offer := domain.ArmoryOffer{Items: []domain.RelatedItem{{Defindex: 7, MarketName: "AK-47 | Reward"}}}

	reward := matchingArmoryReward(before, after, offer)
	if reward == nil || reward.ID != "3" {
		t.Fatalf("reward=%#v", reward)
	}
}

func TestMatchingArmoryRewardAcceptsSoleNewUnopenedContainer(t *testing.T) {
	before := domain.InventorySnapshot{Items: []domain.InventoryItem{{ID: "1", Name: "Existing"}}}
	after := domain.InventorySnapshot{Items: []domain.InventoryItem{
		{ID: "1", Name: "Existing"},
		{ID: "2", Name: "Gallery Case", Kind: "container"},
	}}
	// Container offer Items describe possible contents, not the unopened item
	// awarded by Armory redemption.
	offer := domain.ArmoryOffer{Items: []domain.RelatedItem{{MarketName: "AK-47 | Possible drop"}}}

	reward := matchingArmoryReward(before, after, offer)
	if reward == nil || reward.ID != "2" {
		t.Fatalf("reward=%#v", reward)
	}
}

func TestMatchingArmoryRewardRejectsAmbiguousUnmatchedArrivals(t *testing.T) {
	before := domain.InventorySnapshot{Items: []domain.InventoryItem{{ID: "1", Name: "Existing"}}}
	after := domain.InventorySnapshot{Items: []domain.InventoryItem{
		{ID: "1", Name: "Existing"},
		{ID: "2", Name: "First unrelated item"},
		{ID: "3", Name: "Second unrelated item"},
	}}

	if reward := matchingArmoryReward(before, after, domain.ArmoryOffer{}); reward != nil {
		t.Fatalf("ambiguous reward=%#v", reward)
	}
}

func TestIncrementalArmoryRewardNeverExposesLootListIdentifier(t *testing.T) {
	service := NewService()
	reward := service.armoryRewardFromIncremental(
		transport.GCInventoryItem{ID: 2, DefIndex: 1209, Attributes: map[uint32]uint32{113: 42}},
		domain.ArmoryOffer{ItemName: "lootlist:sticker_pack_example"},
	)
	if strings.Contains(strings.ToLower(reward.Name), "lootlist") {
		t.Fatalf("reward name exposed internal schema identifier: %#v", reward)
	}
	if reward.Name != "CS2 item #1209" {
		t.Fatalf("reward name=%q want safe fallback", reward.Name)
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
