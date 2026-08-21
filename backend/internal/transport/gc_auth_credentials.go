package transport

import (
	"context"
	"errors"
	"fmt"
	"time"

	"github.com/Lucino772/envelop/pkg/steam/steamcm"
	"github.com/Lucino772/envelop/pkg/steam/steamlang"
	"github.com/Lucino772/envelop/pkg/steam/steammsg"
	"github.com/Lucino772/envelop/pkg/steam/steampb"
	"google.golang.org/protobuf/proto"
)

type steamAuthTokens struct{ RefreshToken, AccessToken string }

func (s *SteamGCClient) authenticateSteamClient(ctx context.Context, conn *steamcm.SteamConnection, credentials LogonCredentials) (steamAuthTokens, error) {
	unified := newNonAuthedUnifiedHandler()
	trace := newDiagnosticTrace("steam auth client auth flow started")
	if err := conn.SendPacket(mustClientHelloPacket()); err != nil {
		wrapped := fmt.Errorf("steam client hello send failed: %w", err)
		return steamAuthTokens{}, trace.Error(wrapped)
	}
	s.events <- GCEvent{Type: "steam.client_hello.sent", Payload: credentials.Username}
	trace.Add("steam auth sent ClientHello")
	if credentials.AuthCode == "" && credentials.TwoFactorCode == "" {
		if session := s.pendingAuthFor(credentials.Username); session != nil {
			trace.Add("steam auth polling existing mobile approval session")
			tokens, err := pollSteamAuthSession(ctx, unified, conn, session.ClientID, session.RequestID, session.PollInterval, steamCMLogonTimeout, trace)
			if err != nil {
				trace.Add("steam auth existing mobile approval still pending")
				return steamAuthTokens{}, DiagnosticError{err: errSteamGuardRequired, lines: trace.Lines()}
			}
			s.clearPendingAuth()
			return tokens, nil
		}
	}

	keyResp := new(steampb.CAuthentication_GetPasswordRSAPublicKey_Response)
	if err := sendNonAuthedUnifiedWithRetry(ctx, unified, conn, "Authentication.GetPasswordRSAPublicKey#1", &steampb.CAuthentication_GetPasswordRSAPublicKey_Request{
		AccountName: proto.String(credentials.Username),
	}, keyResp, trace, 2); err != nil {
		wrapped := fmt.Errorf("steam auth rsa key request failed: %w", err)
		return steamAuthTokens{}, trace.Error(wrapped)
	}
	encryptedPassword, err := encryptSteamPassword(credentials.Password, keyResp.GetPublickeyMod(), keyResp.GetPublickeyExp())
	if err != nil {
		wrapped := fmt.Errorf("steam auth password encryption failed: %w", err)
		return steamAuthTokens{}, trace.Error(wrapped)
	}
	trace.Add("steam auth encrypted password with Steam RSA key")

	beginResp := new(steampb.CAuthentication_BeginAuthSessionViaCredentials_Response)
	request := &steampb.CAuthentication_BeginAuthSessionViaCredentials_Request{
		AccountName:         proto.String(credentials.Username),
		EncryptedPassword:   proto.String(encryptedPassword),
		EncryptionTimestamp: proto.Uint64(keyResp.GetTimestamp()),
		RememberLogin:       proto.Bool(true),
		PlatformType:        steampb.EAuthTokenPlatformType_k_EAuthTokenPlatformType_SteamClient.Enum(),
		Persistence:         steampb.ESessionPersistence_k_ESessionPersistence_Persistent.Enum(),
		WebsiteId:           proto.String("Client"),
		DeviceFriendlyName:  proto.String("cs-inv-edit"),
		DeviceDetails: &steampb.CAuthentication_DeviceDetails{
			DeviceFriendlyName: proto.String("cs-inv-edit"),
			PlatformType:       steampb.EAuthTokenPlatformType_k_EAuthTokenPlatformType_SteamClient.Enum(),
			OsType:             proto.Int32(steamClientOSType()),
			MachineId:          steamMachineID(credentials.Username),
		},
		QosLevel: proto.Int32(2),
	}
	if credentials.TwoFactorCode != "" {
		request.GuardData = proto.String(credentials.TwoFactorCode)
	} else if credentials.AuthCode != "" {
		request.GuardData = proto.String(credentials.AuthCode)
	}
	if err := sendNonAuthedUnified(ctx, unified, conn, "Authentication.BeginAuthSessionViaCredentials#1", request, beginResp, trace); err != nil {
		wrapped := fmt.Errorf("steam auth session failed: %w", err)
		return steamAuthTokens{}, trace.Error(wrapped)
	}
	allowedConfirmations := beginResp.GetAllowedConfirmations()
	if len(allowedConfirmations) > 0 {
		trace.Add(fmt.Sprintf("steam auth allowed confirmations=%s", formatAllowedConfirmations(allowedConfirmations)))
		if credentials.AuthCode == "" && credentials.TwoFactorCode == "" && !hasMobileConfirmation(allowedConfirmations) {
			trace.Add("steam auth requires typed Steam Guard code")
			return steamAuthTokens{}, DiagnosticError{err: errSteamGuardRequired, lines: trace.Lines()}
		}
	}

	pollInterval := time.Second
	if beginResp.GetInterval() > 0 {
		pollInterval = time.Duration(float64(time.Second) * float64(beginResp.GetInterval()))
	}
	if credentials.AuthCode == "" && credentials.TwoFactorCode == "" && hasMobileConfirmation(allowedConfirmations) {
		s.setPendingAuth(steamAuthSession{
			AccountName:  credentials.Username,
			ClientID:     beginResp.GetClientId(),
			RequestID:    append([]byte(nil), beginResp.GetRequestId()...),
			PollInterval: pollInterval,
		})
		trace.Add("steam auth mobile approval session stored")
		return steamAuthTokens{}, DiagnosticError{err: errSteamGuardRequired, lines: trace.Lines()}
	}
	pollTimeout := steamCMLogonTimeout
	trace.Add(fmt.Sprintf("steam auth polling session timeout=%s", pollTimeout))
	tokens, err := pollSteamAuthSession(ctx, unified, conn, beginResp.GetClientId(), beginResp.GetRequestId(), pollInterval, pollTimeout, trace)
	if err != nil {
		return steamAuthTokens{}, err
	}
	s.clearPendingAuth()
	return tokens, nil
}

