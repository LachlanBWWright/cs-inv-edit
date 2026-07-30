package app

import (
	"context"
	"fmt"
	"sort"
	"strconv"
	"strings"
	"time"

	"cs-inv-edit/backend/internal/domain"
	"cs-inv-edit/backend/internal/multigame"
	"cs-inv-edit/backend/internal/operations"
	"cs-inv-edit/backend/internal/steaminventory"
)

var steamInventoryServiceExcludedAppIDs = map[uint32]struct{}{
	730: {}, 440: {}, 570: {}, 753: {},
}

func (s *Service) SteamInventoryServiceGames(ctx context.Context) domain.SteamInventoryServiceGames {
	result := domain.SteamInventoryServiceGames{Games: []domain.SteamInventoryServiceGame{}, RefreshedAt: now(), Status: "ready", Diagnostics: []string{}}
	s.mu.Lock()
	if !s.settings.FeatureFlags.EnableSteamInventory {
		s.mu.Unlock()
		result.Status, result.Message = "error", "Steam inventory viewing is disabled"
		return result
	}
	steamIDText := s.connection.SteamID
	connected := s.connection.State == domain.ConnectionStateConnected && steamIDText != ""
	s.mu.Unlock()
	if !connected {
		result.Status, result.Message = "requires_connection", "Connect a Steam account to find owned games"
		return result
	}
	steamID, err := strconv.ParseUint(steamIDText, 10, 64)
	if err != nil || steamID == 0 {
		result.Status, result.Message = "error", "Connected account has an invalid SteamID"
		return result
	}
	games, err := s.gcClient.RequestOwnedGames(ctx, steamID)
	if err != nil {
		result.Status, result.Message = "error", err.Error()
		return result
	}
	for _, game := range games {
		if game.AppID == 0 {
			continue
		}
		if _, excluded := steamInventoryServiceExcludedAppIDs[game.AppID]; excluded {
			continue
		}
		name := strings.TrimSpace(game.Name)
		if name == "" {
			name = fmt.Sprintf("AppID %d", game.AppID)
		}
		result.Games = append(result.Games, domain.SteamInventoryServiceGame{
			AppID: game.AppID, Name: name, PlaytimeMinutes: game.PlaytimeForever, LastPlayed: game.LastPlayed, HasMarket: game.HasMarket,
		})
	}
	sort.Slice(result.Games, func(i, j int) bool {
		left, right := strings.ToLower(result.Games[i].Name), strings.ToLower(result.Games[j].Name)
		if left == right {
			return result.Games[i].AppID < result.Games[j].AppID
		}
		return left < right
	})
	if len(result.Games) == 0 {
		result.Message = "No eligible owned games were returned by Steam"
	}
	return result
}

func (s *Service) GameInventory(gameID string) (domain.GameInventorySnapshot, bool, bool) {
	game, supported := multigame.ParseGame(gameID)
	if !supported {
		return domain.GameInventorySnapshot{}, false, false
	}
	s.mu.Lock()
	defer s.mu.Unlock()
	enabled := s.gameInventoryEnabledLocked(game.ID)
	if !enabled {
		return emptyGameInventory(game.ID, game.AppID), true, false
	}
	if s.connection.State != domain.ConnectionStateConnected || s.connection.SteamID == "" {
		return emptyGameInventory(game.ID, game.AppID), true, true
	}
	snapshot, ok := s.gameInventories[gameInventoryKey(s.connection.SteamID, game.ID)]
	if !ok {
		snapshot = emptyGameInventory(game.ID, game.AppID)
		snapshot.Status = "loading"
		snapshot.Message = "Waiting for the first " + game.ID + " inventory refresh"
	}
	return cloneGameInventory(snapshot), true, true
}

