package app

import (
	"context"
	"strings"
	"time"

	"cs-inv-edit/backend/internal/domain"
	"cs-inv-edit/backend/internal/multigame"
	"cs-inv-edit/backend/internal/operations"
)

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
	if s.connection.State != "connected" || s.connection.SteamID == "" {
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
	if s.connection.State != "connected" || s.connection.SteamID == "" {
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
