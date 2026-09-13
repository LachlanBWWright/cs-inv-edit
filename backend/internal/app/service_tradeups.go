package app

import (
	"context"
	"fmt"
	"strconv"
	"strings"
	"time"

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
	connected := steamConnected(s.connection)
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
		operationID := receipt.OperationID
		before := cloneInventory(inventory)
		go s.reconcileCS2TradeUp(operationID, before, ids)
	}
	s.addEvent(receipt, receipt.State, receipt.Message)
	return receipt
}

func (s *Service) reconcileCS2TradeUp(operationID string, before domain.InventorySnapshot, consumedIDs []uint64) {
	ctx, cancel := context.WithTimeout(context.Background(), 45*time.Second)
	defer cancel()
	response, err := s.gcClient.WaitForCS2CraftResponse(ctx)
	if err != nil {
		s.updateTradeUpReceipt(operationID, operations.StateReconcilingInventory, "CS2 craft was sent, but no craft response was received before timeout", map[string]any{"diagnostics": []string{err.Error()}})
		return
	}
	result := map[string]any{
		"recipe":          response.Recipe,
		"gainedItemIds":   uint64Strings(response.GainedItemIDs),
		"consumedItemIds": uint64Strings(consumedIDs),
		"beforeItemCount": len(before.Items),
	}
	after, refreshErr := s.fetchInventory(ctx, nil)
	if refreshErr != nil {
		result["diagnostics"] = []string{"craft response received, but inventory refresh failed: " + refreshErr.Error()}
		s.updateTradeUpReceipt(operationID, operations.StateReconcilingInventory, "CS2 craft response received; inventory reconciliation is still pending", result)
		return
	}
	result["afterItemCount"] = len(after.Items)
	consumedMissing := missingInventoryIDs(after, consumedIDs)
	gainedPresent := presentInventoryIDs(after, response.GainedItemIDs)
	result["consumedMissing"] = uint64Strings(consumedMissing)
	result["gainedPresent"] = uint64Strings(gainedPresent)
	s.mu.Lock()
	s.inventory = after
	s.mu.Unlock()
	if response.Recipe != tradeUpRecipe || len(response.GainedItemIDs) == 0 || len(consumedMissing) != len(consumedIDs) || len(gainedPresent) != len(response.GainedItemIDs) {
		result["diagnostics"] = []string{"CS2 returned a craft response, but the refreshed inventory does not yet match the consumed/output IDs"}
		s.updateTradeUpReceipt(operationID, operations.StateReconcilingInventory, "CS2 craft response received; inventory reconciliation is still pending", result)
		return
	}
	s.updateTradeUpReceipt(operationID, operations.StateCompleted, "CS2 trade-up completed and inventory reconciled", result)
}

func missingInventoryIDs(snapshot domain.InventorySnapshot, ids []uint64) []uint64 {
	present := make(map[string]struct{}, len(snapshot.Items))
	for _, item := range snapshot.Items {
		present[item.ID] = struct{}{}
	}
	missing := make([]uint64, 0)
	for _, id := range ids {
		if _, ok := present[strconv.FormatUint(id, 10)]; !ok {
			missing = append(missing, id)
		}
	}
	return missing
}

func presentInventoryIDs(snapshot domain.InventorySnapshot, ids []uint64) []uint64 {
	present := make(map[string]struct{}, len(snapshot.Items))
	for _, item := range snapshot.Items {
		present[item.ID] = struct{}{}
	}
	found := make([]uint64, 0)
	for _, id := range ids {
		if _, ok := present[strconv.FormatUint(id, 10)]; ok {
			found = append(found, id)
		}
	}
	return found
}

func (s *Service) updateTradeUpReceipt(operationID string, state operations.State, message string, result map[string]any) {
	s.mu.Lock()
	defer s.mu.Unlock()
	for index := range s.operations {
		if s.operations[index].OperationID != operationID {
			continue
		}
		s.operations[index].State = state
		s.operations[index].Message = message
		s.operations[index].Result = result
		s.events = append(s.events, operations.NewEvent(s.operations[index], state, message))
		s.lastOperation = s.operations[index]
		return
	}
}