func (s *Service) RefreshGameInventory(gameID string) operations.Receipt {
	game, supported := multigame.ParseGame(gameID)
	receipt := s.newReceipt("inventory.refresh." + gameID)
	if !supported {
		receipt.State, receipt.Message = "failed", "unsupported economy game"
		s.addEvent(receipt, receipt.State, receipt.Message)
		return receipt
	}

	s.mu.Lock()
	if !s.gameInventoryEnabledLocked(game.ID) {
		s.mu.Unlock()
		receipt.State, receipt.Message = "blocked_by_feature_flag", game.ID+" inventory viewing is disabled"
		s.addEvent(receipt, receipt.State, receipt.Message)
		return receipt
	}
	if s.connection.State != domain.ConnectionStateConnected || s.connection.SteamID == "" {
		s.mu.Unlock()
		receipt.State, receipt.Message = "requires_connection", "connect a Steam account to load "+game.ID+" inventory"
		s.addEvent(receipt, receipt.State, receipt.Message)
		return receipt
	}
	steamID := s.connection.SteamID
	webAccessToken := s.tradeAccessToken
	key := gameInventoryKey(steamID, game.ID)
	if cancel := s.gameCancels[key]; cancel != nil {
		cancel()
	}
	s.gameRefreshes[key]++
	generation := s.gameRefreshes[key]
	loading, ok := s.gameInventories[key]
	if !ok {
		loading = emptyGameInventory(game.ID, game.AppID)
	}
	loading = cloneGameInventory(loading)
	loading.Status, loading.Message, loading.Error, loading.RefreshedAt = "loading", "loading "+game.ID+" inventory", "", now()
	s.gameInventories[key] = loading
	refreshCtx, cancelRefresh := context.WithTimeout(context.Background(), 60*time.Second)
	s.gameCancels[key] = cancelRefresh
	s.mu.Unlock()
	defer cancelRefresh()

	var snapshot domain.GameInventorySnapshot
	var err error
	if game.ID == "steam" {
		snapshot, err = s.multiProvider.LoadAuthenticated(refreshCtx, steamID, game, webAccessToken)
	} else {
		gcCtx, cancelGC := context.WithTimeout(refreshCtx, 30*time.Second)
		gcItems, gcErr := s.gcClient.RequestGameInventory(gcCtx, game.AppID)
		if gcErr == nil {
			s.markGCSessionReady(game.AppID)
		}
		cancelGC()
		err = gcErr
		if err == nil {
			owned := make([]multigame.OwnedItem, 0, len(gcItems))
			for _, item := range gcItems {
				equipped := make([]domain.EquippedState, 0, len(item.EquippedStates))
				for _, state := range item.EquippedStates {
					equipped = append(equipped, domain.EquippedState{Class: state.Class, Slot: state.Slot})
				}
				owned = append(owned, multigame.OwnedItem{ID: item.ID, OriginalID: item.OriginalID, DefIndex: item.DefIndex, Quantity: item.Quantity, Quality: item.Quality, Inventory: item.Inventory, Level: item.Level, Flags: item.Flags, Origin: item.Origin, Style: item.Style, CustomName: item.CustomName, CustomDesc: item.CustomDesc, Attributes: item.Attributes, AttributeBytes: item.AttributeBytes, EquippedStates: equipped, InteriorItemID: item.InteriorItemID})
			}
			snapshot = s.multiProvider.EnrichOwned(refreshCtx, steamID, game, owned)
		}
	}

	s.mu.Lock()
	if s.gameRefreshes[key] != generation {
		s.mu.Unlock()
		receipt.State, receipt.Message = "completed", "newer "+game.ID+" inventory refresh superseded this result"
		s.addEvent(receipt, receipt.State, receipt.Message)
		return receipt
	}
	delete(s.gameCancels, key)
	if err != nil {
		failed := emptyGameInventory(game.ID, game.AppID)
		failed.Status, failed.Error, failed.Message, failed.RefreshedAt = "error", err.Error(), "inventory refresh failed", now()
		s.gameInventories[key] = failed
		receipt.State, receipt.Message = "failed", err.Error()
	} else {
		s.gameInventories[key] = snapshot
		receipt.State, receipt.Message = "completed", game.ID+" inventory refreshed"
	}
	s.mu.Unlock()
	s.addEvent(receipt, receipt.State, receipt.Message)
	return receipt
}

func gameInventoryKey(steamID, gameID string) string {
	return strings.TrimSpace(steamID) + "\x00" + gameID
}

func (s *Service) SteamInventoryService(appID uint32) (domain.GameInventorySnapshot, bool) {
	s.mu.Lock()
	defer s.mu.Unlock()
	if !s.settings.FeatureFlags.EnableSteamInventory {
		return emptyGameInventory("steam-service", appID), false
	}
	if s.connection.State != domain.ConnectionStateConnected || s.connection.SteamID == "" {
		return emptyGameInventory("steam-service", appID), true
	}
	key := gameInventoryKey(s.connection.SteamID, steamInventoryServiceKey(appID))
	snapshot, ok := s.gameInventories[key]
	if !ok {
		snapshot = emptyGameInventory("steam-service", appID)
		snapshot.Status = "loading"
		snapshot.Message = fmt.Sprintf("Waiting for the first Steam Inventory Service refresh for AppID %d", appID)
	}
	return cloneGameInventory(snapshot), true
}

