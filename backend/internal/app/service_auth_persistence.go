package app

import (
	"context"
	"fmt"
	"log"

	"cs-inv-edit/backend/internal/domain"
	"cs-inv-edit/backend/internal/transport"
)

// ConfigureSteamSessionPersistence installs native credential storage hooks.
// Browser/WASM callers intentionally leave these unset.
func (s *Service) ConfigureSteamSessionPersistence(save func(transport.LogonCredentials) error, clear func() error) {
	s.mu.Lock()
	s.saveSteamSession = save
	s.clearSteamSession = clear
	s.mu.Unlock()
}

func (s *Service) persistSteamSession(username string, result transport.LogonResult) {
	s.mu.Lock()
	save := s.saveSteamSession
	s.mu.Unlock()
	persistSteamSessionWith(save, username, result)
}

func persistSteamSessionWith(save func(transport.LogonCredentials) error, username string, result transport.LogonResult) {
	if username == "" || result.RefreshToken == "" {
		return
	}
	if save != nil {
		if err := save(transport.LogonCredentials{Username: username, AccessToken: result.RefreshToken, WebAccessToken: result.WebAccessToken}); err != nil {
			log.Printf("Steam session persistence failed: %v", err)
		}
	}
}

func (s *Service) clearPersistedSteamSession() {
	s.mu.Lock()
	clear := s.clearSteamSession
	s.mu.Unlock()
	if clear != nil {
		if err := clear(); err != nil {
			log.Printf("Steam session removal failed: %v", err)
		}
	}
}

// RestoreSteamSession recreates the transient CM and GC presence from a saved
// refresh token. Failure leaves the normal interactive login flow available.
func (s *Service) RestoreSteamSession(ctx context.Context, credentials transport.LogonCredentials) error {
	if credentials.Username == "" || credentials.AccessToken == "" {
		return fmt.Errorf("saved Steam session is incomplete")
	}
	s.mu.Lock()
	s.connection = domain.ConnectionStatus{State: "connecting", Detail: "Restoring saved Steam session", AccountName: credentials.Username}
	s.mu.Unlock()
	if err := s.gcClient.Connect(ctx); err != nil {
		return s.failSteamSessionRestore(fmt.Errorf("restore Steam CM connection: %w", err))
	}
	result, err := s.gcClient.LogOn(ctx, credentials)
	if err != nil {
		return s.failSteamSessionRestore(fmt.Errorf("restore Steam CM logon: %w", err))
	}
	s.mu.Lock()
	presenceApps := enabledPresenceApps(s.settings.FeatureFlags)
	s.mu.Unlock()
	if err := s.gcClient.SetGamesPlayed(ctx, presenceApps); err != nil {
		return s.failSteamSessionRestore(fmt.Errorf("restore Steam game presence: %w", err))
	}
	steamID := fmt.Sprintf("%d", result.SteamID)
	s.mu.Lock()
	s.activateAccountSessionLocked(steamID)
	s.registerSteamSessionLocked(domain.ConnectionStatus{State: "connected", Detail: "saved Steam session restored", SteamID: steamID, AccountName: credentials.Username}, result.WebAccessToken)
	s.mu.Unlock()
	s.persistSteamSession(credentials.Username, result)
	s.resolveSteamAvatar(steamID)
	return nil
}

func (s *Service) failSteamSessionRestore(err error) error {
	s.mu.Lock()
	s.connection = domain.ConnectionStatus{State: "error", Detail: "Saved Steam session could not be restored: " + err.Error(), Diagnostics: transport.DiagnosticsFromError(err)}
	s.mu.Unlock()
	return err
}