type steamAuthSession struct {
	AccountName  string
	ClientID     uint64
	RequestID    []byte
	PollInterval time.Duration
}

func (s *SteamGCClient) pendingAuthFor(accountName string) *steamAuthSession {
	s.mu.Lock()
	defer s.mu.Unlock()
	if s.pendingAuth == nil || s.pendingAuth.AccountName != accountName {
		return nil
	}
	session := *s.pendingAuth
	session.RequestID = append([]byte(nil), s.pendingAuth.RequestID...)
	return &session
}

func (s *SteamGCClient) setPendingAuth(session steamAuthSession) {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.pendingAuth = &session
}

func (s *SteamGCClient) clearPendingAuth() {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.pendingAuth = nil
}

func pollSteamAuthSession(ctx context.Context, unified *nonAuthedUnifiedHandler, conn *steamcm.SteamConnection, clientID uint64, requestID []byte, pollInterval time.Duration, pollTimeout time.Duration, trace *diagnosticTrace) (steamAuthTokens, error) {
	if pollInterval <= 0 {
		pollInterval = time.Second
	}
	deadline := time.NewTimer(pollTimeout)
	defer deadline.Stop()
	tick := time.NewTimer(pollInterval)
	defer tick.Stop()
	for {
		select {
		case <-ctx.Done():
			return steamAuthTokens{}, ctx.Err()
		case <-deadline.C:
			trace.Add("steam auth polling timed out before refresh token")
			return steamAuthTokens{}, fmt.Errorf("steam auth polling timed out waiting for refresh token")
		case <-tick.C:
			pollResp := new(steampb.CAuthentication_PollAuthSessionStatus_Response)
			err := sendNonAuthedUnified(ctx, unified, conn, "Authentication.PollAuthSessionStatus#1", &steampb.CAuthentication_PollAuthSessionStatus_Request{
				ClientId:  proto.Uint64(clientID),
				RequestId: append([]byte(nil), requestID...),
			}, pollResp, trace)
			if err != nil {
				var resultErr steamResultError
				if errors.As(err, &resultErr) && resultErr.result == steamlang.EResult_Pending {
					trace.Add("steam auth poll returned Pending; remote approval still in progress")
					tick.Reset(pollInterval)
					continue
				}
				wrapped := fmt.Errorf("steam auth poll failed: %w", err)
				return steamAuthTokens{}, trace.Error(wrapped)
			}
			if pollResp.GetHadRemoteInteraction() {
				trace.Add("steam auth poll observed remote interaction")
			}
			if pollResp.GetNewClientId() != 0 {
				trace.Add(fmt.Sprintf("steam auth poll returned new_client_id=%d", pollResp.GetNewClientId()))
			}
			if pollResp.GetNewChallengeUrl() != "" {
				trace.Add("steam auth poll returned new challenge url")
			}
			if pollResp.GetRefreshToken() != "" {
				trace.Add("steam auth poll returned refresh token")
				return steamAuthTokens{RefreshToken: pollResp.GetRefreshToken(), AccessToken: pollResp.GetAccessToken()}, nil
			}
			if pollResp.GetAccessToken() != "" {
				trace.Add("steam auth poll returned access token")
				return steamAuthTokens{RefreshToken: pollResp.GetAccessToken(), AccessToken: pollResp.GetAccessToken()}, nil
			}
			tick.Reset(pollInterval)
		}
	}
}

