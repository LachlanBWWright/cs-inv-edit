package transport

import (
	"context"
	"errors"
	"fmt"
	"time"

	"github.com/Lucino772/envelop/pkg/steam/steamcm"
	"github.com/Lucino772/envelop/pkg/steam/steamlang"
)

func (s *SteamGCClient) logOn(ctx context.Context, credentials LogonCredentials, allowTryAnotherCM bool) (LogonResult, error) {
	s.mu.Lock()
	conn := s.conn
	s.mu.Unlock()
	if conn == nil {
		return LogonResult{}, ErrNotConnected
	}
	if credentials.Username == "" {
		return LogonResult{}, fmt.Errorf("username is required")
	}
	if credentials.Password == "" && credentials.LoginKey == "" && credentials.AccessToken == "" {
		return LogonResult{}, fmt.Errorf("password, login key, or access token is required")
	}

	if credentials.Password != "" && credentials.LoginKey == "" {
		tokens, err := s.authenticateSteamClient(ctx, conn, credentials)
		if err != nil {
			if errors.Is(err, errSteamGuardRequired) {
				return LogonResult{EResult: int32(steamlang.EResult_AccountLoginDeniedNeedTwoFactor)}, err
			}
			var resultErr steamResultError
			if errors.As(err, &resultErr) {
				if resultErr.result == steamlang.EResult_TryAnotherCM {
					s.events <- GCEvent{Type: "steam.auth.try_another_cm", Payload: steamResultName(resultErr.result)}
					s.closeAndClearConn(conn)
					if !allowTryAnotherCM {
						s.setState("error")
						return LogonResult{EResult: int32(resultErr.result)}, fmt.Errorf("steam auth failed after reconnect: %w", err)
					}
					if connectErr := s.Connect(ctx); connectErr != nil {
						s.setState("error")
						return LogonResult{EResult: int32(resultErr.result)}, fmt.Errorf("steam requested a different CM but reconnect failed: %w", connectErr)
					}
					return s.logOn(ctx, credentials, false)
				}
				if steamGuardResult(resultErr.result) {
					s.setState("connected")
					return LogonResult{EResult: int32(resultErr.result)}, err
				}
			}
			s.setState("error")
			s.closeAndClearConn(conn)
			return LogonResult{}, err
		}
		credentials.Password = ""
		credentials.AuthCode = ""
		credentials.TwoFactorCode = ""
		credentials.AccessToken = tokens.RefreshToken
		credentials.WebAccessToken = tokens.AccessToken
	}

	jobID := conn.GetNextJobId()

	packet, err := encodeClientLogonPacket(jobID, credentials)
	if err != nil {
		return LogonResult{}, err
	}
	if err := conn.SendPacket(packet); err != nil {
		return LogonResult{}, err
	}
	s.events <- GCEvent{Type: "steam.logon.sent", Payload: credentials.Username}

	timeout := time.NewTimer(steamCMLogonTimeout)
	defer timeout.Stop()
	seen := make(map[string]int)
	for {
		select {
		case <-ctx.Done():
			s.setState("error")
			s.closeAndClearConn(conn)
			return LogonResult{}, ctx.Err()
		case <-timeout.C:
			s.setState("error")
			s.closeAndClearConn(conn)
			return LogonResult{}, fmt.Errorf("steam cm logon timed out after %s waiting for ClientLogOnResponse; observed_events=%s", steamCMLogonTimeout, formatObservedEvents(seen))
		case event := <-s.events:
			if event.Type != "steam.logon_response" {
				seen[event.Type]++
				if event.Type == "steam.logged_off" || event.Type == "steam.server_unavailable" {
					s.setState("error")
					s.closeAndClearConn(conn)
					return LogonResult{}, fmt.Errorf("steam cm logon failed before ClientLogOnResponse: %s payload=%v observed_events=%s", event.Type, event.Payload, formatObservedEvents(seen))
				}
				continue
			}
			logonResponse, ok := event.Payload.(steamLogonResponse)
			if !ok || logonResponse.Body == nil {
				s.setState("error")
				s.closeAndClearConn(conn)
				return LogonResult{}, fmt.Errorf("unexpected logon response payload %T", event.Payload)
			}
			response := logonResponse.Body
			steamID := authenticatedSteamID(logonResponse)
			result := LogonResult{
				EResult:        response.GetEresult(),
				SteamID:        steamID,
				RefreshToken:   credentials.AccessToken,
				WebAccessToken: credentials.WebAccessToken,
			}
			resultCode := steamlang.EResult(response.GetEresult())
			if resultCode == steamlang.EResult_TryAnotherCM {
				s.events <- GCEvent{Type: "steam.logon.try_another_cm", Payload: steamResultName(resultCode)}
				s.closeAndClearConn(conn)
				if !allowTryAnotherCM {
					s.setState("error")
					return result, fmt.Errorf("steam logon failed after reconnect: %s", steamResultName(resultCode))
				}
				if err := s.Connect(ctx); err != nil {
					s.setState("error")
					return result, fmt.Errorf("steam requested a different CM but reconnect failed: %w", err)
				}
				return s.logOn(ctx, credentials, false)
			}
			if resultCode != steamlang.EResult_OK {
				if steamGuardResult(resultCode) {
					s.setState("connected")
					return result, fmt.Errorf("steam logon failed: %s", steamResultName(resultCode))
				}
				s.setState("auth_failed")
				s.closeAndClearConn(conn)
				return result, fmt.Errorf("steam logon failed: %s", steamResultName(resultCode))
			}
			s.setState("logged_on")
			s.activateAuthenticatedAccount(steamID)
			s.rememberAuthenticatedSession(credentials, response.GetHeartbeatSeconds())
			s.events <- GCEvent{Type: "steam.logged_on", Payload: result}
			return result, nil
		}
	}
}

