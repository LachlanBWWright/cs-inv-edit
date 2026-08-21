package app

import (
	"context"
	"fmt"
	"strconv"

	"cs-inv-edit/backend/internal/domain"
	"cs-inv-edit/backend/internal/operations"
	cs2pb "cs-inv-edit/backend/internal/proto/gametracking"
	"cs-inv-edit/backend/internal/protocol"
)

func (s *Service) SubmitOperation(opType string, input map[string]any) operations.Receipt {
	operation := operations.Type(opType)
	receipt := s.newReceipt(opType)
	if operation == operations.TypeSettings {
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
		if next, ok := input["animations"].(map[string]any); ok {
			s.mu.Lock()
			animations := s.settings.Animations
			if value, ok := revealAnimationInput(next["container"]); ok {
				animations.Container = value
			}
			if value, ok := tradeUpAnimationInput(next["tradeUp"]); ok {
				animations.TradeUp = value
			}
			if value, ok := revealAnimationInput(next["armory"]); ok {
				animations.Armory = value
			}
			if value, ok := revealAnimationInput(next["terminal"]); ok {
				animations.Terminal = value
			}
			s.settings.Animations = animations
			s.mu.Unlock()
		}
		if next, ok := input["featureFlags"].(map[string]any); ok {
			s.mu.Lock()
			oldFlags := s.settings.FeatureFlags
			flags := oldFlags
			optionalBoolSetting(next, "enableStorageMutations", &flags.EnableStorageMutations)
			optionalBoolSetting(next, "enableContainerOpening", &flags.EnableContainerOpening)
			optionalBoolSetting(next, "enableInventoryDebug", &flags.EnableInventoryDebug)
			optionalBoolSetting(next, "showStorageUnitItems", &flags.ShowStorageUnitItems)
			optionalBoolSetting(next, "enableProtocolConsole", &flags.EnableProtocolConsole)
			optionalBoolSetting(next, "enableTradeups", &flags.EnableTradeups)
			optionalBoolSetting(next, "enableNameTags", &flags.EnableNameTags)
			optionalBoolSetting(next, "enableItemDeletion", &flags.EnableItemDeletion)
			optionalBoolSetting(next, "enableStatTrakSwap", &flags.EnableStatTrakSwap)
			optionalBoolSetting(next, "enableStrangeParts", &flags.EnableStrangeParts)
			optionalBoolSetting(next, "enableItemUse", &flags.EnableItemUse)
			optionalBoolSetting(next, "enableToolApplication", &flags.EnableToolApplication)
			optionalBoolSetting(next, "enableGifting", &flags.EnableGifting)
			optionalBoolSetting(next, "enableArmoryRead", &flags.EnableArmoryRead)
			optionalBoolSetting(next, "enableArmoryRedemption", &flags.EnableArmoryRedemption)
			optionalBoolSetting(next, "enableStoreRead", &flags.EnableStoreRead)
			optionalBoolSetting(next, "enableStorePurchases", &flags.EnableStorePurchases)
			optionalBoolSetting(next, "enableFullCs2Store", &flags.EnableFullCS2Store)
			optionalBoolSetting(next, "enableTf2Inventory", &flags.EnableTF2Inventory)
			optionalBoolSetting(next, "enableTf2Store", &flags.EnableTF2Store)
			optionalBoolSetting(next, "enableTf2Loadouts", &flags.EnableTF2Loadouts)
			optionalBoolSetting(next, "enableCs2Loadouts", &flags.EnableCS2Loadouts)
			optionalBoolSetting(next, "enableTf2ItemUse", &flags.EnableTF2ItemUse)
			optionalBoolSetting(next, "enableTf2Tools", &flags.EnableTF2Tools)
			optionalBoolSetting(next, "enableTf2Crafting", &flags.EnableTF2Crafting)
			optionalBoolSetting(next, "enableTf2Unboxing", &flags.EnableTF2Unboxing)
			optionalBoolSetting(next, "enableTf2Customization", &flags.EnableTF2Customization)
			optionalBoolSetting(next, "enableDota2Inventory", &flags.EnableDota2Inventory)
			optionalBoolSetting(next, "enableSteamInventory", &flags.EnableSteamInventory)
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
			connected := s.connection.State == domain.ConnectionStateConnected
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
	if _, ok := protocol.TF2OperationMapping(opType); ok {
		return s.submitTF2Operation(receipt, opType, input)
	}
	if _, ok := protocol.CS2FeatureOperationMapping(opType); ok {
		return s.submitCS2FeatureOperation(receipt, opType, input)
	}
	if gameID, _ := input["game"].(string); gameID != "" && gameID != "cs2" {
		receipt.State = "failed"
		receipt.Message = "TF2 and Dota 2 inventory modes are read-only; CS2 mutation endpoints reject non-CS2 items"
		s.addEvent(receipt, receipt.State, receipt.Message)
		return receipt
	}
	if operation == operations.TypeContainersOpen {
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
		if s.connection.State != domain.ConnectionStateConnected {
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
	if operation == operations.TypeStorageLoad {
		casketIDText, _ := input["casketId"].(string)
		casketID, parseErr := strconv.ParseUint(casketIDText, 10, 64)
		s.mu.Lock()
		enabled := s.settings.FeatureFlags.EnableStorageMutations
		connected := s.connection.State == domain.ConnectionStateConnected
		if parseErr == nil && casketID != 0 && enabled && connected {
			s.loadedStorageUnits[casketID] = true
		}
		s.mu.Unlock()
		switch {
		case !enabled:
			receipt.State, receipt.Message = "blocked_by_feature_flag", "storage operations disabled"
		case !connected:
			receipt.State, receipt.Message = "failed", "connect a Steam account before loading storage contents"
		case parseErr != nil || casketID == 0:
			receipt.State, receipt.Message = "failed", "storage unit id must be a valid Steam item id"
		default:
			receipt.State, receipt.Message = "completed", "storage unit selected for contents loading"
		}
		s.addEvent(receipt, receipt.State, receipt.Message)
		return receipt
	}
	if operation == operations.TypeTerminalLoadOffer {
		terminalIDText, _ := input["terminalId"].(string)
		s.mu.Lock()
		connected := s.connection.State == domain.ConnectionStateConnected
		_, accountCtx, sessionErr := s.currentGCSessionKeyLocked(protocol.AppIDCS2)
		s.mu.Unlock()
		if !connected || sessionErr != nil {
			receipt.State, receipt.Message = "failed", "connect a Steam account before loading a terminal offer"
			s.addEvent(receipt, receipt.State, receipt.Message)
			return receipt
		}
		_, state, message, result := s.resumeTerminalOffer(accountCtx, terminalIDText)
		receipt.State = operations.State(state)
		receipt.Message = message
		receipt.Result = result
		s.addEvent(receipt, receipt.State, receipt.Message)
		return receipt
	}
	if operation == operations.TypeStorageMoveIn || operation == operations.TypeStorageMoveOut {
		casketIDText, _ := input["casketId"].(string)
		itemIDText, _ := input["itemId"].(string)
		casketID, casketParseErr := strconv.ParseUint(casketIDText, 10, 64)
		itemID, itemParseErr := strconv.ParseUint(itemIDText, 10, 64)
		s.mu.Lock()
		enabled := s.settings.FeatureFlags.EnableStorageMutations
		connected := s.connection.State == domain.ConnectionStateConnected
		storageValidation := s.validateStorageChangeLocked(opType, casketIDText, itemIDText)
		_, accountCtx, sessionErr := s.currentGCSessionKeyLocked(protocol.AppIDCS2)
		s.mu.Unlock()
		switch {
		case !enabled:
			receipt.State, receipt.Message = "blocked_by_feature_flag", "storage operations disabled"
		case !connected || sessionErr != nil:
			receipt.State, receipt.Message = "failed", "connect a Steam account before changing storage contents"
		case casketParseErr != nil || casketID == 0 || itemParseErr != nil || itemID == 0:
			receipt.State, receipt.Message = "failed", "storage unit and item ids must be valid Steam item ids"
		case storageValidation != "":
			receipt.State, receipt.Message = "failed", storageValidation
		default:
			body, encodeErr := cs2pb.EncodeCasketItem(casketID, itemID)
			if encodeErr != nil {
				receipt.State, receipt.Message = "failed", "encode storage change request: "+encodeErr.Error()
			} else {
				emsg := protocol.EMsgCasketItemExtract
				if operation == operations.TypeStorageMoveIn {
					emsg = protocol.EMsgCasketItemAdd
				}
				if sendErr := s.gcClient.SendProtoToGC(accountCtx, protocol.AppIDCS2, emsg, body); sendErr != nil {
					receipt.State, receipt.Message = "failed", "send storage change request: "+sendErr.Error()
				} else {
					receipt.State, receipt.Message = "awaiting_gc_confirmation", "storage change request sent to CS2"
				}
			}
		}
		s.addEvent(receipt, receipt.State, receipt.Message)
		return receipt
	}
	if operation == operations.TypeTradeupsExecute {
		return s.submitTradeUp(receipt, input)
	}

	state := operations.StateQueued
	message := "queued"
	recognizedMutation := false
	s.mu.Lock()
	if operation == operations.TypeSteamConnect {
		s.connection.State = "connected"
		s.connection.Detail = "connected"
		state = "completed"
		message = "steam connected"
	} else if operation == operations.TypeSteamGuard {
		s.connection.State = "connected"
		s.connection.Detail = "guard accepted"
		state = "completed"
		message = "steam guard accepted"
	} else if operation == operations.TypeSteamDisconnect {
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
	} else if operation == operations.TypeTradeupsPreview {
		recognizedMutation = true
		if !s.settings.FeatureFlags.EnableTradeups {
			state = "blocked_by_feature_flag"
			message = "trade-ups disabled"
		} else if s.settings.ValidationMode {
			state = "requires_validation"
			message = "live validation required"
		}
	} else if operation == operations.TypeNametagsApply || operation == operations.TypeNametagsRemove {
		recognizedMutation = true
		if !s.settings.FeatureFlags.EnableNameTags {
			state = "blocked_by_feature_flag"
			message = "name tag operations disabled"
		} else if s.connection.State != domain.ConnectionStateConnected {
			state = "awaiting_gc_confirmation"
			message = "awaiting GC confirmation"
		} else {
			var ok bool
			var detail string
			if operation == operations.TypeNametagsApply {
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
	} else if operation == operations.TypeItemsDelete {
		recognizedMutation = true
		if !s.settings.FeatureFlags.EnableItemDeletion {
			state = "blocked_by_feature_flag"
			message = "item deletion disabled"
		} else if s.settings.ValidationMode {
			state = "requires_validation"
			message = "item deletion requires live validation"
		}
	} else if operation == operations.TypeStattrakSwap {
		recognizedMutation = true
		if !s.settings.FeatureFlags.EnableStatTrakSwap {
			state = "blocked_by_feature_flag"
			message = "stattrak swap disabled"
		} else if s.settings.ValidationMode {
			state = "requires_validation"
			message = "stattrak swap requires live validation"
		}
	} else if operation == operations.TypeStrangePartsApply {
		recognizedMutation = true
		if !s.settings.FeatureFlags.EnableStrangeParts {
			state = "blocked_by_feature_flag"
			message = "strange part application disabled"
		} else if s.settings.ValidationMode {
			state = "requires_validation"
			message = "strange part application requires live validation"
		}
	} else if operation == operations.TypeItemsUse || operation == operations.TypeItemsUseMultiple {
		recognizedMutation = true
		if !s.settings.FeatureFlags.EnableItemUse {
			state = "blocked_by_feature_flag"
			message = "item use operations disabled"
		} else if s.settings.ValidationMode {
			state = "requires_validation"
			message = "item use requires live validation"
		}
	} else if operation == operations.TypeToolsApply || operation == operations.TypeToolsApplyBase {
		recognizedMutation = true
		if !s.settings.FeatureFlags.EnableToolApplication {
			state = "blocked_by_feature_flag"
			message = "tool application disabled"
		} else if s.settings.ValidationMode {
			state = "requires_validation"
			message = "tool application requires live validation"
		}
	} else if operation == operations.TypeGiftsSend {
		recognizedMutation = true
		if !s.settings.FeatureFlags.EnableGifting {
			state = "blocked_by_feature_flag"
			message = "gifting disabled"
		} else if s.settings.ValidationMode {
			state = "requires_validation"
			message = "gifting requires live validation"
		}
	}
	if recognizedMutation && state == operations.StateQueued {
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
