package app

import (
	"context"
	"fmt"
	"strconv"
	"strings"

	"cs-inv-edit/backend/internal/domain"
)

func (s *Service) reconcileContainerResultOnce(ctx context.Context, before domain.InventorySnapshot, terminal bool) (domain.InventorySnapshot, *domain.InventoryItem, error) {
	snapshot, err := s.fetchInventory(ctx, nil)
	if err != nil {
		return domain.InventorySnapshot{}, nil, fmt.Errorf("post-open inventory refresh failed: %w", err)
	}
	if openedItem := firstNewInventoryItem(before, snapshot); openedItem != nil {
		return snapshot, openedItem, nil
	}
	if terminal {
		if transitioned := firstChangedTerminalItem(before, snapshot); transitioned != nil {
			return snapshot, transitioned, nil
		}
	}
	return snapshot, nil, fmt.Errorf("post-open inventory refresh found no new item; before_count=%d after_count=%d", len(before.Items), len(snapshot.Items))
}

func (s *Service) reconcileNewInventoryItemOnce(ctx context.Context, before domain.InventorySnapshot) (domain.InventorySnapshot, *domain.InventoryItem, error) {
	return s.reconcileContainerResultOnce(ctx, before, false)
}

func firstChangedTerminalItem(before domain.InventorySnapshot, after domain.InventorySnapshot) *domain.InventoryItem {
	beforeByID := make(map[string]domain.InventoryItem, len(before.Items))
	for _, item := range before.Items {
		beforeByID[item.ID] = item
	}
	for index := range after.Items {
		item := &after.Items[index]
		if !isTerminalInventoryItem(*item) {
			continue
		}
		previous, existed := beforeByID[item.ID]
		if !existed || previous.Name != item.Name || previous.MarketName != item.MarketName || !sameDefindex(previous.Defindex, item.Defindex) || !sameTerminalOffers(previous.TerminalOffers, item.TerminalOffers) {
			return item
		}
	}
	return nil
}

func sameTerminalOffers(left []domain.TerminalOffer, right []domain.TerminalOffer) bool {
	if len(left) != len(right) {
		return false
	}
	for index := range left {
		if left[index].FauxItemID != right[index].FauxItemID {
			return false
		}
	}
	return true
}

func sameDefindex(left *uint32, right *uint32) bool {
	if left == nil || right == nil {
		return left == nil && right == nil
	}
	return *left == *right
}

func firstNewInventoryItem(before domain.InventorySnapshot, after domain.InventorySnapshot) *domain.InventoryItem {
	beforeIDs := make(map[string]struct{}, len(before.Items))
	for _, item := range before.Items {
		beforeIDs[item.ID] = struct{}{}
	}
	for i := range after.Items {
		if _, existed := beforeIDs[after.Items[i].ID]; !existed {
			return &after.Items[i]
		}
	}
	return nil
}

func openedInventoryItemName(item *domain.InventoryItem) string {
	if item == nil {
		return "unknown item"
	}
	if item.MarketName != "" {
		return item.MarketName
	}
	if item.Name != "" {
		return item.Name
	}
	if item.Defindex != nil {
		return fmt.Sprintf("CS2 item #%d", *item.Defindex)
	}
	return item.ID
}

func isContainerLikeInventoryItem(item domain.InventoryItem) bool {
	if item.IsTerminal {
		return true
	}
	haystack := strings.ToLower(string(item.Kind) + " " + item.Name + " " + item.MarketName)
	return item.Kind == domain.ItemKindContainer || len(item.ContainerItems) > 0 || strings.Contains(haystack, "capsule") || strings.Contains(haystack, "case") || strings.Contains(haystack, "container") || strings.Contains(haystack, "graffiti box")
}

func isTerminalInventoryItem(item domain.InventoryItem) bool {
	return item.IsTerminal
}

func optionalUint64Input(input map[string]any, key string) (uint64, error) {
	value, ok := input[key]
	if !ok || value == nil {
		return 0, nil
	}
	switch typed := value.(type) {
	case string:
		if strings.TrimSpace(typed) == "" {
			return 0, nil
		}
		parsed, err := strconv.ParseUint(typed, 10, 64)
		if err != nil {
			return 0, fmt.Errorf("%s must be a valid Steam item id", key)
		}
		return parsed, nil
	case float64:
		if typed < 0 || typed != float64(uint64(typed)) {
			return 0, fmt.Errorf("%s must be a valid Steam item id", key)
		}
		return uint64(typed), nil
	default:
		return 0, fmt.Errorf("%s must be a string item id", key)
	}
}

func optionalUint32PointerInput(input map[string]any, key string) (*uint32, error) {
	value, ok := input[key]
	if !ok || value == nil {
		return nil, nil
	}
	parsed, err := requiredUint32Input(input, key)
	if err != nil {
		return nil, err
	}
	return &parsed, nil
}

func requiredUint32Input(input map[string]any, key string) (uint32, error) {
	value, ok := input[key]
	if !ok {
		return 0, fmt.Errorf("%s is required", key)
	}
	var parsed uint64
	var err error
	switch v := value.(type) {
	case float64:
		if v < 0 || v != float64(uint64(v)) {
			return 0, fmt.Errorf("%s must be an unsigned integer", key)
		}
		parsed = uint64(v)
	case string:
		parsed, err = strconv.ParseUint(v, 10, 32)
	default:
		return 0, fmt.Errorf("%s must be an unsigned integer", key)
	}
	if err != nil || parsed > uint64(^uint32(0)) {
		return 0, fmt.Errorf("%s must fit uint32", key)
	}
	return uint32(parsed), nil
}

func firstError(errors ...error) error {
	for _, err := range errors {
		if err != nil {
			return err
		}
	}
	return nil
}
