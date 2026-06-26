package app

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"strconv"
	"strings"
	"sync"
	"time"

	"cs-inv-edit/backend/internal/domain"
	"cs-inv-edit/backend/internal/operations"
	"cs-inv-edit/backend/internal/protocol"
	"cs-inv-edit/backend/internal/transport"
)

type Service struct {
	mu         sync.Mutex
	events     []domain.Event
	gcClient   transport.GCClient
	settings   domain.FeatureSettings
	inventory  domain.InventorySnapshot
	connection domain.ConnectionStatus
	operations []domain.OperationReceipt
}

func NewService() *Service {
	s := &Service{
		gcClient:   transport.NewMockGCClient(),
		settings:   defaultSettings(),
		inventory:  defaultInventory(),
		connection: domain.ConnectionStatus{State: "disconnected"},
	}
	s.addEvent("log", map[string]string{"message": "backend started"})
	return s
}

func (s *Service) Health() domain.HealthStatus {
	return domain.HealthStatus{Status: "ok", Service: "cs2-backend", Version: "0.0.0", Time: now()}
}

func (s *Service) Inventory() domain.InventorySnapshot {
	s.mu.Lock()
	defer s.mu.Unlock()
	return cloneInventorySnapshot(s.inventory)
}

func (s *Service) RefreshInventory() domain.InventorySnapshot {
	s.mu.Lock()
	s.inventory.RefreshedAt = now()
	snapshot := cloneInventorySnapshot(s.inventory)
	s.mu.Unlock()
	s.addEvent("inventory", map[string]string{"refreshedAt": snapshot.RefreshedAt})
	return snapshot
}

func (s *Service) SubmitOperation(opType string, input any) (domain.OperationReceipt, error) {
	opType = strings.TrimSpace(opType)
	if opType == "" {
		return domain.OperationReceipt{}, fmt.Errorf("missing operation type")
	}

	if strings.HasPrefix(opType, "storage.") && !s.settings.EnableStorageMutations {
		return operations.NewReceiptWithState(opType, "blocked_by_feature_flag", "storage mutations require enableStorageMutations"), nil
	}
	if opType == "tradeups.execute" && !s.settings.EnableTradeups {
		return operations.NewReceiptWithState(opType, "blocked_by_feature_flag", "trade-ups disabled in development"), nil
	}
	if strings.HasPrefix(opType, "stickers.") {
		if opType == "stickers.extract" && !s.settings.EnableStickerExtract {
			return operations.NewReceiptWithState(opType, "blocked_by_feature_flag", "sticker extract disabled"), nil
		}
		if opType == "stickers.remove" && !s.settings.EnableStickerRemove {
			return operations.NewReceiptWithState(opType, "blocked_by_feature_flag", "sticker remove disabled"), nil
		}
		if opType == "stickers.apply" && !s.settings.EnableStickerApply {
			return operations.NewReceiptWithState(opType, "blocked_by_feature_flag", "sticker apply disabled"), nil
		}
	}

	receipt := operations.NewReceipt(opType)
	if opType == "tradeups.execute" {
		values, err := extractItemIDList(input)
		if err != nil {
			return operations.NewReceiptWithState(opType, "requires_validation", err.Error()), nil
		}
		if len(values) != 10 {
			return operations.NewReceiptWithState(opType, "requires_validation", "trade-up requires exactly 10 item IDs"), nil
		}
		if _, err := protocol.EncodeCraftRequest(1, values); err != nil {
			return operations.NewReceiptWithState(opType, "requires_validation", err.Error()), nil
		}
	}
	if opType == "stickers.apply" {
		if _, err := validateStickerInput(input); err != nil {
			return operations.NewReceiptWithState(opType, "requires_validation", err.Error()), nil
		}
	}
	if opType == "storage.move-in" || opType == "storage.move-out" {
		if _, err := validateMoveInput(input); err != nil {
			return operations.NewReceiptWithState(opType, "requires_validation", err.Error()), nil
		}
	}

	receipt.State = "queued"
	receipt.Encoded = &domain.EncodedMetadata{AppID: 730, EMsg: 1092, BodyHash: hashBody(input)}
	s.mu.Lock()
	s.operations = append(s.operations, receipt)
	s.mu.Unlock()
	s.addEvent("operation", receipt)
	_ = s.gcClient.SendToGC(context.Background(), 730, 1092, []byte(opType))
	return receipt, nil
}

func (s *Service) Events() []domain.Event {
	s.mu.Lock()
	defer s.mu.Unlock()
	out := make([]domain.Event, len(s.events))
	copy(out, s.events)
	return out
}

func (s *Service) GetSettings() domain.FeatureSettings {
	s.mu.Lock()
	defer s.mu.Unlock()
	return s.settings
}

func (s *Service) UpdateSettings(settings domain.FeatureSettings) domain.FeatureSettings {
	s.mu.Lock()
	s.settings = settings
	s.mu.Unlock()
	s.addEvent("log", map[string]string{"message": "settings updated"})
	return settings
}