func (s *Service) RefreshSteamInventoryService(appID uint32) operations.Receipt {
	receipt := s.newReceipt(fmt.Sprintf("inventory.refresh.steam-service.%d", appID))
	if appID == 0 {
		receipt.State, receipt.Message = "failed", "Steam Inventory Service AppID must be greater than zero"
		s.addEvent(receipt, receipt.State, receipt.Message)
		return receipt
	}
	s.mu.Lock()
	if !s.settings.FeatureFlags.EnableSteamInventory {
		s.mu.Unlock()
		receipt.State, receipt.Message = "blocked_by_feature_flag", "Steam inventory viewing is disabled"
		s.addEvent(receipt, receipt.State, receipt.Message)
		return receipt
	}
	if s.connection.State != domain.ConnectionStateConnected || s.connection.SteamID == "" {
		s.mu.Unlock()
		receipt.State, receipt.Message = "requires_connection", "connect a Steam account to load Steam Inventory Service items"
		s.addEvent(receipt, receipt.State, receipt.Message)
		return receipt
	}
	steamIDText := s.connection.SteamID
	steamID, parseErr := strconv.ParseUint(steamIDText, 10, 64)
	if parseErr != nil || steamID == 0 {
		s.mu.Unlock()
		receipt.State, receipt.Message = "failed", "connected account has an invalid SteamID"
		s.addEvent(receipt, receipt.State, receipt.Message)
		return receipt
	}
	key := gameInventoryKey(steamIDText, steamInventoryServiceKey(appID))
	if cancel := s.gameCancels[key]; cancel != nil {
		cancel()
	}
	s.gameRefreshes[key]++
	generation := s.gameRefreshes[key]
	loading := emptyGameInventory("steam-service", appID)
	if current, ok := s.gameInventories[key]; ok {
		loading = cloneGameInventory(current)
	}
	loading.Status, loading.Message, loading.Error, loading.RefreshedAt = "loading", fmt.Sprintf("loading Steam Inventory Service AppID %d", appID), "", now()
	s.gameInventories[key] = loading
	refreshCtx, cancel := context.WithTimeout(context.Background(), 35*time.Second)
	s.gameCancels[key] = cancel
	s.mu.Unlock()
	defer cancel()

	response, requestErr := s.gcClient.RequestSteamInventoryService(refreshCtx, appID, steamID)
	var snapshot domain.GameInventorySnapshot
	if requestErr == nil {
		snapshot, requestErr = steaminventory.Snapshot(appID, response)
	}
	s.mu.Lock()
	if s.gameRefreshes[key] != generation {
		s.mu.Unlock()
		receipt.State, receipt.Message = "completed", "newer Steam Inventory Service refresh superseded this result"
		s.addEvent(receipt, receipt.State, receipt.Message)
		return receipt
	}
	delete(s.gameCancels, key)
	if requestErr != nil {
		failed := emptyGameInventory("steam-service", appID)
		failed.Status, failed.Error, failed.Message, failed.RefreshedAt = "error", requestErr.Error(), "Steam Inventory Service refresh failed", now()
		s.gameInventories[key] = failed
		receipt.State, receipt.Message = "failed", requestErr.Error()
	} else {
		s.gameInventories[key] = snapshot
		receipt.State, receipt.Message = "completed", fmt.Sprintf("Steam Inventory Service AppID %d refreshed", appID)
	}
	s.mu.Unlock()
	s.addEvent(receipt, receipt.State, receipt.Message)
	return receipt
}

func steamInventoryServiceKey(appID uint32) string {
	return fmt.Sprintf("steam-service:%d", appID)
}

func (s *Service) clearGameInventoriesLocked(gameID string) {
	for key, cancel := range s.gameCancels {
		if strings.HasSuffix(key, "\x00"+gameID) {
			cancel()
			delete(s.gameCancels, key)
			s.gameRefreshes[key]++
		}
	}
	for key := range s.gameInventories {
		if strings.HasSuffix(key, "\x00"+gameID) {
			delete(s.gameInventories, key)
		}
	}
}

func (s *Service) clearAllGameInventoriesLocked() {
	s.cancelAllGameRefreshesLocked()
	clear(s.gameInventories)
}

func (s *Service) cancelAllGameRefreshesLocked() {
	for key, cancel := range s.gameCancels {
		cancel()
		delete(s.gameCancels, key)
		s.gameRefreshes[key]++
	}
}

func (s *Service) gameInventoryEnabledLocked(gameID string) bool {
	switch gameID {
	case "steam":
		return s.settings.FeatureFlags.EnableSteamInventory
	case "tf2":
		return s.settings.FeatureFlags.EnableTF2Inventory
	case "dota2":
		return s.settings.FeatureFlags.EnableDota2Inventory
	default:
		return false
	}
}