func (s *SteamGCClient) rememberAuthenticatedSession(credentials LogonCredentials, heartbeatSeconds int32) {
	credentials.Password = ""
	credentials.AuthCode = ""
	credentials.TwoFactorCode = ""
	s.mu.Lock()
	s.reauthCredentials = credentials
	if s.heartbeatCancel != nil {
		s.heartbeatCancel()
	}
	ctx, cancel := context.WithCancel(context.Background())
	s.heartbeatCancel = cancel
	conn := s.conn
	s.mu.Unlock()
	if heartbeatSeconds <= 0 {
		heartbeatSeconds = 30
	}
	go s.runSteamHeartbeat(ctx, conn, time.Duration(heartbeatSeconds)*time.Second)
}

func (s *SteamGCClient) runSteamHeartbeat(ctx context.Context, conn *steamcm.SteamConnection, interval time.Duration) {
	ticker := time.NewTicker(interval)
	defer ticker.Stop()
	for {
		select {
		case <-ctx.Done():
			return
		case <-ticker.C:
			packet, err := encodeClientHeartbeatPacket()
			if err != nil {
				continue
			}
			s.mu.Lock()
			current := s.conn == conn && s.state.State == "logged_on"
			s.mu.Unlock()
			if !current {
				return
			}
			if err := conn.SendPacket(packet); err != nil {
				s.handleSteamSessionEnded(conn, "heartbeat_failed")
				return
			}
		}
	}
}

func (s *SteamGCClient) ensureSteamSession(ctx context.Context) error {
	s.sessionMu.Lock()
	defer s.sessionMu.Unlock()
	s.mu.Lock()
	if s.conn != nil && s.state.State == "logged_on" {
		s.mu.Unlock()
		return nil
	}
	credentials := s.reauthCredentials
	gamesPlayed := append([]uint32(nil), s.gamesPlayed...)
	s.mu.Unlock()
	if credentials.AccessToken == "" {
		return fmt.Errorf("Steam session ended and no refresh token is available for automatic logon")
	}
	if err := s.Connect(ctx); err != nil {
		return err
	}
	if _, err := s.LogOn(ctx, credentials); err != nil {
		return err
	}
	if len(gamesPlayed) > 0 {
		if err := s.sendGamesPlayed(gamesPlayed); err != nil {
			return err
		}
	}
	return nil
}

func authenticatedSteamID(response steamLogonResponse) uint64 {
	if response.SteamID != 0 {
		return response.SteamID
	}
	if response.Body == nil {
		return 0
	}
	return response.Body.GetClientSuppliedSteamid()
}
