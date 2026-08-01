package app

import (
	"context"
	"fmt"
	"time"

	"cs-inv-edit/backend/internal/domain"
	"cs-inv-edit/backend/internal/protocol"
)

const gcSessionFreshness = 30 * time.Second

type gcSessionKey struct {
	AccountID string
	AppID     uint32
	Epoch     uint64
}

type gcSessionState struct {
	ReadyAt  time.Time
	Checking chan struct{}
	LastErr  error
}

func (s *Service) activateAccountSessionLocked(nextSteamID string) {
	if s.gcSessionCancel != nil {
		s.gcSessionCancel()
	}
	s.gcSessionEpoch++
	s.gcSessionContext, s.gcSessionCancel = context.WithCancel(context.Background())
	s.gcSessions = make(map[gcSessionKey]*gcSessionState)
	if s.connection.SteamID != "" && s.connection.SteamID != nextSteamID {
		s.cancelAllGameRefreshesLocked()
		s.inventory = emptyInventory()
		s.armory = emptyArmory()
		s.store = emptyStore()
		s.tf2Store = emptyTF2Store()
		s.purchaseSessions = make(map[string]domain.PurchaseSession)
		s.purchaseItemIDs = make(map[string][]uint64)
		s.purchaseAppIDs = make(map[string]uint32)
	}
}

func (s *Service) invalidateAccountSessionLocked() {
	if s.gcSessionCancel != nil {
		s.gcSessionCancel()
		s.gcSessionCancel = nil
	}
	s.gcSessionContext = nil
	s.gcSessionEpoch++
	s.gcSessions = make(map[gcSessionKey]*gcSessionState)
}

func (s *Service) currentGCSessionKeyLocked(appID uint32) (gcSessionKey, context.Context, error) {
	if s.connection.State != domain.ConnectionStateConnected {
		return gcSessionKey{}, nil, fmt.Errorf("Steam account is not connected")
	}
	accountID := s.connection.SteamID
	if accountID == "" {
		accountID = s.connection.AccountName
	}
	if accountID == "" {
		accountID = "connected-account"
	}
	if s.gcSessionContext == nil {
		s.gcSessionEpoch++
		s.gcSessionContext, s.gcSessionCancel = context.WithCancel(context.Background())
	}
	return gcSessionKey{AccountID: accountID, AppID: appID, Epoch: s.gcSessionEpoch}, s.gcSessionContext, nil
}

func (s *Service) ensureGCSession(ctx context.Context, appID uint32) error {
	for {
		s.mu.Lock()
		key, accountCtx, keyErr := s.currentGCSessionKeyLocked(appID)
		if keyErr != nil {
			s.mu.Unlock()
			return keyErr
		}
		state := s.gcSessions[key]
		if state != nil && !state.ReadyAt.IsZero() && time.Since(state.ReadyAt) < gcSessionFreshness {
			s.mu.Unlock()
			return nil
		}
		if state != nil && state.Checking != nil {
			checking := state.Checking
			s.mu.Unlock()
			select {
			case <-ctx.Done():
				return ctx.Err()
			case <-accountCtx.Done():
				return fmt.Errorf("GC session superseded by an account change")
			case <-checking:
			}
			s.mu.Lock()
			completed := s.gcSessions[key]
			if completed != nil && completed.Checking == nil {
				if completed.LastErr != nil {
					err := completed.LastErr
					s.mu.Unlock()
					return err
				}
				if !completed.ReadyAt.IsZero() {
					s.mu.Unlock()
					return nil
				}
			}
			s.mu.Unlock()
			continue
		}
		checking := make(chan struct{})
		s.gcSessions[key] = &gcSessionState{Checking: checking}
		s.mu.Unlock()

		requestCtx, cancel := context.WithCancel(ctx)
		stopAccountCancel := context.AfterFunc(accountCtx, cancel)
		var requestErr error
		switch appID {
		case protocol.AppIDCS2:
			_, requestErr = s.gcClient.RequestInventory(requestCtx)
		case 440, 570:
			_, requestErr = s.gcClient.RequestGameInventory(requestCtx, appID)
		default:
			requestErr = fmt.Errorf("unsupported GC AppID %d", appID)
		}
		stopAccountCancel()
		cancel()

		s.mu.Lock()
		currentKey, _, currentErr := s.currentGCSessionKeyLocked(appID)
		state = s.gcSessions[key]
		if state != nil && state.Checking == checking {
			state.Checking = nil
			state.LastErr = requestErr
			if requestErr == nil && currentErr == nil && currentKey == key {
				state.ReadyAt = time.Now()
			}
			close(checking)
		}
		s.mu.Unlock()
		if currentErr != nil || currentKey != key {
			return fmt.Errorf("GC session superseded by an account change")
		}
		return requestErr
	}
}

func (s *Service) markGCSessionReady(appID uint32) {
	s.mu.Lock()
	defer s.mu.Unlock()
	key, _, err := s.currentGCSessionKeyLocked(appID)
	if err != nil {
		return
	}
	state := s.gcSessions[key]
	if state == nil {
		state = &gcSessionState{}
		s.gcSessions[key] = state
	}
	state.ReadyAt = time.Now()
	state.LastErr = nil
}
