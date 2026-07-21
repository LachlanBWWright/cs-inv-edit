package app

import (
	"context"
	"fmt"
	"log"

	"cs-inv-edit/backend/internal/domain"
	"cs-inv-edit/backend/internal/operations"
	"cs-inv-edit/backend/internal/protocol"
	"cs-inv-edit/backend/internal/transport"
)

func (s *Service) RefreshInventory() operations.Receipt {
	receipt := s.newReceipt("inventory.refresh")
	s.mu.Lock()
	if s.connection.State != "connected" {
		s.inventory.Status = "requires_connection"
		s.inventory.RefreshedAt = now()
		receipt.State = "requires_connection"
		receipt.Message = "connect a Steam account to load inventory"
		s.operations = append(s.operations, receipt)
		s.events = append(s.events, operations.NewEvent(receipt, receipt.State, receipt.Message))
		s.lastOperation = receipt
		s.mu.Unlock()
		return receipt
	}
	s.inventory.Status = "loading"
	s.inventory.Message = "loading CS2 inventory from Steam Game Coordinator"
	s.inventory.Error = ""
	s.inventory.Diagnostics = nil
	s.inventory.RefreshedAt = now()
	s.mu.Unlock()

	snapshot, err := s.fetchInventory(s.setInventoryLoadingStage)

	s.mu.Lock()
	defer s.mu.Unlock()
	if err != nil {
		s.inventory = inventoryError(err.Error(), transport.DiagnosticsFromError(err))
		receipt.State = "failed"
		receipt.Message = err.Error()
	} else {
		s.inventory = snapshot
		receipt.State = "completed"
		receipt.Message = "inventory refreshed"
	}
	s.operations = append(s.operations, receipt)
	s.events = append(s.events, operations.NewEvent(receipt, receipt.State, receipt.Message))
	s.lastOperation = receipt
	return receipt
}