func (s *Service) ConnectSteam(input any) domain.ConnectionStatus {
	s.mu.Lock()
	s.connection = domain.ConnectionStatus{State: "connected", Detail: describeInput(input)}
	status := s.connection
	s.mu.Unlock()
	s.addEvent("connection", status)
	return status
}

func (s *Service) SubmitSteamGuard(input any) domain.ConnectionStatus {
	s.mu.Lock()
	s.connection = domain.ConnectionStatus{State: "connected", Detail: fmt.Sprintf("guard:%s", describeInput(input))}
	status := s.connection
	s.mu.Unlock()
	s.addEvent("connection", status)
	return status
}

func (s *Service) DisconnectSteam() domain.ConnectionStatus {
	s.mu.Lock()
	s.connection = domain.ConnectionStatus{State: "disconnected", Detail: "steam disconnected"}
	status := s.connection
	s.mu.Unlock()
	s.addEvent("connection", status)
	return status
}

func (s *Service) addEvent(kind string, payload any) {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.events = append(s.events, domain.Event{Type: kind, Payload: payload, CreatedAt: now()})
}

func defaultSettings() domain.FeatureSettings {
	return domain.FeatureSettings{EnableStorageMutations: true, EnableTradeups: false, EnableStickerExtract: false, EnableStickerRemove: false, EnableStickerApply: false, ValidationMode: true, SacrificialAccountMode: true}
}

func defaultInventory() domain.InventorySnapshot {
	wear := 0.0671
	count := uint32(742)
	defWeapon := uint32(7)
	defStorage := uint32(1201)
	stickerSlot := 1
	casketID := "casket-001"
	return domain.InventorySnapshot{RefreshedAt: now(), Items: []domain.InventoryItem{
		{ID: "2480000000000000000", Name: "AK-47 | Example Finish", Kind: "weapon_skin", Defindex: &defWeapon, PaintWear: &wear},
		{ID: "3480000000000000000", Name: "Example Sticker", Kind: "sticker_item", Stickers: []domain.Sticker{{ID: "sticker-1", Name: "Example Sticker", Slot: &stickerSlot}}},
		{ID: "5480000000000000000", Name: "Storage Unit", Kind: "storage_unit", Defindex: &defStorage, StorageCount: &count, CasketID: &casketID},
		{ID: "6480000000000000000", Name: "Case", Kind: "container"},
	}}
}

func cloneInventorySnapshot(snapshot domain.InventorySnapshot) domain.InventorySnapshot {
	items := make([]domain.InventoryItem, len(snapshot.Items))
	copy(items, snapshot.Items)
	return domain.InventorySnapshot{Items: items, RefreshedAt: snapshot.RefreshedAt}
}

func validateMoveInput(input any) (string, error) {
	value, ok := input.(map[string]any)
	if !ok {
		return "", fmt.Errorf("invalid move input")
	}
	itemID, _ := value["itemId"].(string)
	if _, err := ValidateItemID(itemID); err != nil {
		return "", err
	}
	return itemID, nil
}

func extractItemIDList(input any) ([]uint64, error) {
	value, ok := input.(map[string]any)
	if !ok {
		return nil, fmt.Errorf("invalid payload")
	}
	ids, ok := value["itemIds"].([]any)
	if !ok {
		return nil, fmt.Errorf("itemIds must be an array")
	}
	res := make([]uint64, 0, len(ids))
	seen := map[uint64]struct{}{}
	for _, candidate := range ids {
		itemID, ok := candidate.(string)
		if !ok {
			return nil, fmt.Errorf("item IDs must be strings")
		}
		parsed, err := ValidateItemID(itemID)
		if err != nil {
			return nil, err
		}
		if _, exists := seen[parsed]; exists {
			return nil, fmt.Errorf("duplicate item id")
		}
		seen[parsed] = struct{}{}
		res = append(res, parsed)
	}
	return res, nil
}

func validateStickerInput(input any) (map[string]any, error) {
	value, ok := input.(map[string]any)
	if !ok {
		return nil, fmt.Errorf("invalid sticker payload")
	}
	itemID, _ := value["itemId"].(string)
	if _, err := ValidateItemID(itemID); err != nil {
		return nil, err
	}
	return value, nil
}

func ValidateItemID(itemID string) (uint64, error) {
	itemID = strings.TrimSpace(itemID)
	if itemID == "" {
		return 0, fmt.Errorf("item ID is required")
	}
	if !strings.ContainsAny(itemID, "0123456789") {
		return 0, fmt.Errorf("item ID must be decimal")
	}
	parsed, err := strconv.ParseUint(itemID, 10, 64)
	if err != nil {
		return 0, fmt.Errorf("invalid item ID: %w", err)
	}
	return parsed, nil
}

func hashBody(input any) string {
	body, _ := json.Marshal(input)
	sum := sha256.Sum256(body)
	return hex.EncodeToString(sum[:])
}

func describeInput(input any) string {
	if input == nil {
		return ""
	}
	payload, _ := json.Marshal(input)
	return string(payload)
}

func now() string {
	return time.Now().UTC().Format(time.RFC3339Nano)
}
