package app

import (
	"fmt"
	"sync"
	"time"

	"cs-inv-edit/backend/internal/domain"
	"cs-inv-edit/backend/internal/operations"
	"cs-inv-edit/backend/internal/transport"
)

type HealthStatus struct {
	Status  string `json:"status"`
	Service string `json:"service"`
	Version string `json:"version"`
	Time    string `json:"time"`
}

type Service struct {
	mu            sync.Mutex
	events        []operations.Event
	operations    []operations.Receipt
	inventory     domain.InventorySnapshot
	settings      domain.Settings
	connection      domain.ConnectionStatus
	lastOperation   operations.Receipt
	pendingUsername string
	pendingPassword string
}

func NewService() *Service {
	service := &Service{
		inventory:  fixtureInventory(),
		settings:   defaultSettings(),
		connection: domain.ConnectionStatus{State: "disconnected"},
	}
	service.events = []operations.Event{{
		OperationID: "system",
		Type:        "log",
		State:       "queued",
		Message:     "backend started",
		CreatedAt:   now(),
	}}
	return service
}

func (s *Service) Health() HealthStatus {
	return HealthStatus{
		Status:  "ok",
		Service: "cs2-backend",
		Version: "0.0.0",
		Time:    now(),
	}
}

func (s *Service) Inventory() domain.InventorySnapshot {
	s.mu.Lock()
	defer s.mu.Unlock()
	return cloneInventory(s.inventory)
}

