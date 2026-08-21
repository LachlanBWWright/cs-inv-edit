package app

import (
	"fmt"
	"strconv"
	"strings"

	"cs-inv-edit/backend/internal/domain"
	"cs-inv-edit/backend/internal/operations"
	"cs-inv-edit/backend/internal/protocol"
)

const tradeUpRecipe int16 = 7

func tradeUpItemIDs(input map[string]any) ([]uint64, error) {
	values, ok := input["itemIds"].([]any)
	if !ok {
		return nil, fmt.Errorf("itemIds must be a list")
	}
	ids := make([]uint64, 0, len(values))
	for _, value := range values {
		text, ok := value.(string)
		if !ok {
			return nil, fmt.Errorf("each trade-up item id must be a string")
		}
		id, err := strconv.ParseUint(text, 10, 64)
		if err != nil || id == 0 {
			return nil, fmt.Errorf("each trade-up item id must be a valid Steam item id")
		}
		ids = append(ids, id)
	}
	return ids, nil
}

func tradeUpInventoryItems(
	inventory domain.InventorySnapshot,
	ids []uint64,
) ([]domain.InventoryItem, string) {
	wanted := make(map[string]struct{}, len(ids))
	for _, id := range ids {
		wanted[strconv.FormatUint(id, 10)] = struct{}{}
	}
	items := make([]domain.InventoryItem, 0, len(ids))
	for _, item := range inventory.Items {
		if _, ok := wanted[item.ID]; ok {
			items = append(items, item)
			delete(wanted, item.ID)
		}
	}
	if len(wanted) > 0 {
		return nil, "all trade-up inputs must be present in the current GC inventory"
	}
	return items, ""
}

func validateTradeUpItems(items []domain.InventoryItem) string {
	if len(items) == 0 {
		return "select trade-up inputs"
	}
	required := 10
	if strings.EqualFold(items[0].Rarity, "covert") {
		required = 5
	}
	if len(items) != required {
		return "this trade-up requires exactly " + strconv.Itoa(required) + " items"
	}
	first := items[0]
	for _, item := range items {
		if item.Kind != domain.ItemKindWeaponSkin ||
			item.PaintWear == nil || len(item.TradeUpItems) == 0 {
			return "every input must be an eligible weapon skin with a known trade-up outcome"
		}
		if item.CasketID != nil {
			return "items inside storage units must be removed before a trade-up"
		}
		if item.IsSouvenir {
			return "Souvenir skins cannot be used in trade-ups"
		}
		if item.Rarity != first.Rarity || item.IsStatTrak != first.IsStatTrak {
			return "all inputs must have the same rarity and StatTrak type"
		}
	}
	return ""
}

func (s *Service) submitTradeUp(
	receipt operations.Receipt,
	input map[string]any,
) operations.Receipt {
	s.mu.Lock()
	enabled := s.settings.FeatureFlags.EnableTradeups
	connected := s.connection.State == domain.ConnectionStateConnected
	inventory := cloneInventory(s.inventory)
	_, accountCtx, sessionErr := s.currentGCSessionKeyLocked(protocol.AppIDCS2)
	s.mu.Unlock()
	if !enabled {
		receipt.State, receipt.Message = "blocked_by_feature_flag", "trade-ups are disabled in Settings"
	} else if !connected || sessionErr != nil {
		receipt.State, receipt.Message = "failed", "connect a Steam account before submitting a trade-up"
	} else if ids, err := tradeUpItemIDs(input); err != nil {
		receipt.State, receipt.Message = "failed", err.Error()
	} else if items, detail := tradeUpInventoryItems(inventory, ids); detail != "" {
		receipt.State, receipt.Message = "failed", detail
	} else if detail = validateTradeUpItems(items); detail != "" {
		receipt.State, receipt.Message = "failed", detail
	} else if body, encodeErr := protocol.EncodeCraftRequest(tradeUpRecipe, ids); encodeErr != nil {
		receipt.State, receipt.Message = "failed", "encode trade-up request: "+encodeErr.Error()
	} else if sendErr := s.gcClient.SendToGC(
		accountCtx,
		protocol.AppIDCS2,
		protocol.EMsgCraft,
		body,
	); sendErr != nil {
		receipt.State, receipt.Message = "failed", "send trade-up request: "+sendErr.Error()
	} else {
		receipt.State, receipt.Message = "awaiting_gc_confirmation", "trade-up request sent to CS2"
	}
	s.addEvent(receipt, receipt.State, receipt.Message)
	return receipt
}