func (s *Service) SubmitOperation(opType string, input map[string]any) operations.Receipt {
	receipt := s.newReceipt(opType)
	if opType == "settings" {
		if next, ok := input["backendUrl"].(string); ok {
			s.mu.Lock()
			s.settings.BackendURL = next
			s.mu.Unlock()
		}
		if next, ok := input["validationMode"].(bool); ok {
			s.mu.Lock()
			s.settings.ValidationMode = next
			s.mu.Unlock()
		}
		if next, ok := input["sacrificialAccountMode"].(bool); ok {
			s.mu.Lock()
			s.settings.SacrificialAccountMode = next
			s.mu.Unlock()
		}
		if next, ok := input["featureFlags"].(map[string]any); ok {
			s.mu.Lock()
			oldFlags := s.settings.FeatureFlags
			flags := oldFlags
			if value, ok := next["enableStorageMutations"].(bool); ok {
				flags.EnableStorageMutations = value
			}
			if value, ok := next["enableContainerOpening"].(bool); ok {
				flags.EnableContainerOpening = value
			}
			if value, ok := next["enableInventoryDebug"].(bool); ok {
				flags.EnableInventoryDebug = value
			}
			if value, ok := next["showStorageUnitItems"].(bool); ok {
				flags.ShowStorageUnitItems = value
			}
			if value, ok := next["enableProtocolConsole"].(bool); ok {
				flags.EnableProtocolConsole = value
			}
			if value, ok := next["enableTradeups"].(bool); ok {
				flags.EnableTradeups = value
			}
			if value, ok := next["enableStickerExtract"].(bool); ok {
				flags.EnableStickerExtract = value
			}
			if value, ok := next["enableNameTags"].(bool); ok {
				flags.EnableNameTags = value
			}
			if value, ok := next["enableItemDeletion"].(bool); ok {
				flags.EnableItemDeletion = value
			}
			if value, ok := next["enableStatTrakSwap"].(bool); ok {
				flags.EnableStatTrakSwap = value
			}
			if value, ok := next["enableStrangeParts"].(bool); ok {
				flags.EnableStrangeParts = value
			}
			if value, ok := next["enableItemUse"].(bool); ok {
				flags.EnableItemUse = value
			}
			if value, ok := next["enableToolApplication"].(bool); ok {
				flags.EnableToolApplication = value
			}
			if value, ok := next["enableGifting"].(bool); ok {
				flags.EnableGifting = value
			}
			if value, ok := next["enableArmoryRead"].(bool); ok {
				flags.EnableArmoryRead = value
			}
			if value, ok := next["enableArmoryRedemption"].(bool); ok {
				flags.EnableArmoryRedemption = value
			}
			if value, ok := next["enableStoreRead"].(bool); ok {
				flags.EnableStoreRead = value
			}
			if value, ok := next["enableStorePurchases"].(bool); ok {
				flags.EnableStorePurchases = value
			}
			if value, ok := next["enableTf2Inventory"].(bool); ok {
				flags.EnableTF2Inventory = value
			}
			if value, ok := next["enableDota2Inventory"].(bool); ok {
				flags.EnableDota2Inventory = value
			}
			if value, ok := next["enableSteamInventory"].(bool); ok {
				flags.EnableSteamInventory = value
			}
			s.settings.FeatureFlags = flags
			s.gcClient.SetProtocolTracing(flags.EnableProtocolConsole)
			if !flags.EnableTF2Inventory {
				s.clearGameInventoriesLocked("tf2")
			}
			if !flags.EnableDota2Inventory {
				s.clearGameInventoriesLocked("dota2")
			}
			if !flags.EnableSteamInventory {
				s.clearGameInventoriesLocked("steam")
			}
			connected := s.connection.State == "connected"
			s.mu.Unlock()
			if connected && ((oldFlags.EnableTF2Inventory && !flags.EnableTF2Inventory) || (oldFlags.EnableDota2Inventory && !flags.EnableDota2Inventory)) {
				if err := s.gcClient.SetGamesPlayed(context.Background(), enabledPresenceApps(flags)); err != nil {
					receipt.State = "failed"
					receipt.Message = "settings were updated, but disabled game GC presence could not be stopped: " + err.Error()
					s.addEvent(receipt, receipt.State, receipt.Message)
					return receipt
				}
			}
		}
		receipt.State = "completed"
		receipt.Message = "settings updated"
		s.addEvent(receipt, receipt.State, receipt.Message)
		return receipt
	}
	if gameID, _ := input["game"].(string); gameID != "" && gameID != "cs2" {
		receipt.State = "failed"
		receipt.Message = "TF2 and Dota 2 inventory modes are read-only; CS2 mutation endpoints reject non-CS2 items"
		s.addEvent(receipt, receipt.State, receipt.Message)
		return receipt
	}
	if opType == "containers.open" {
		s.mu.Lock()
		if !s.settings.FeatureFlags.EnableContainerOpening {
			receipt.State = "blocked_by_feature_flag"
			receipt.Message = "container opening disabled"
			s.operations = append(s.operations, receipt)
			s.events = append(s.events, operations.NewEvent(receipt, receipt.State, receipt.Message))
			s.lastOperation = receipt
			s.mu.Unlock()
			return receipt
		}
		if s.connection.State != "connected" {
			receipt.State = "failed"
			receipt.Message = "connect a Steam account before opening containers"
			s.operations = append(s.operations, receipt)
			s.events = append(s.events, operations.NewEvent(receipt, receipt.State, receipt.Message))
			s.lastOperation = receipt
			s.mu.Unlock()
			return receipt
		}
		s.mu.Unlock()

		ok, message, result := s.openContainer(input)
		if ok {
			receipt.State = "completed"
		} else {
			receipt.State = "failed"
		}
		receipt.Message = message
		receipt.Result = result
		s.addEvent(receipt, receipt.State, receipt.Message)
		return receipt
	}

	state := "queued"
	message := "queued"
	recognizedMutation := false
	s.mu.Lock()
	if opType == "steam.connect" {
		s.connection.State = "connected"
		s.connection.Detail = "connected"
		state = "completed"
		message = "steam connected"
	} else if opType == "steam.guard" {
		s.connection.State = "connected"
		s.connection.Detail = "guard accepted"
		state = "completed"
		message = "steam guard accepted"
	} else if opType == "steam.disconnect" {
		s.connection.State = "disconnected"
		s.connection.Detail = "disconnected"
		state = "completed"
		message = "steam disconnected"
	} else if stringsHasPrefixAny(opType, "storage.") {
		recognizedMutation = true
		if !s.settings.FeatureFlags.EnableStorageMutations {
			state = "blocked_by_feature_flag"
			message = "storage mutations require feature flag"
		}
	} else if opType == "tradeups.execute" || opType == "tradeups.preview" {
		recognizedMutation = true
		if !s.settings.FeatureFlags.EnableTradeups {
			state = "blocked_by_feature_flag"
			message = "trade-ups disabled"
		} else if s.settings.ValidationMode {
			state = "requires_validation"
			message = "live validation required"
		}
	} else if opType == "stickers.extract" {
		recognizedMutation = true
		if !s.settings.FeatureFlags.EnableStickerExtract {
			state = "blocked_by_feature_flag"
			message = "sticker extract disabled"
		} else if s.settings.ValidationMode {
			state = "requires_validation"
			message = "sticker workflow requires live validation"
		}
	} else if opType == "nametags.apply" || opType == "nametags.remove" {
		recognizedMutation = true
		if !s.settings.FeatureFlags.EnableNameTags {
			state = "blocked_by_feature_flag"
			message = "name tag operations disabled"
		} else if s.connection.State != "connected" {
			state = "awaiting_gc_confirmation"
			message = "awaiting GC confirmation"
		} else {
			var ok bool
			var detail string
			if opType == "nametags.apply" {
				ok, detail = s.applyNameTag(input)
			} else {
				ok, detail = s.removeNameTag(input)
			}
			if ok {
				state = "completed"
				message = detail
			} else {
				state = "failed"
				message = detail
			}
		}
	} else if opType == "items.delete" {
		recognizedMutation = true
		if !s.settings.FeatureFlags.EnableItemDeletion {
			state = "blocked_by_feature_flag"
			message = "item deletion disabled"
		} else if s.settings.ValidationMode {
			state = "requires_validation"
			message = "item deletion requires live validation"
		}
	} else if opType == "stattrak.swap" {
		recognizedMutation = true
		if !s.settings.FeatureFlags.EnableStatTrakSwap {
			state = "blocked_by_feature_flag"
			message = "stattrak swap disabled"
		} else if s.settings.ValidationMode {
			state = "requires_validation"
			message = "stattrak swap requires live validation"
		}
	} else if opType == "strange-parts.apply" {
		recognizedMutation = true
		if !s.settings.FeatureFlags.EnableStrangeParts {
			state = "blocked_by_feature_flag"
			message = "strange part application disabled"
		} else if s.settings.ValidationMode {
			state = "requires_validation"
			message = "strange part application requires live validation"
		}
	} else if opType == "items.use" || opType == "items.use-multiple" {
		recognizedMutation = true
		if !s.settings.FeatureFlags.EnableItemUse {
			state = "blocked_by_feature_flag"
			message = "item use operations disabled"
		} else if s.settings.ValidationMode {
			state = "requires_validation"
			message = "item use requires live validation"
		}
	} else if opType == "tools.apply" || opType == "tools.apply-base" {
		recognizedMutation = true
		if !s.settings.FeatureFlags.EnableToolApplication {
			state = "blocked_by_feature_flag"
			message = "tool application disabled"
		} else if s.settings.ValidationMode {
			state = "requires_validation"
			message = "tool application requires live validation"
		}
	} else if opType == "gifts.send" {
		recognizedMutation = true
		if !s.settings.FeatureFlags.EnableGifting {
			state = "blocked_by_feature_flag"
			message = "gifting disabled"
		} else if s.settings.ValidationMode {
			state = "requires_validation"
			message = "gifting requires live validation"
		}
	}
	if recognizedMutation && state == "queued" {
		state = "awaiting_gc_confirmation"
		message = "awaiting GC confirmation"
	}
	receipt.State = state
	receipt.Message = message
	if receipt.Result == nil {
		if mapping, ok := protocol.OperationMessageMapping(opType); ok {
			receipt.Result = map[string]any{
				"operation":     mapping.Operation,
				"requestEmsg":   mapping.RequestEMsg,
				"requestBody":   mapping.RequestBody,
				"responseEMsgs": mapping.ResponseEMsgs,
				"source":        mapping.Source,
				"status":        mapping.Status,
				"featureFlag":   mapping.FeatureFlag,
				"notes":         mapping.Notes,
			}
		}
	}
	fmt.Printf("[backend] operation=%s state=%s message=%s\n", opType, state, message)
	s.operations = append(s.operations, receipt)
	s.events = append(s.events, operations.NewEvent(receipt, state, message))
	s.lastOperation = receipt
	s.mu.Unlock()
	return receipt
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
	connected := s.connection.State == "connected"
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
