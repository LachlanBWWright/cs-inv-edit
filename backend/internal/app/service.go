package app

import (
	"context"
	"encoding/hex"
	"errors"
	"fmt"
	"strconv"
	"strings"
	"sync"
	"time"

	"cs-inv-edit/backend/internal/domain"
	"cs-inv-edit/backend/internal/econ"
	"cs-inv-edit/backend/internal/operations"
	cs2pb "cs-inv-edit/backend/internal/proto/generated"
	"cs-inv-edit/backend/internal/protocol"
	"cs-inv-edit/backend/internal/transport"
	"github.com/Lucino772/envelop/pkg/steam/steamlang"
	"google.golang.org/protobuf/proto"
)

type HealthStatus struct {
	Status  string `json:"status"`
	Service string `json:"service"`
	Version string `json:"version"`
	Time    string `json:"time"`
}

type Service struct {
	mu              sync.Mutex
	events          []operations.Event
	operations      []operations.Receipt
	inventory       domain.InventorySnapshot
	settings        domain.Settings
	connection      domain.ConnectionStatus
	gcClient        transport.GCClient
	econProvider    *econ.Provider
	lastOperation   operations.Receipt
	pendingUsername string
	pendingPassword string
}

func NewService() *Service {
	service := &Service{
		inventory:    emptyInventory(),
		settings:     defaultSettings(),
		connection:   domain.ConnectionStatus{State: "disconnected", Detail: "not connected"},
		gcClient:     transport.NewSteamGCClient(),
		econProvider: econ.NewProvider(),
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

	snapshot, err := s.fetchInventory()

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
			flags := s.settings.FeatureFlags
			if value, ok := next["enableStorageMutations"].(bool); ok {
				flags.EnableStorageMutations = value
			}
			if value, ok := next["enableContainerOpening"].(bool); ok {
				flags.EnableContainerOpening = value
			}
			if value, ok := next["enableInventoryDebug"].(bool); ok {
				flags.EnableInventoryDebug = value
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
			s.mu.Lock()
			s.settings.FeatureFlags = flags
			s.mu.Unlock()
		}
		receipt.State = "completed"
		receipt.Message = "settings updated"
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

	if err := s.gcClient.Connect(context.Background()); err != nil {
		s.mu.Lock()
		s.connection = domain.ConnectionStatus{State: "error", Detail: steamErrorDetail("Steam CM connect", err), AccountName: username, Diagnostics: transport.DiagnosticsFromError(err)}
		status := s.connection
		s.mu.Unlock()
		return status
	}
	result, err := s.gcClient.LogOn(context.Background(), transport.LogonCredentials{Username: username, Password: password})
	if err != nil {
		if steamGuardRequired(result.EResult) {
			s.mu.Lock()
			s.pendingUsername = username
			s.pendingPassword = password
			s.connection = domain.ConnectionStatus{State: "needs_steam_guard", Detail: err.Error(), AccountName: username, Diagnostics: transport.DiagnosticsFromError(err)}
			status := s.connection
			s.mu.Unlock()
			return status
		}
		s.mu.Lock()
		s.connection = domain.ConnectionStatus{State: "error", Detail: steamErrorDetail("Steam CM logon", err), AccountName: username, Diagnostics: transport.DiagnosticsFromError(err)}
		status := s.connection
		s.mu.Unlock()
		return status
	}
	if err := s.gcClient.SendGamesPlayed(context.Background(), protocol.AppIDCS2); err != nil {
		s.mu.Lock()
		s.connection = domain.ConnectionStatus{State: "error", Detail: "CS2 launch presence failed: " + err.Error(), AccountName: username}
		status := s.connection
		s.mu.Unlock()
		return status
	}
	s.mu.Lock()
	s.pendingUsername = ""
	s.pendingPassword = ""
	s.connection = domain.ConnectionStatus{State: "connected", Detail: "authenticated Steam CM logon ready for CS2 GC", SteamID: fmt.Sprintf("%d", result.SteamID), AccountName: username}
	status := s.connection
	s.mu.Unlock()
	return status
}

func (s *Service) SubmitSteamGuard(input map[string]any) domain.ConnectionStatus {
	code, _ := input["code"].(string)
	s.mu.Lock()
	if s.pendingUsername == "" || s.pendingPassword == "" {
		s.connection = domain.ConnectionStatus{State: "error", Detail: "No Steam Guard challenge is pending"}
		status := s.connection
		s.mu.Unlock()
		return status
	}
	username := s.pendingUsername
	password := s.pendingPassword
	s.mu.Unlock()

	credentials := transport.LogonCredentials{
		Username: username,
		Password: password,
	}
	if code != "" {
		credentials.AuthCode = code
		credentials.TwoFactorCode = code
	}
	result, err := s.gcClient.LogOn(context.Background(), credentials)

	s.mu.Lock()
	defer s.mu.Unlock()
	if s.pendingUsername == "" || s.pendingPassword == "" {
		if s.connection.State == "connected" {
			return s.connection
		}
		s.connection = domain.ConnectionStatus{State: "needs_steam_guard", Detail: "Steam Guard approval is being completed", AccountName: username}
		return s.connection
	}
	if err != nil {
		if steamGuardRequired(result.EResult) {
			s.connection = domain.ConnectionStatus{State: "needs_steam_guard", Detail: err.Error(), AccountName: username, Diagnostics: transport.DiagnosticsFromError(err)}
			return s.connection
		}
		s.connection = domain.ConnectionStatus{State: "error", Detail: steamErrorDetail("Steam CM Steam Guard logon", err), AccountName: username, Diagnostics: transport.DiagnosticsFromError(err)}
		return s.connection
	}
	if err := s.gcClient.SendGamesPlayed(context.Background(), protocol.AppIDCS2); err != nil {
		s.connection = domain.ConnectionStatus{State: "error", Detail: "CS2 launch presence failed: " + err.Error(), AccountName: username}
		return s.connection
	}
	s.pendingUsername = ""
	s.pendingPassword = ""
	s.connection = domain.ConnectionStatus{State: "connected", Detail: "authenticated Steam CM logon ready for CS2 GC", SteamID: fmt.Sprintf("%d", result.SteamID), AccountName: username}
	return s.connection
}

func (s *Service) DisconnectSteam() domain.ConnectionStatus {
	s.mu.Lock()
	s.connection = domain.ConnectionStatus{State: "disconnected", Detail: "disconnected"}
	s.inventory = emptyInventory()
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
	return domain.ConnectionStatus{State: s.connection.State, Detail: s.connection.Detail, SteamID: s.connection.SteamID, AccountName: s.connection.AccountName, AvatarURL: s.connection.AvatarURL, Diagnostics: append([]string(nil), s.connection.Diagnostics...)}
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

func emptyInventory() domain.InventorySnapshot {
	return domain.InventorySnapshot{RefreshedAt: now(), Status: "requires_connection", Items: []domain.InventoryItem{}}
}

func inventoryError(message string, diagnostics []string) domain.InventorySnapshot {
	return domain.InventorySnapshot{RefreshedAt: now(), Status: "error", Message: message, Error: message, Diagnostics: append([]string(nil), diagnostics...), Items: []domain.InventoryItem{}}
}

func (s *Service) fetchInventory() (domain.InventorySnapshot, error) {
	s.mu.Lock()
	steamID := s.connection.SteamID
	includeDebug := s.settings.FeatureFlags.EnableInventoryDebug
	s.mu.Unlock()
	gcCtx, cancelGC := context.WithTimeout(context.Background(), 20*time.Second)
	defer cancelGC()
	gcItems, err := s.gcClient.RequestInventory(gcCtx)
	if err != nil {
		return domain.InventorySnapshot{}, fmt.Errorf("CS2 GC inventory request failed: %w", err)
	}
	schemaCtx, cancelSchema := context.WithTimeout(context.Background(), 20*time.Second)
	defer cancelSchema()
	metadata, err := s.econProvider.Load(schemaCtx)
	if err != nil {
		return domain.InventorySnapshot{}, fmt.Errorf("CS2 item metadata refresh failed: %w", err)
	}
	descriptionCtx, cancelDescriptions := context.WithTimeout(context.Background(), 20*time.Second)
	defer cancelDescriptions()
	descriptions, descriptionErr := s.econProvider.LoadInventoryDescriptions(descriptionCtx, steamID)
	type pendingItem struct {
		item               transport.GCInventoryItem
		metadata           econ.Metadata
		descriptionMatched bool
	}
	pendingItems := make([]pendingItem, 0, len(gcItems))
	marketNames := make([]string, 0, len(gcItems))
	descriptionMatches := 0
	for _, item := range gcItems {
		if item.DefIndex == 0 {
			continue
		}
		if item.Inventory == 0 {
			continue
		}
		itemMetadata := metadata.Metadata(item.DefIndex, item.PaintKit, item.Attributes)
		descriptionMatched := false
		if description, ok := descriptionForGCItem(descriptions, item); ok {
			itemMetadata = itemMetadata.WithInventoryDescription(description)
			descriptionMatched = true
			descriptionMatches++
		}
		pendingItems = append(pendingItems, pendingItem{item: item, metadata: itemMetadata, descriptionMatched: descriptionMatched})
		if itemMetadata.MarketName != "" {
			marketNames = append(marketNames, itemMetadata.MarketName)
		}
	}
	marketCtx, cancelMarket := context.WithTimeout(context.Background(), 20*time.Second)
	defer cancelMarket()
	marketDescriptions, marketErr := s.econProvider.LoadMarketDescriptions(marketCtx, marketNames)
	items := make([]domain.InventoryItem, 0, len(pendingItems))
	for _, pending := range pendingItems {
		item := pending.item
		defIndex := item.DefIndex
		itemMetadata := pending.metadata
		marketDescriptionUsed := false
		if itemMetadata.ImageURL == "" || itemMetadata.MarketPrice.SellPriceText == "" {
			if description, ok := marketDescriptions[itemMetadata.MarketName]; ok {
				itemMetadata = itemMetadata.WithMarketDescription(description)
				marketDescriptionUsed = true
			}
		}
		inventoryItem := domain.InventoryItem{
			ID:                 fmt.Sprintf("%d", item.ID),
			Name:               itemMetadata.Name,
			MarketName:         itemMetadata.MarketName,
			ImageURL:           itemMetadata.ImageURL,
			Kind:               itemMetadata.Kind,
			Defindex:           &defIndex,
			Rarity:             itemMetadata.Rarity,
			ToolType:           itemMetadata.ToolType,
			IsNameTagTool:      itemMetadata.IsNameTagTool,
			MarketPrice:        itemMetadata.MarketPrice.SellPriceText,
			MarketSalePrice:    itemMetadata.MarketPrice.SalePriceText,
			MarketSellListings: ptrInt(itemMetadata.MarketPrice.SellListings),
		}
		if itemMetadata.MarketPrice.SellListings == 0 {
			inventoryItem.MarketSellListings = nil
		}
		if item.PaintWear != nil {
			inventoryItem.PaintWear = item.PaintWear
		}
		if item.CustomName != "" {
			inventoryItem.CustomName = item.CustomName
			inventoryItem.HasCustomName = true
		}
		if includeDebug {
			inventoryItem.Debug = debugForGCItem(item, pending.descriptionMatched, marketDescriptionUsed)
		}
		items = append(items, inventoryItem)
	}
	return domain.InventorySnapshot{
		Items:       items,
		RefreshedAt: now(),
		Status:      "ready",
		Diagnostics: inventoryMetadataDiagnostics(descriptionErr, marketErr, len(descriptions), descriptionMatches, len(pendingItems)),
	}, nil
}

func descriptionForGCItem(descriptions map[string]econ.InventoryDescription, item transport.GCInventoryItem) (econ.InventoryDescription, bool) {
	if len(descriptions) == 0 {
		return econ.InventoryDescription{}, false
	}
	keys := []uint64{item.ID, item.OriginalID}
	for _, key := range keys {
		if key == 0 {
			continue
		}
		if description, ok := descriptions[fmt.Sprintf("%d", key)]; ok {
			return description, true
		}
	}
	return econ.InventoryDescription{}, false
}

func debugForGCItem(item transport.GCInventoryItem, descriptionMatched bool, marketDescriptionUsed bool) *domain.ItemDebug {
	attributes := make(map[string]uint32, len(item.Attributes))
	for key, value := range item.Attributes {
		attributes[fmt.Sprintf("%d", key)] = value
	}
	return &domain.ItemDebug{
		GCID:                  fmt.Sprintf("%d", item.ID),
		GCOriginalID:          fmt.Sprintf("%d", item.OriginalID),
		GCDefIndex:            item.DefIndex,
		GCInventory:           item.Inventory,
		GCQuantity:            item.Quantity,
		GCQuality:             item.Quality,
		GCRarity:              item.Rarity,
		GCPaintKit:            item.PaintKit,
		DescriptionMatched:    descriptionMatched,
		MarketDescriptionUsed: marketDescriptionUsed,
		Attributes:            attributes,
	}
}

func inventoryMetadataDiagnostics(descriptionErr error, marketErr error, descriptionCount int, descriptionMatches int, itemCount int) []string {
	var diagnostics []string
	if descriptionErr != nil {
		diagnostics = append(diagnostics, fmt.Sprintf("Steam inventory description metadata unavailable: %v", descriptionErr))
	} else if itemCount > 0 && descriptionMatches == 0 {
		diagnostics = append(diagnostics, fmt.Sprintf("Steam inventory description metadata returned %d descriptions but matched 0/%d GC items by id/original_id", descriptionCount, itemCount))
	} else if itemCount > 0 && descriptionMatches < itemCount {
		diagnostics = append(diagnostics, fmt.Sprintf("Steam inventory description metadata matched %d/%d GC items by id/original_id", descriptionMatches, itemCount))
	}
	if marketErr != nil {
		diagnostics = append(diagnostics, fmt.Sprintf("Steam market metadata unavailable: %v", marketErr))
	}
	if len(diagnostics) == 0 {
		return nil
	}
	return diagnostics
}

func steamGuardRequired(result int32) bool {
	switch steamlang.EResult(result) {
	case steamlang.EResult_AccountLogonDenied,
		steamlang.EResult_AccountLoginDeniedNeedTwoFactor,
		steamlang.EResult_InvalidLoginAuthCode,
		steamlang.EResult_TwoFactorCodeMismatch,
		steamlang.EResult_ExpiredLoginAuthCode:
		return true
	default:
		return false
	}
}

func steamErrorDetail(stage string, err error) string {
	if err == nil {
		return ""
	}
	if errors.Is(err, context.DeadlineExceeded) {
		return fmt.Sprintf("%s timed out: %v", stage, err)
	}
	return err.Error()
}

type containerOpenResult struct {
	OpenedItem      *domain.InventoryItem `json:"openedItem,omitempty"`
	ConsumedItemID  string                `json:"consumedItemId,omitempty"`
	RequestEMsg     uint32                `json:"requestEMsg,omitempty"`
	RequestMethod   string                `json:"requestMethod,omitempty"`
	RequestBodyHex  string                `json:"requestBodyHex,omitempty"`
	Confirmation    string                `json:"confirmation,omitempty"`
	ResponseEMsg    uint32                `json:"responseEMsg,omitempty"`
	ResponseBodyHex string                `json:"responseBodyHex,omitempty"`
	BeforeItemCount int                   `json:"beforeItemCount,omitempty"`
	AfterItemCount  int                   `json:"afterItemCount,omitempty"`
	Diagnostics     []string              `json:"diagnostics,omitempty"`
}

func (s *Service) openContainer(input map[string]any) (bool, string, *containerOpenResult) {
	itemID, _ := input["itemId"].(string)
	result := &containerOpenResult{ConsumedItemID: itemID}
	if itemID == "" {
		return false, "container item id is required", result
	}
	itemIDUint, err := strconv.ParseUint(itemID, 10, 64)
	if err != nil || itemIDUint == 0 {
		return false, "container item id must be a valid Steam item id", result
	}
	s.mu.Lock()
	beforeInventory := cloneInventory(s.inventory)
	s.mu.Unlock()
	result.BeforeItemCount = len(beforeInventory.Items)
	var found *domain.InventoryItem
	for i := range beforeInventory.Items {
		if beforeInventory.Items[i].ID == itemID {
			found = &beforeInventory.Items[i]
			break
		}
	}
	if found == nil {
		return false, "container is not present in the current owned inventory snapshot", result
	}
	if !isContainerLikeInventoryItem(*found) {
		return false, "selected item is not a container or capsule", result
	}
	toolItemID, err := optionalUint64Input(input, "keyItemId")
	if err != nil {
		return false, err.Error(), result
	}
	result.RequestEMsg = protocol.EMsgOpenCrate
	result.RequestMethod = "open_crate_proto"
	body, err := proto.Marshal(&cs2pb.CMsgOpenCrate{
		ToolItemId:    proto.Uint64(toolItemID),
		SubjectItemId: proto.Uint64(itemIDUint),
	})
	if err != nil {
		return false, "encode container open request failed: " + err.Error(), result
	}
	result.RequestBodyHex = hex.EncodeToString(body)
	ctx, cancel := context.WithTimeout(context.Background(), 8*time.Second)
	defer cancel()
	if err := s.gcClient.SendProtoToGC(ctx, protocol.AppIDCS2, protocol.EMsgOpenCrate, body); err != nil {
		return false, "send container open request failed: " + err.Error(), result
	}
	confirmation := s.waitForContainerOpenConfirmation(ctx, itemIDUint)
	result.Confirmation = confirmation.Message
	result.ResponseEMsg = confirmation.EMsg
	result.ResponseBodyHex = confirmation.BodyHex
	result.Diagnostics = confirmation.Diagnostics
	if confirmation.Err != nil {
		return false, confirmation.Err.Error(), result
	}
	if snapshot, openedItem, err := s.reconcileContainerOpenOnce(beforeInventory); err == nil && openedItem != nil {
		result.AfterItemCount = len(snapshot.Items)
		result.OpenedItem = openedItem
		snapshot.Message = fmt.Sprintf("Container opened: %s", openedInventoryItemName(openedItem))
		s.mu.Lock()
		s.inventory = snapshot
		s.mu.Unlock()
		return true, snapshot.Message, result
	} else if err != nil {
		result.Diagnostics = append(result.Diagnostics, err.Error())
	}
	return false, "container open response received, but the awarded item could not be decoded from GC response", result
}

func (s *Service) reconcileContainerOpenOnce(before domain.InventorySnapshot) (domain.InventorySnapshot, *domain.InventoryItem, error) {
	beforeIDs := make(map[string]struct{}, len(before.Items))
	for _, item := range before.Items {
		beforeIDs[item.ID] = struct{}{}
	}
	snapshot, err := s.fetchInventory()
	if err != nil {
		return domain.InventorySnapshot{}, nil, fmt.Errorf("post-open inventory refresh failed: %w", err)
	}
	for i := range snapshot.Items {
		if _, existed := beforeIDs[snapshot.Items[i].ID]; !existed {
			return snapshot, &snapshot.Items[i], nil
		}
	}
	return snapshot, nil, fmt.Errorf("post-open inventory refresh found no new item; before_count=%d after_count=%d", len(before.Items), len(snapshot.Items))
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
	haystack := strings.ToLower(item.Kind + " " + item.Name + " " + item.MarketName)
	return item.Kind == "container" || strings.Contains(haystack, "capsule") || strings.Contains(haystack, "case") || strings.Contains(haystack, "container")
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

type containerOpenConfirmation struct {
	EMsg        uint32
	Message     string
	BodyHex     string
	Diagnostics []string
	Err         error
}

func (s *Service) waitForContainerOpenConfirmation(ctx context.Context, itemID uint64) containerOpenConfirmation {
	timeout := time.NewTimer(8 * time.Second)
	defer timeout.Stop()
	observed := make([]string, 0, 8)
	for {
		select {
		case <-ctx.Done():
			return containerOpenConfirmation{Err: fmt.Errorf("container open request timed out waiting for CS2 GC response: %w%s", ctx.Err(), formatObservedGCMessages(observed))}
		case <-timeout.C:
			return containerOpenConfirmation{Err: fmt.Errorf("container open request sent but CS2 GC did not confirm before timeout%s", formatObservedGCMessages(observed))}
		case event := <-s.gcClient.Events():
			if event.Type != "gc.message" {
				continue
			}
			message, ok := event.Payload.(transport.GCMessage)
			if !ok || message.AppID != protocol.AppIDCS2 {
				continue
			}
			observed = append(observed, fmt.Sprintf("emsg=%d bytes=%d", message.EMsg, len(message.Body)))
			if message.EMsg == protocol.EMsgUnlockCrateResponse {
				confirmation := containerOpenConfirmation{
					EMsg:        message.EMsg,
					Message:     "CS2 GC sent unlock crate response",
					BodyHex:     hex.EncodeToString(message.Body),
					Diagnostics: append([]string(nil), observed...),
				}
				confirmation.Err = fmt.Errorf("CS2 GC unlock crate response received, but no generated protobuf schema is available for response body: emsg=%d body_hex=%s", message.EMsg, confirmation.BodyHex)
				return confirmation
			}
			if message.EMsg == protocol.EMsgItemCustomizationNotification {
				notification := new(cs2pb.CMsgGCItemCustomizationNotification)
				if err := proto.Unmarshal(message.Body, notification); err != nil {
					return containerOpenConfirmation{EMsg: message.EMsg, BodyHex: hex.EncodeToString(message.Body), Diagnostics: append([]string(nil), observed...), Err: fmt.Errorf("container open response decode failed: %w", err)}
				}
				switch notification.GetRequest() {
				case protocol.CustomizationUnlockCrate:
					return containerOpenConfirmation{EMsg: message.EMsg, Message: "CS2 GC confirmed container unlock", BodyHex: hex.EncodeToString(message.Body), Diagnostics: append([]string(nil), observed...)}
				case protocol.CustomizationXRayItemReveal:
					return containerOpenConfirmation{EMsg: message.EMsg, Message: "CS2 GC confirmed container reveal", BodyHex: hex.EncodeToString(message.Body), Diagnostics: append([]string(nil), observed...)}
				case protocol.CustomizationXRayItemClaim:
					return containerOpenConfirmation{EMsg: message.EMsg, Message: "CS2 GC confirmed container claim", BodyHex: hex.EncodeToString(message.Body), Diagnostics: append([]string(nil), observed...)}
				}
				for _, id := range notification.GetItemId() {
					if id == itemID {
						return containerOpenConfirmation{EMsg: message.EMsg, Message: fmt.Sprintf("CS2 GC accepted container open request request=%d", notification.GetRequest()), BodyHex: hex.EncodeToString(message.Body), Diagnostics: append([]string(nil), observed...)}
					}
				}
				return containerOpenConfirmation{EMsg: message.EMsg, Message: fmt.Sprintf("CS2 GC sent item customization notification request=%d", notification.GetRequest()), BodyHex: hex.EncodeToString(message.Body), Diagnostics: append([]string(nil), observed...)}
			}
			if message.EMsg == protocol.EMsgGCClientWelcome {
				return containerOpenConfirmation{EMsg: message.EMsg, Message: "CS2 GC sent inventory update after container open request", BodyHex: hex.EncodeToString(message.Body), Diagnostics: append([]string(nil), observed...)}
			}
		}
	}
}

func formatObservedGCMessages(observed []string) string {
	if len(observed) == 0 {
		return "; observed_gc_messages=none"
	}
	return "; observed_gc_messages=" + strings.Join(observed, ",")
}

func (s *Service) applyNameTag(input map[string]any) (bool, string) {
	subjectItemID, _ := input["subjectItemId"].(string)
	toolItemID, _ := input["toolItemId"].(string)
	name, _ := input["name"].(string)
	if subjectItemID == "" || toolItemID == "" || name == "" {
		return false, "subject item, name tag tool, and custom name are required"
	}
	toolFound := false
	for _, item := range s.inventory.Items {
		if item.ID == toolItemID && item.IsNameTagTool {
			toolFound = true
			break
		}
	}
	if !toolFound {
		return false, "no usable name tag tool found in the current inventory"
	}
	for i := range s.inventory.Items {
		if s.inventory.Items[i].ID == subjectItemID {
			s.inventory.Items[i].CustomName = name
			s.inventory.Items[i].HasCustomName = true
			s.inventory.Items[i].MarketName = s.inventory.Items[i].MarketName
			s.inventory.RefreshedAt = now()
			return true, "custom name applied"
		}
	}
	return false, "target item not found"
}

func (s *Service) removeNameTag(input map[string]any) (bool, string) {
	itemID, _ := input["itemId"].(string)
	if itemID == "" {
		return false, "item id is required"
	}
	for i := range s.inventory.Items {
		if s.inventory.Items[i].ID == itemID {
			if !s.inventory.Items[i].HasCustomName {
				return false, "selected item does not have a custom name"
			}
			s.inventory.Items[i].CustomName = ""
			s.inventory.Items[i].HasCustomName = false
			s.inventory.RefreshedAt = now()
			return true, "custom name removed"
		}
	}
	return false, "target item not found"
}

func defaultSettings() domain.Settings {
	return domain.Settings{
		BackendURL:             "http://127.0.0.1:7331",
		ValidationMode:         true,
		SacrificialAccountMode: true,
		FeatureFlags: domain.FeatureFlags{
			EnableStorageMutations: true,
			EnableContainerOpening: true,
			EnableInventoryDebug:   false,
			EnableTradeups:         false,
			EnableStickerExtract:   false,
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
	return domain.InventorySnapshot{Items: items, RefreshedAt: inventory.RefreshedAt, Status: inventory.Status, Message: inventory.Message, Error: inventory.Error, Diagnostics: append([]string(nil), inventory.Diagnostics...)}
}

func cloneSettings(settings domain.Settings) domain.Settings {
	return domain.Settings{BackendURL: settings.BackendURL, ValidationMode: settings.ValidationMode, SacrificialAccountMode: settings.SacrificialAccountMode, FeatureFlags: settings.FeatureFlags}
}

func ptrUint32(value uint32) *uint32 { return &value }

func ptrInt(value int) *int { return &value }

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
