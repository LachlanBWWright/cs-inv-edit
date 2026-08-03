package app

import (
	"context"
	"errors"
	"fmt"
	"log"
	"time"

	"cs-inv-edit/backend/internal/domain"
	"cs-inv-edit/backend/internal/operations"
	"cs-inv-edit/backend/internal/steamtrade"
	"cs-inv-edit/backend/internal/transport"
)

func (s *Service) ConnectSteam(input map[string]any) domain.ConnectionStatus {
	username, _ := input["username"].(string)
	password, _ := input["password"].(string)

	if username == "" || password == "" {
		return domain.ConnectionStatus{State: "error", Detail: "Username and password required"}
	}
	s.prepareAdditionalSteamSession()

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
			ctx, cancel := context.WithCancel(context.Background())
			s.authCancel = cancel
			s.mu.Unlock()
			go s.completeCredentialMobileApproval(ctx, username, password)
			return status
		}
		s.mu.Lock()
		s.connection = domain.ConnectionStatus{State: "error", Detail: steamErrorDetail("Steam CM logon", err), AccountName: username, Diagnostics: transport.DiagnosticsFromError(err)}
		status := s.connection
		s.mu.Unlock()
		return status
	}
	s.mu.Lock()
	presenceApps := enabledPresenceApps(s.settings.FeatureFlags)
	s.mu.Unlock()
	if err := s.gcClient.SetGamesPlayed(context.Background(), presenceApps); err != nil {
		s.mu.Lock()
		s.connection = domain.ConnectionStatus{State: "error", Detail: "Steam game coordinator presence failed: " + err.Error(), AccountName: username}
		status := s.connection
		s.mu.Unlock()
		return status
	}
	s.mu.Lock()
	s.activateAccountSessionLocked(fmt.Sprintf("%d", result.SteamID))
	s.pendingUsername = ""
	s.pendingPassword = ""
	s.registerSteamSessionLocked(domain.ConnectionStatus{State: "connected", Detail: "authenticated Steam CM logon ready for CS2 GC", SteamID: fmt.Sprintf("%d", result.SteamID), AccountName: username}, result.WebAccessToken)
	status := s.connection
	s.mu.Unlock()
	s.resolveSteamAvatar(fmt.Sprintf("%d", result.SteamID))
	s.persistSteamSession(username, result)
	return status
}

func (s *Service) StartSteamQR() domain.ConnectionStatus {
	s.prepareAdditionalSteamSession()
	s.mu.Lock()
	if s.authCancel != nil {
		s.authCancel()
	}
	s.authEpoch++
	epoch := s.authEpoch
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Minute)
	s.authCancel = cancel
	s.connection = domain.ConnectionStatus{State: "connecting", Detail: "Connecting to Steam and creating a QR sign-in session"}
	s.mu.Unlock()

	if err := s.gcClient.Connect(ctx); err != nil {
		cancel()
		return s.setQRAuthError(epoch, "Steam CM connect", err)
	}
	session, err := s.gcClient.BeginQRAuth(ctx)
	if err != nil {
		cancel()
		return s.setQRAuthError(epoch, "Steam QR login", err)
	}
	s.mu.Lock()
	if s.authEpoch != epoch {
		s.mu.Unlock()
		cancel()
		return s.ConnectionStatus()
	}
	s.connection = domain.ConnectionStatus{State: "awaiting_qr", Detail: "Scan this QR code with the Steam mobile app", QRChallengeURL: session.ChallengeURL}
	status := s.connection
	s.mu.Unlock()
	session.OnChallengeURL = func(challengeURL string) {
		s.mu.Lock()
		defer s.mu.Unlock()
		if s.authEpoch != epoch {
			return
		}
		s.connection = domain.ConnectionStatus{
			State:          "awaiting_qr",
			Detail:         "Steam refreshed the sign-in code. Scan the current QR code with the Steam mobile app",
			QRChallengeURL: challengeURL,
		}
	}
	go s.completeQRLogin(ctx, session, epoch)
	return status
}

