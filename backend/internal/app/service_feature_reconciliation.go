package app

import (
	"fmt"
	"strconv"
	"time"

	"cs-inv-edit/backend/internal/operations"
	"cs-inv-edit/backend/internal/transport"
)

func (s *Service) reconcileCS2FeatureOperations(snapshot transport.CS2FeatureSnapshot) {
	s.mu.Lock()
	defer s.mu.Unlock()
	current := time.Now().UTC()
	for index := range s.operations {
		receipt := &s.operations[index]
		if receipt.State != operations.StateAwaitingGCConfirmation || len(receipt.Type) < 4 || receipt.Type[:4] != "cs2." {
			continue
		}
		created, err := time.Parse(time.RFC3339Nano, receipt.CreatedAt)
		if err != nil {
			continue
		}
		result, _ := receipt.Result.(map[string]any)
		confirmed := false
		switch receipt.Type {
		case "cs2.loadout.set":
			classID, slotID := resultUint32(result["classId"]), resultUint32(result["slotId"])
			itemID := fmt.Sprint(result["itemId"])
			for _, entry := range snapshot.EquipSlots {
				confirmed = confirmed || entry.ClassID == classID && entry.SlotID == slotID && entry.ItemID == itemID
			}
		case "cs2.inspect.resolve":
			confirmed = timestampAfter(snapshot.InspectedAt, created)
		case "cs2.matches.recent", "cs2.matches.details":
			confirmed = timestampAfter(snapshot.RefreshedAt, created) && len(snapshot.Matches) > 0
		case "cs2.profile.refresh":
			confirmed = timestampAfter(snapshot.RefreshedAt, created) && snapshot.Profile != nil
		case "cs2.progression.refresh":
			confirmed = timestampAfter(snapshot.RefreshedAt, created) && snapshot.RecurringSchema != nil
		}
		if confirmed {
			receipt.State, receipt.Message = "completed", "CS2 Game Coordinator state confirmed the operation"
			s.events = append(s.events, operations.NewEvent(*receipt, receipt.State, receipt.Message))
			continue
		}
		if current.Sub(created) >= 15*time.Second {
			receipt.State, receipt.Message = "failed", "CS2 Game Coordinator did not confirm the request before timeout; it was not retried"
			s.events = append(s.events, operations.NewEvent(*receipt, receipt.State, receipt.Message))
		}
	}
}

func (s *Service) reconcileTF2Operations(snapshot transport.TF2FeatureSnapshot) {
	s.mu.Lock()
	defer s.mu.Unlock()
	nowTime := time.Now().UTC()
	for index := range s.operations {
		receipt := &s.operations[index]
		if receipt.State != operations.StateAwaitingGCConfirmation || len(receipt.Type) < 4 || receipt.Type[:4] != "tf2." {
			continue
		}
		created, err := time.Parse(time.RFC3339Nano, receipt.CreatedAt)
		if err != nil {
			continue
		}
		result, _ := receipt.Result.(map[string]any)
		if tf2ReceiptConfirmed(*receipt, result, snapshot, created) {
			receipt.State = "completed"
			receipt.Message = "TF2 Game Coordinator state confirmed the operation"
			s.events = append(s.events, operations.NewEvent(*receipt, receipt.State, receipt.Message))
			s.lastOperation = *receipt
			continue
		}
		if nowTime.Sub(created) >= 15*time.Second {
			receipt.State = "failed"
			receipt.Message = "TF2 Game Coordinator did not confirm the operation before timeout; it was not retried"
			s.events = append(s.events, operations.NewEvent(*receipt, receipt.State, receipt.Message))
			s.lastOperation = *receipt
		}
	}
}

func tf2ReceiptConfirmed(receipt operations.Receipt, result map[string]any, snapshot transport.TF2FeatureSnapshot, created time.Time) bool {
	switch receipt.Type {
	case "tf2.loadout.set-preset-item":
		classID, presetID, slotID := resultUint32(result["classId"]), resultUint32(result["presetId"]), resultUint32(result["slotId"])
		itemID := fmt.Sprint(result["itemId"])
		for _, entry := range snapshot.PresetItems {
			if entry.ClassID == classID && entry.PresetID == presetID && entry.SlotID == slotID && entry.ItemID == itemID {
				return true
			}
		}
	case "tf2.loadout.select-preset":
		classID, presetID := resultUint32(result["classId"]), resultUint32(result["presetId"])
		for _, entry := range snapshot.ClassPresets {
			if entry.ClassID == classID && entry.ActivePresetID == presetID {
				return true
			}
		}
	case "tf2.inspect.resolve":
		return timestampAfter(snapshot.InspectedAt, created)
	case "tf2.market.refresh":
		return timestampAfter(snapshot.MarketAt, created)
	case "tf2.matches.load":
		return timestampAfter(snapshot.RefreshedAt, created) && len(snapshot.Matches) > 0
	case "tf2.matches.stats":
		return timestampAfter(snapshot.RefreshedAt, created) && snapshot.Matchmaking != nil
	}
	return false
}

func resultUint32(value any) uint32 {
	switch typed := value.(type) {
	case float64:
		return uint32(typed)
	case uint32:
		return typed
	case int:
		return uint32(typed)
	case string:
		parsed, _ := strconv.ParseUint(typed, 10, 32)
		return uint32(parsed)
	default:
		return 0
	}
}
func timestampAfter(value string, reference time.Time) bool {
	parsed, err := time.Parse(time.RFC3339Nano, value)
	return err == nil && !parsed.Before(reference)
}
