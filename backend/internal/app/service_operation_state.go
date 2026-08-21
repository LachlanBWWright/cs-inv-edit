package app

import (
	"context"
	"log"

	"cs-inv-edit/backend/internal/domain"
	"cs-inv-edit/backend/internal/operations"
	"cs-inv-edit/backend/internal/protocol"
	"cs-inv-edit/backend/internal/transport"
)

func (s *Service) RefreshInventory() operations.Receipt {
	receipt := s.newReceipt("inventory.refresh")
	s.mu.Lock()
	if s.connection.State != domain.ConnectionStateConnected && s.connection.State != domain.ConnectionStateSessionConflict {
		s.inventory.Status = domain.SnapshotStatusRequiresConnection
		s.inventory.RefreshedAt = now()
		receipt.State = "requires_connection"
		receipt.Message = "connect a Steam account to load inventory"
		s.operations = append(s.operations, receipt)
		s.events = append(s.events, operations.NewEvent(receipt, receipt.State, receipt.Message))
		s.lastOperation = receipt
		s.mu.Unlock()
		return receipt
	}
	s.inventory.Status = domain.SnapshotStatusLoading
	s.inventory.Message = "loading CS2 inventory from Steam Game Coordinator"
	s.inventory.Error = ""
	s.inventory.Diagnostics = nil
	s.inventory.RefreshedAt = now()
	requestKey, accountCtx, _ := s.currentGCSessionKeyLocked(protocol.AppIDCS2)
	s.mu.Unlock()
	snapshot, err := s.fetchInventory(accountCtx, s.setInventoryLoadingStage)
	s.mu.Lock()
	defer s.mu.Unlock()
	currentKey, _, currentKeyErr := s.currentGCSessionKeyLocked(protocol.AppIDCS2)
	if currentKeyErr != nil || currentKey != requestKey {
		receipt.State = "completed"
		receipt.Message = "inventory refresh superseded by an account change"
		s.operations = append(s.operations, receipt)
		s.events = append(s.events, operations.NewEvent(receipt, receipt.State, receipt.Message))
		s.lastOperation = receipt
		return receipt
	}
	if err != nil {
		s.inventory = inventoryError(err.Error(), transport.DiagnosticsFromError(err))
		receipt.State = "failed"
		receipt.Message = err.Error()
		if transport.IsSteamSessionConflict(err) {
			s.connection.State = domain.ConnectionStateSessionConflict
			s.connection.Detail = "This Steam account is active in another Steam or CS2 session. Close CS2 or sign out there, then retry the inventory sync."
			s.connection.Diagnostics = transport.DiagnosticsFromError(err)
		}
	} else {
		s.inventory = snapshot
		if s.connection.State == domain.ConnectionStateSessionConflict {
			s.connection.State = domain.ConnectionStateConnected
			s.connection.Detail = "Steam and CS2 Game Coordinator session recovered"
			s.connection.Diagnostics = nil
		}
		receipt.State = "completed"
		receipt.Message = "inventory refreshed"
	}
	s.operations = append(s.operations, receipt)
	s.events = append(s.events, operations.NewEvent(receipt, receipt.State, receipt.Message))
	s.lastOperation = receipt
	return receipt
}

func revealAnimationInput(value any) (string, bool) {
	mode, ok := value.(string)
	if !ok {
		return "", false
	}
	switch mode {
	case "none", "countdown", "slot-machine":
		return mode, true
	default:
		return "", false
	}
}

func optionalBoolSetting(input map[string]any, key string, target *bool) {
	if value, ok := input[key].(bool); ok {
		*target = value
	}
}
func tradeUpAnimationInput(value any) (string, bool) {
	mode, ok := value.(string)
	if !ok {
		return "", false
	}
	switch mode {
	case "none", "countdown", "slot-machine", "contract-none", "contract-countdown", "contract-slot-machine":
		return mode, true
	default:
		return "", false
	}
}
func (s *Service) Operations() []operations.Receipt {
	s.mu.Lock()
	defer s.mu.Unlock()
	out := make([]operations.Receipt, len(s.operations))
	copy(out, s.operations)
	return out
}
func (s *Service) Events() []operations.Event {
	s.mu.Lock()
	defer s.mu.Unlock()
	out := make([]operations.Event, len(s.events))
	copy(out, s.events)
	return out
}
func (s *Service) Settings() domain.Settings {
	s.mu.Lock()
	defer s.mu.Unlock()
	return cloneSettings(s.settings)
}

func (s *Service) UpdateSettings(next domain.Settings) domain.Settings {
	if next.ArmoryPurchasePacingSeconds < 1 {
		next.ArmoryPurchasePacingSeconds = 1
	}
	if next.ArmoryPurchasePacingSeconds > 60 {
		next.ArmoryPurchasePacingSeconds = 60
	}
	s.mu.Lock()
	oldFlags := s.settings.FeatureFlags
	s.settings = next
	if !next.FeatureFlags.EnableTF2Inventory {
		s.clearGameInventoriesLocked("tf2")
	}
	if !next.FeatureFlags.EnableDota2Inventory {
		s.clearGameInventoriesLocked("dota2")
	}
	if !next.FeatureFlags.EnableSteamInventory {
		s.clearGameInventoriesLocked("steam")
	}
	connected := s.connection.State == domain.ConnectionStateConnected
	s.mu.Unlock()
	if connected && ((oldFlags.EnableTF2Inventory && !next.FeatureFlags.EnableTF2Inventory) || (oldFlags.EnableDota2Inventory && !next.FeatureFlags.EnableDota2Inventory)) {
		if err := s.gcClient.SetGamesPlayed(context.Background(), enabledPresenceApps(next.FeatureFlags)); err != nil {
			log.Printf("[multi-game] failed to stop disabled game GC presence: %v", err)
		}
	}
	receipt := s.newReceipt("settings")
	s.addEvent(receipt, "completed", "settings updated")
	return s.Settings()
}

func enabledPresenceApps(flags domain.FeatureFlags) []uint32 {
	apps := []uint32{protocol.AppIDCS2}
	if flags.EnableTF2Inventory {
		apps = append(apps, 440)
	}
	if flags.EnableDota2Inventory {
		apps = append(apps, 570)
	}
	return apps
}