func (s *Service) RefreshInventory() operations.Receipt {
	receipt := s.newReceipt("inventory.refresh")
	s.mu.Lock()
	s.inventory.RefreshedAt = now()
	s.mu.Unlock()
	s.addEvent(receipt, "completed", "inventory refreshed")
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
			flags := s.settings.FeatureFlags
			if value, ok := next["enableStorageMutations"].(bool); ok {
				flags.EnableStorageMutations = value
			}
			if value, ok := next["enableTradeups"].(bool); ok {
				flags.EnableTradeups = value
			}
			if value, ok := next["enableStickerExtract"].(bool); ok {
				flags.EnableStickerExtract = value
			}
			if value, ok := next["enableStickerRemove"].(bool); ok {
				flags.EnableStickerRemove = value
			}
			if value, ok := next["enableStickerApply"].(bool); ok {
				flags.EnableStickerApply = value
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
			s.mu.Lock()
			s.settings.FeatureFlags = flags
			s.mu.Unlock()
		}
		receipt.State = "completed"
		receipt.Message = "settings updated"
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
	} else if stringsHasPrefixAny(opType, "stickers.") {
		recognizedMutation = true
		if !s.settings.FeatureFlags.EnableStickerApply && opType == "stickers.apply" {
			state = "blocked_by_feature_flag"
			message = "sticker apply disabled"
		} else if !s.settings.FeatureFlags.EnableStickerRemove && opType == "stickers.remove" {
			state = "blocked_by_feature_flag"
			message = "sticker remove disabled"
		} else if !s.settings.FeatureFlags.EnableStickerExtract && opType == "stickers.extract" {
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
		} else if s.settings.ValidationMode {
			state = "requires_validation"
			message = "name tag workflow requires live validation"
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
	s.mu.Lock()
	s.settings = next
	s.mu.Unlock()
	receipt := s.newReceipt("settings")
	s.addEvent(receipt, "completed", "settings updated")
	return s.Settings()
}

func (s *Service) ConnectSteam(input map[string]any) domain.ConnectionStatus {
	username, _ := input["username"].(string)
	password, _ := input["password"].(string)

	if username == "" || password == "" {
		return domain.ConnectionStatus{State: "error", Detail: "Username and password required"}
	}

	steamClient := transport.NewSteamClient()
	state, err := steamClient.ValidateCredentials(username, password, "")

	s.mu.Lock()
	defer s.mu.Unlock()

	if err != nil {
		if state == "awaiting_guard" {
			s.connection = domain.ConnectionStatus{State: "awaiting_guard", Detail: err.Error()}
			s.pendingUsername = username
			s.pendingPassword = password
			return s.connection
		}
		s.connection = domain.ConnectionStatus{State: "error", Detail: err.Error()}
		return s.connection
	}

	s.connection = domain.ConnectionStatus{State: "connected", Detail: "connected"}
	s.pendingUsername = ""
	s.pendingPassword = ""
	return s.connection
}

func (s *Service) SubmitSteamGuard(input map[string]any) domain.ConnectionStatus {
	code, _ := input["code"].(string)

	s.mu.Lock()
	username := s.pendingUsername
	password := s.pendingPassword
	s.mu.Unlock()

	if username == "" || password == "" {
		return domain.ConnectionStatus{State: "error", Detail: "No pending login session"}
	}

	steamClient := transport.NewSteamClient()
	_, err := steamClient.ValidateCredentials(username, password, code)

	s.mu.Lock()
	defer s.mu.Unlock()

	if err != nil {
		s.connection = domain.ConnectionStatus{State: "error", Detail: err.Error()}
		return s.connection
	}

	s.connection = domain.ConnectionStatus{State: "connected", Detail: "connected"}
	s.pendingUsername = ""
	s.pendingPassword = ""
	return s.connection
}

func (s *Service) DisconnectSteam() domain.ConnectionStatus {
	s.mu.Lock()
	s.connection = domain.ConnectionStatus{State: "disconnected", Detail: "disconnected"}
	s.pendingUsername = ""
	s.pendingPassword = ""
	s.mu.Unlock()
	receipt := s.newReceipt("steam.disconnect")
	s.addEvent(receipt, "completed", "steam disconnected")
	return s.ConnectionStatus()
}

func (s *Service) ConnectionStatus() domain.ConnectionStatus {
	s.mu.Lock()
	defer s.mu.Unlock()
	return domain.ConnectionStatus{State: s.connection.State, Detail: s.connection.Detail}
}

func (s *Service) addEvent(receipt operations.Receipt, state string, message string) {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.operations = append(s.operations, receipt)
	s.events = append(s.events, operations.Event{
		OperationID: receipt.OperationID,
		Type:        receipt.Type,
		State:       state,
		Message:     message,
		CreatedAt:   now(),
	})
	s.lastOperation = receipt
}

func (s *Service) newReceipt(opType string) operations.Receipt {
	receipt := operations.NewReceipt(opType)
	receipt.State = "queued"
	receipt.Message = "queued"
	return receipt
}

func fixtureInventory() domain.InventorySnapshot {
	wear := 0.0671
	count := uint32(742)
	defWeapon := uint32(7)
	defStorage := uint32(1201)
	stickerID := uint32(42)
	stickerWear := 0.21
	casketID := "casket-01"
	return domain.InventorySnapshot{RefreshedAt: now(), Items: []domain.InventoryItem{
		{ID: "2480000000000000000", Name: "AK-47 | Example Finish", Kind: "weapon_skin", Defindex: &defWeapon, PaintWear: &wear, Stickers: []domain.Sticker{{Slot: ptrUint32(0), StickerID: &stickerID, Wear: &stickerWear}}},
		{ID: "3480000000000000000", Name: "Example Sticker", Kind: "sticker_item", UnsupportedFields: []string{"live_validation"}},
		{ID: "4480000000000000000", Name: "Name Tag", Kind: "tool_item"},
		{ID: "4680000000000000000", Name: "StatTrak Swap Tool", Kind: "tool_item"},
		{ID: "4780000000000000000", Name: "Strange Part", Kind: "tool_item"},
		{ID: "5480000000000000000", Name: "Storage Unit", Kind: "storage_unit", Defindex: &defStorage, StorageCount: &count, CasketID: &casketID},
	}}
}

func defaultSettings() domain.Settings {
	return domain.Settings{
		BackendURL:             "http://127.0.0.1:7331",
		ValidationMode:         true,
		SacrificialAccountMode: true,
		FeatureFlags: domain.FeatureFlags{
			EnableStorageMutations: true,
			EnableTradeups:         false,
			EnableStickerExtract:   false,
			EnableStickerRemove:    false,
			EnableStickerApply:     false,
			EnableNameTags:         false,
			EnableItemDeletion:     false,
			EnableStatTrakSwap:     false,
			EnableStrangeParts:     false,
			EnableItemUse:          false,
			EnableToolApplication:  false,
			EnableGifting:          false,
		},
	}
}

func cloneInventory(inventory domain.InventorySnapshot) domain.InventorySnapshot {
	items := make([]domain.InventoryItem, len(inventory.Items))
	copy(items, inventory.Items)
	return domain.InventorySnapshot{Items: items, RefreshedAt: inventory.RefreshedAt}
}

func cloneSettings(settings domain.Settings) domain.Settings {
	return domain.Settings{BackendURL: settings.BackendURL, ValidationMode: settings.ValidationMode, SacrificialAccountMode: settings.SacrificialAccountMode, FeatureFlags: settings.FeatureFlags}
}

func ptrUint32(value uint32) *uint32 { return &value }

func stringsHasPrefixAny(value string, prefixes ...string) bool {
	for _, prefix := range prefixes {
		if len(value) >= len(prefix) && value[:len(prefix)] == prefix {
			return true
		}
	}
	return false
}

func now() string {
	return time.Now().UTC().Format(time.RFC3339Nano)
}

func UnsupportedProtocolError(operation string) error {
	return fmt.Errorf("%s is scaffolded but not wired to Steam GC yet", operation)
}