func (s *Service) completeQRLogin(ctx context.Context, session transport.QRAuthSession, epoch uint64) {
	auth, err := s.gcClient.CompleteQRAuth(ctx, session)
	if err != nil {
		if ctx.Err() != nil && !errors.Is(ctx.Err(), context.DeadlineExceeded) {
			return
		}
		s.setQRAuthError(epoch, "Steam QR login", err)
		return
	}
	s.mu.Lock()
	if s.authEpoch != epoch {
		s.mu.Unlock()
		return
	}
	s.connection = domain.ConnectionStatus{State: "connecting", Detail: "Sign-in approved. Finishing your Steam session…", AccountName: auth.AccountName}
	s.mu.Unlock()
	if err := s.gcClient.Connect(ctx); err != nil {
		s.setQRAuthError(epoch, "Steam CM reconnect after QR approval", err)
		return
	}
	result, err := s.gcClient.LogOn(ctx, transport.LogonCredentials{Username: auth.AccountName, AccessToken: auth.RefreshToken, WebAccessToken: auth.AccessToken})
	if err != nil {
		s.setQRAuthError(epoch, "Steam QR CM logon", err)
		return
	}
	s.finishQRSteamLogin(epoch, auth.AccountName, result)
}

func (s *Service) setQRAuthError(epoch uint64, stage string, err error) domain.ConnectionStatus {
	s.mu.Lock()
	defer s.mu.Unlock()
	if s.authEpoch != epoch {
		return s.connection
	}
	s.connection = domain.ConnectionStatus{State: "error", Detail: steamErrorDetail(stage, err), Diagnostics: transport.DiagnosticsFromError(err)}
	s.authCancel = nil
	return s.connection
}

func (s *Service) finishQRSteamLogin(epoch uint64, username string, result transport.LogonResult) {
	s.mu.Lock()
	presenceApps := enabledPresenceApps(s.settings.FeatureFlags)
	s.mu.Unlock()
	if err := s.gcClient.SetGamesPlayed(context.Background(), presenceApps); err != nil {
		s.setQRAuthError(epoch, "Steam game coordinator presence", err)
		return
	}
	s.mu.Lock()
	if s.authEpoch != epoch {
		s.mu.Unlock()
		return
	}
	steamID := fmt.Sprintf("%d", result.SteamID)
	s.activateAccountSessionLocked(steamID)
	s.pendingUsername, s.pendingPassword = "", ""
	s.authCancel = nil
	s.registerSteamSessionLocked(domain.ConnectionStatus{State: "connected", Detail: "authenticated Steam CM logon ready for CS2 GC", SteamID: steamID, AccountName: username}, result.WebAccessToken)
	s.mu.Unlock()
	s.resolveSteamAvatar(steamID)
	s.persistSteamSession(username, result)
}

func (s *Service) completeCredentialMobileApproval(ctx context.Context, username, password string) {
	for {
		result, err := s.gcClient.LogOn(ctx, transport.LogonCredentials{Username: username, Password: password})
		if err == nil {
			s.finishSteamLogin(username, result)
			return
		}
		if errors.Is(err, context.Canceled) || ctx.Err() != nil {
			return
		}
		if steamGuardRequired(result.EResult) {
			continue
		}
		s.setAuthError("Steam Guard approval", err)
		return
	}
}

func (s *Service) finishSteamLogin(username string, result transport.LogonResult) {
	s.mu.Lock()
	presenceApps := enabledPresenceApps(s.settings.FeatureFlags)
	s.mu.Unlock()
	if err := s.gcClient.SetGamesPlayed(context.Background(), presenceApps); err != nil {
		s.setAuthError("Steam game coordinator presence", err)
		return
	}
	s.mu.Lock()
	s.activateAccountSessionLocked(fmt.Sprintf("%d", result.SteamID))
	s.pendingUsername, s.pendingPassword = "", ""
	s.authCancel = nil
	s.registerSteamSessionLocked(domain.ConnectionStatus{State: "connected", Detail: "authenticated Steam CM logon ready for CS2 GC", SteamID: fmt.Sprintf("%d", result.SteamID), AccountName: username}, result.WebAccessToken)
	s.mu.Unlock()
	s.resolveSteamAvatar(fmt.Sprintf("%d", result.SteamID))
	s.persistSteamSession(username, result)
}

