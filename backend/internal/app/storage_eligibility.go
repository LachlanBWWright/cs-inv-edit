package app

import (
	"strconv"
	"time"

	"cs-inv-edit/backend/internal/domain"
	"cs-inv-edit/backend/internal/transport"
)

const storageCapacity = 1000

func storageEligibility(item transport.GCInventoryItem, formatted domain.InventoryItem) (bool, string) {
	if formatted.Kind == domain.ItemKindStorageUnit {
		return false, "Storage units cannot be nested."
	}
	if gcItemCasketID(item) != 0 {
		return false, "This item is already in a storage unit."
	}
	if formatted.IsActiveTerminal {
		return false, "Active or sealed terminal items cannot be stored."
	}
	if protectedUntil := item.Attributes[312]; protectedUntil > uint32(time.Now().Unix()) {
		return false, "This item is trade-protected and cannot be transferred yet."
	}
	return true, ""
}

func (s *Service) validateStorageChangeLocked(opType, casketID, itemID string) string {
	var unit, item *domain.InventoryItem
	for index := range s.inventory.Items {
		candidate := &s.inventory.Items[index]
		if candidate.ID == casketID {
			unit = candidate
		}
		if candidate.ID == itemID {
			item = candidate
		}
	}
	if unit == nil || unit.Kind != domain.ItemKindStorageUnit {
		return "storage unit is not present in the current GC inventory"
	}
	if item == nil {
		return "item is not present in the current GC inventory"
	}
	if opType == "storage.move-in" {
		if unit.StorageCount != nil && *unit.StorageCount >= storageCapacity {
			return "storage unit is full"
		}
		if item.StorageEligible == nil || !*item.StorageEligible {
			if item.StorageIneligibleReason != "" {
				return item.StorageIneligibleReason
			}
			return "item cannot be moved into storage"
		}
		return ""
	}
	if item.CasketID == nil || *item.CasketID != strconv.FormatUint(mustStorageID(casketID), 10) {
		return "item is not contained in the selected storage unit"
	}
	return ""
}

func mustStorageID(value string) uint64 {
	parsed, _ := strconv.ParseUint(value, 10, 64)
	return parsed
}
