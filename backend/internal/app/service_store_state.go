package app

import (
	"context"
	"strconv"
	"time"

	"cs-inv-edit/backend/internal/domain"
	"cs-inv-edit/backend/internal/operations"
	"cs-inv-edit/backend/internal/protocol"
)

func (s *Service) Armory() domain.ArmorySnapshot {
	s.mu.Lock()
	defer s.mu.Unlock()
	return cloneArmory(s.armory)
}

func (s *Service) Store() domain.StoreSnapshot {
	s.mu.Lock()
	defer s.mu.Unlock()
	if !s.settings.FeatureFlags.EnableStoreRead {
		return domain.StoreSnapshot{Status: "error", Offers: []domain.StoreOffer{}, RefreshedAt: now(), Message: "CS2 cash-store reads are disabled. Enable enableStoreRead in Settings to load the catalogue."}
	}
	if s.connection.State == domain.ConnectionStateConnected && s.store.Status == domain.StoreStatusRequiresConnection {
		store := cloneStore(s.store)
		store.Message = "Steam is connected. Refresh the Store to load the current GC price sheet."
		if !s.settings.FeatureFlags.EnableFullCS2Store {
			store.Offers = couponStoreOffers(store.Offers)
		}
		return store
	}
	store := cloneStore(s.store)
	if !s.settings.FeatureFlags.EnableFullCS2Store {
		store.Offers = couponStoreOffers(store.Offers)
		if store.Status == domain.StoreStatusReady {
			store.Message = "Showing coupon items available through Steam's browser checkout. Enable Full CS2 Store to show experimental GC checkout offers."
		}
	}
	return store
}

func couponStoreOffers(offers []domain.StoreOffer) []domain.StoreOffer {
	filtered := make([]domain.StoreOffer, 0, len(offers))
	for _, offer := range offers {
		if offer.Coupon {
			filtered = append(filtered, offer)
		}
	}
	return filtered
}

func (s *Service) ReconcileStorePurchase(id string) domain.PurchaseSession {
	s.mu.Lock()
	session, ok := s.purchaseSessions[id]
	if !ok {
		s.mu.Unlock()
		return domain.PurchaseSession{ID: id, Status: "failed", Quantity: 1, CreatedAt: now(), Message: "purchase session not found"}
	}
	if session.Status != domain.PurchaseStatusAwaitingUser && session.Status != domain.PurchaseStatusFinalizing {
		s.mu.Unlock()
		return session
	}
	session.Status, session.Message = "finalizing", "Finalizing the authorized purchase with CS2"
	s.purchaseSessions[id] = session
	expected := append([]uint64(nil), s.purchaseItemIDs[id]...)
	appID := s.purchaseAppIDs[id]
	if appID == 0 {
		appID = protocol.AppIDCS2
	}
	s.mu.Unlock()
	orderID, parseErr := strconv.ParseUint(session.OrderID, 10, 64)
	if parseErr != nil || orderID == 0 {
		s.mu.Lock()
		session = s.purchaseSessions[id]
		session.Status, session.Message = "failed", "Purchase session has no valid GC order ID."
		s.purchaseSessions[id] = session
		s.mu.Unlock()
		return session
	}
	finalizeCtx, cancelFinalize := context.WithTimeout(context.Background(), 12*time.Second)
	finalizedItemIDs, finalizeErr := s.gcClient.FinalizeGameStorePurchase(finalizeCtx, appID, orderID)
	cancelFinalize()
	if finalizeErr != nil {
		s.mu.Lock()
		session = s.purchaseSessions[id]
		session.Status, session.Message = "awaiting_user", "Steam has not authorized this purchase yet. Approve checkout, then retry finalization."
		session.Diagnostics = append(session.Diagnostics, finalizeErr.Error())
		s.purchaseSessions[id] = session
		s.mu.Unlock()
		return session
	}
	if len(finalizedItemIDs) > 0 {
		expected = finalizedItemIDs
		s.mu.Lock()
		s.purchaseItemIDs[id] = append([]uint64(nil), finalizedItemIDs...)
		s.mu.Unlock()
	}
	if appID == tf2AppID {
		receipt := s.RefreshGameInventory("tf2")
		s.mu.Lock()
		defer s.mu.Unlock()
		session = s.purchaseSessions[id]
		if receipt.State == operations.StateCompleted {
			session.Status, session.Message = "completed", "TF2 purchase finalized and inventory refreshed from the Game Coordinator."
		} else {
			session.Status, session.Message = "awaiting_user", "TF2 inventory refresh could not confirm the purchase yet."
		}
		s.purchaseSessions[id] = session
		return session
	}
	receipt := s.RefreshInventory()
	s.mu.Lock()
	defer s.mu.Unlock()
	session = s.purchaseSessions[id]
	if receipt.State != operations.StateCompleted {
		session.Status, session.Message = "awaiting_user", "Inventory refresh could not confirm the purchase; retry reconciliation after Steam finishes."
		s.purchaseSessions[id] = session
		return session
	}
	owned := make(map[string]struct{}, len(s.inventory.Items))
	for _, item := range s.inventory.Items {
		owned[item.ID] = struct{}{}
	}
	matched := make([]string, 0, len(expected))
	for _, itemID := range expected {
		idText := strconv.FormatUint(itemID, 10)
		if _, ok := owned[idText]; ok {
			matched = append(matched, idText)
		}
	}
	if len(expected) > 0 && len(matched) == len(expected) {
		session.Status, session.Message, session.PurchasedItemIDs = "completed", "Purchase confirmed in the GC-owned inventory.", matched
	} else {
		session.Status, session.Message = "awaiting_user", "Steam checkout is not yet reflected in the GC-owned inventory."
	}
	s.purchaseSessions[id] = session
	return session
}

func (s *Service) StorePurchase(id string) (domain.PurchaseSession, bool) {
	s.mu.Lock()
	defer s.mu.Unlock()
	session, ok := s.purchaseSessions[id]
	return session, ok
}