func (s *Service) resolveSteamAvatar(steamID string) {
	resolver := s.profileResolver
	if resolver == nil || steamID == "" {
		return
	}
	go func() {
		ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
		defer cancel()
		avatarURL, err := resolver.AvatarURL(ctx, steamID)
		if err != nil {
			log.Printf("Steam avatar lookup failed for %s: %v", steamID, err)
			return
		}
		s.mu.Lock()
		defer s.mu.Unlock()
		if session := s.steamSessions[steamID]; session != nil {
			session.Connection.AvatarURL = avatarURL
		}
		if s.connection.State == domain.ConnectionStateConnected && s.connection.SteamID == steamID {
			s.connection.AvatarURL = avatarURL
		}
	}()
}

func (s *Service) setAuthError(stage string, err error) {
	s.mu.Lock()
	s.connection = domain.ConnectionStatus{State: "error", Detail: steamErrorDetail(stage, err), Diagnostics: transport.DiagnosticsFromError(err)}
	s.authCancel = nil
	s.mu.Unlock()
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
	if s.authCancel != nil {
		s.authCancel()
		s.authCancel = nil
	}
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
		// The challenge may have been cancelled while LogOn was in flight. Keep
		// the newer connection state instead of resurrecting the Guard prompt.
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
	if err := s.gcClient.SetGamesPlayed(context.Background(), enabledPresenceApps(s.settings.FeatureFlags)); err != nil {
		s.connection = domain.ConnectionStatus{State: "error", Detail: "Steam game coordinator presence failed: " + err.Error(), AccountName: username}
		return s.connection
	}
	s.activateAccountSessionLocked(fmt.Sprintf("%d", result.SteamID))
	s.pendingUsername = ""
	s.pendingPassword = ""
	s.registerSteamSessionLocked(domain.ConnectionStatus{State: "connected", Detail: "authenticated Steam CM logon ready for CS2 GC", SteamID: fmt.Sprintf("%d", result.SteamID), AccountName: username}, result.WebAccessToken)
	s.resolveSteamAvatar(fmt.Sprintf("%d", result.SteamID))
	persistSteamSessionWith(s.saveSteamSession, username, result)
	return s.connection
}

func (s *Service) cancelGameRefreshesForAccountChangeLocked(nextSteamID string) {
	if s.connection.SteamID != "" && s.connection.SteamID != nextSteamID {
		s.cancelAllGameRefreshesLocked()
	}
}

func (s *Service) DisconnectSteam() domain.ConnectionStatus {
	s.mu.Lock()
	disconnectedSteamID := s.connection.SteamID
	s.invalidateAccountSessionLocked()
	if s.authCancel != nil {
		s.authCancel()
		s.authCancel = nil
	}
	s.connection = domain.ConnectionStatus{State: "disconnected", Detail: "disconnected"}
	s.tradeAccessToken = ""
	s.trades = steamtrade.Snapshot{Status: "requires_connection", Received: []steamtrade.Trade{}, Sent: []steamtrade.Trade{}, History: []steamtrade.Trade{}, RefreshedAt: now()}
	delete(s.tradeAccounts, disconnectedSteamID)
	delete(s.steamSessions, disconnectedSteamID)
	s.activeSteamID = ""
	s.inventory = emptyInventory()
	s.clearAllGameInventoriesLocked()
	s.pendingUsername = ""
	s.pendingPassword = ""
	s.mu.Unlock()
	_ = s.gcClient.Close()
	s.clearPersistedSteamSession()
	receipt := s.newReceipt("steam.disconnect")
	s.addEvent(receipt, "completed", "steam disconnected")
	return s.ConnectionStatus()
}

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

func (s *Service) ConnectionStatus() domain.ConnectionStatus {
	s.mu.Lock()
	defer s.mu.Unlock()
	return domain.ConnectionStatus{State: s.connection.State, Detail: s.connection.Detail, SteamID: s.connection.SteamID, AccountName: s.connection.AccountName, AvatarURL: s.connection.AvatarURL, Diagnostics: append([]string(nil), s.connection.Diagnostics...), QRChallengeURL: s.connection.QRChallengeURL}
}

func (s *Service) addEvent(receipt operations.Receipt, state operations.State, message string) {
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