func sendNonAuthedUnified(ctx context.Context, unified *nonAuthedUnifiedHandler, conn *steamcm.SteamConnection, name string, in proto.Message, out proto.Message, trace *diagnosticTrace) error {
	if trace != nil {
		trace.Add(fmt.Sprintf("steam auth non-authed unified send started method=%s timeout=8s", name))
	}
	errCh := make(chan error, 1)
	go func() {
		resp, err := unified.SendNonAuthedMessage(conn, name, in)
		if err != nil {
			errCh <- err
			return
		}
		if trace != nil {
			trace.Add(fmt.Sprintf("steam auth non-authed unified response method=%s response_method=%q eresult=%s", name, resp.MethodName, steamResultName(resp.Result)))
		}
		if resp.Result != steamlang.EResult_OK {
			errCh <- steamResultError{method: name, result: resp.Result}
			return
		}
		if _, err := steammsg.DecodePacket(resp.Packet, out); err != nil {
			errCh <- err
			return
		}
		if trace != nil {
			trace.Add(fmt.Sprintf("steam auth non-authed unified decoded method=%s message_bytes=%d", name, proto.Size(out)))
		}
		errCh <- nil
	}()
	select {
	case <-ctx.Done():
		if trace != nil {
			trace.Add(fmt.Sprintf("steam auth non-authed unified context done method=%s err=%v", name, ctx.Err()))
		}
		return ctx.Err()
	case err := <-errCh:
		if err != nil && trace != nil {
			trace.Add(fmt.Sprintf("steam auth non-authed unified failed method=%s err=%v", name, err))
		}
		return err
	}
}

func sendNonAuthedUnifiedWithRetry(ctx context.Context, unified *nonAuthedUnifiedHandler, conn *steamcm.SteamConnection, name string, in proto.Message, out proto.Message, trace *diagnosticTrace, attempts int) error {
	if attempts < 1 {
		attempts = 1
	}
	var lastErr error
	for attempt := 1; attempt <= attempts; attempt++ {
		if trace != nil {
			trace.Add(fmt.Sprintf("steam auth non-authed unified attempt=%d/%d method=%s", attempt, attempts, name))
		}
		lastErr = sendNonAuthedUnified(ctx, unified, conn, name, in, out, trace)
		if lastErr == nil {
			return nil
		}
		if ctx.Err() != nil {
			return lastErr
		}
		if attempt < attempts {
			time.Sleep(250 * time.Millisecond)
		}
	}
	return lastErr
}

func hasMobileConfirmation(confirmations []*steampb.CAuthentication_AllowedConfirmation) bool {
	for _, confirmation := range confirmations {
		if confirmation.GetConfirmationType() == steampb.EAuthSessionGuardType_k_EAuthSessionGuardType_DeviceConfirmation {
			return true
		}
	}
	return false
}

func formatAllowedConfirmations(confirmations []*steampb.CAuthentication_AllowedConfirmation) string {
	if len(confirmations) == 0 {
		return "none"
	}
	out := ""
	for _, confirmation := range confirmations {
		if out != "" {
			out += ","
		}
		confirmationType := confirmation.GetConfirmationType().String()
		if message := confirmation.GetAssociatedMessage(); message != "" {
			out += fmt.Sprintf("%s(%s)", confirmationType, message)
		} else {
			out += confirmationType
		}
	}
	return out
}
