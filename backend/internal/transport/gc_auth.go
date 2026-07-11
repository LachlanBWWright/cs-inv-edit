package transport

import (
	"context"
	"crypto/rand"
	"crypto/rsa"
	"crypto/sha1"
	"encoding/base64"
	"encoding/hex"
	"errors"
	"fmt"
	"math/big"
	"time"

	"github.com/Lucino772/envelop/pkg/steam"
	"github.com/Lucino772/envelop/pkg/steam/steamcm"
	"github.com/Lucino772/envelop/pkg/steam/steamlang"
	"github.com/Lucino772/envelop/pkg/steam/steammsg"
	"github.com/Lucino772/envelop/pkg/steam/steampb"
	"google.golang.org/protobuf/proto"
)

func (s *SteamGCClient) LogOn(ctx context.Context, credentials LogonCredentials) (LogonResult, error) {
	return s.logOn(ctx, credentials, true)
}

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
		refreshToken, err := s.authenticateSteamClient(ctx, conn, credentials)
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
		credentials.AccessToken = refreshToken
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
			response, ok := event.Payload.(*steampb.CMsgClientLogonResponse)
			if !ok || response == nil {
				s.setState("error")
				s.closeAndClearConn(conn)
				return LogonResult{}, fmt.Errorf("unexpected logon response payload %T", event.Payload)
			}
			result := LogonResult{
				EResult: response.GetEresult(),
				SteamID: response.GetClientSuppliedSteamid(),
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
			s.events <- GCEvent{Type: "steam.logged_on", Payload: result}
			return result, nil
		}
	}
}

func (s *SteamGCClient) authenticateSteamClient(ctx context.Context, conn *steamcm.SteamConnection, credentials LogonCredentials) (string, error) {
	unified := newNonAuthedUnifiedHandler()
	trace := newDiagnosticTrace("steam auth client auth flow started")
	if err := conn.SendPacket(mustClientHelloPacket()); err != nil {
		wrapped := fmt.Errorf("steam client hello send failed: %w", err)
		return "", trace.Error(wrapped)
	}
	s.events <- GCEvent{Type: "steam.client_hello.sent", Payload: credentials.Username}
	trace.Add("steam auth sent ClientHello")
	if credentials.AuthCode == "" && credentials.TwoFactorCode == "" {
		if session := s.pendingAuthFor(credentials.Username); session != nil {
			trace.Add("steam auth polling existing mobile approval session")
			refreshToken, err := pollSteamAuthSession(ctx, unified, conn, session.ClientID, session.RequestID, session.PollInterval, steamCMLogonTimeout, trace)
			if err != nil {
				trace.Add("steam auth existing mobile approval still pending")
				return "", DiagnosticError{err: errSteamGuardRequired, lines: trace.Lines()}
			}
			s.clearPendingAuth()
			return refreshToken, nil
		}
	}

	keyResp := new(steampb.CAuthentication_GetPasswordRSAPublicKey_Response)
	if err := sendNonAuthedUnifiedWithRetry(ctx, unified, conn, "Authentication.GetPasswordRSAPublicKey#1", &steampb.CAuthentication_GetPasswordRSAPublicKey_Request{
		AccountName: proto.String(credentials.Username),
	}, keyResp, trace, 2); err != nil {
		wrapped := fmt.Errorf("steam auth rsa key request failed: %w", err)
		return "", trace.Error(wrapped)
	}
	encryptedPassword, err := encryptSteamPassword(credentials.Password, keyResp.GetPublickeyMod(), keyResp.GetPublickeyExp())
	if err != nil {
		wrapped := fmt.Errorf("steam auth password encryption failed: %w", err)
		return "", trace.Error(wrapped)
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
			OsType:             proto.Int32(20),
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
		return "", trace.Error(wrapped)
	}
	allowedConfirmations := beginResp.GetAllowedConfirmations()
	if len(allowedConfirmations) > 0 {
		trace.Add(fmt.Sprintf("steam auth allowed confirmations=%s", formatAllowedConfirmations(allowedConfirmations)))
		if credentials.AuthCode == "" && credentials.TwoFactorCode == "" && !hasMobileConfirmation(allowedConfirmations) {
			trace.Add("steam auth requires typed Steam Guard code")
			return "", DiagnosticError{err: errSteamGuardRequired, lines: trace.Lines()}
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
		return "", DiagnosticError{err: errSteamGuardRequired, lines: trace.Lines()}
	}
	pollTimeout := steamCMLogonTimeout
	trace.Add(fmt.Sprintf("steam auth polling session timeout=%s", pollTimeout))
	refreshToken, err := pollSteamAuthSession(ctx, unified, conn, beginResp.GetClientId(), beginResp.GetRequestId(), pollInterval, pollTimeout, trace)
	if err != nil {
		return "", err
	}
	s.clearPendingAuth()
	return refreshToken, nil
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

func pollSteamAuthSession(ctx context.Context, unified *nonAuthedUnifiedHandler, conn *steamcm.SteamConnection, clientID uint64, requestID []byte, pollInterval time.Duration, pollTimeout time.Duration, trace *diagnosticTrace) (string, error) {
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
			return "", ctx.Err()
		case <-deadline.C:
			trace.Add("steam auth polling timed out before refresh token")
			return "", fmt.Errorf("steam auth polling timed out waiting for refresh token")
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
				return "", trace.Error(wrapped)
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
				return pollResp.GetRefreshToken(), nil
			}
			if pollResp.GetAccessToken() != "" {
				trace.Add("steam auth poll returned access token")
				return pollResp.GetAccessToken(), nil
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
			trace.Add(fmt.Sprintf("steam auth non-authed unified response method=%s eresult=%s", name, steamResultName(resp.Result)))
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
			trace.Add(fmt.Sprintf("steam auth non-authed unified decoded method=%s", name))
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

func encryptSteamPassword(password string, modulusHex string, exponentHex string) (string, error) {
	modBytes, err := hex.DecodeString(modulusHex)
	if err != nil {
		return "", fmt.Errorf("invalid steam rsa modulus: %w", err)
	}
	expBytes, err := hex.DecodeString(exponentHex)
	if err != nil {
		return "", fmt.Errorf("invalid steam rsa exponent: %w", err)
	}
	exp := new(big.Int).SetBytes(expBytes)
	pub := &rsa.PublicKey{N: new(big.Int).SetBytes(modBytes), E: int(exp.Int64())}
	encrypted, err := rsa.EncryptPKCS1v15(rand.Reader, pub, []byte(password))
	if err != nil {
		return "", fmt.Errorf("failed to encrypt steam password: %w", err)
	}
	return base64.StdEncoding.EncodeToString(encrypted), nil
}

func mustClientHelloPacket() *steammsg.Packet {
	packet, err := encodeClientHelloPacket()
	if err != nil {
		panic(err)
	}
	return packet
}
func encodeClientLogonPacket(jobID steam.JobId, credentials LogonCredentials) (*steammsg.Packet, error) {
	clientSteamID := steam.NewSteamId(0, steamlang.EUniverse_Public, steamlang.EAccountType_Individual)
	header := steammsg.NewProtoHeader(steamlang.EMsg_ClientLogon)
	header.Proto.ClientSessionid = proto.Int32(0)
	header.Proto.Steamid = proto.Uint64(uint64(clientSteamID))
	header.Proto.JobidSource = proto.Uint64(uint64(jobID))
	body := &steampb.CMsgClientLogon{
		ProtocolVersion:                proto.Uint32(65580),
		CellId:                         proto.Uint32(0),
		ClientPackageVersion:           proto.Uint32(1771),
		ClientOsType:                   proto.Uint32(20),
		ClientLanguage:                 proto.String("english"),
		ObfuscatedPrivateIp:            &steampb.CMsgIPAddress{Ip: &steampb.CMsgIPAddress_V4{V4: 0}},
		ClientSuppliedSteamId:          proto.Uint64(uint64(clientSteamID)),
		AccountName:                    proto.String(credentials.Username),
		ShouldRememberPassword:         proto.Bool(false),
		SteamguardDontRememberComputer: proto.Bool(true),
		MachineName:                    proto.String("cs-inv-edit"),
		MachineNameUserchosen:          proto.String("cs-inv-edit"),
		MachineId:                      steamMachineID(credentials.Username),
		LauncherType:                   proto.Uint32(0),
		UiMode:                         proto.Uint32(0),
		ChatMode:                       proto.Uint32(2),
		Steam2TicketRequest:            proto.Bool(true),
		SupportsRateLimitResponse:      proto.Bool(true),
	}
	if credentials.Password != "" {
		body.Password = proto.String(credentials.Password)
	}
	if credentials.LoginKey != "" {
		body.LoginKey = proto.String(credentials.LoginKey)
	}
	if credentials.AccessToken != "" {
		body.AccessToken = proto.String(credentials.AccessToken)
		body.ShouldRememberPassword = proto.Bool(true)
	}
	if credentials.AuthCode != "" {
		body.AuthCode = proto.String(credentials.AuthCode)
	}
	if credentials.TwoFactorCode != "" {
		body.TwoFactorCode = proto.String(credentials.TwoFactorCode)
	}
	return steammsg.EncodePacket(header, body, nil)
}

func encodeClientHelloPacket() (*steammsg.Packet, error) {
	header := steammsg.NewProtoHeader(steamEMsgClientHello)
	header.Proto.ClientSessionid = proto.Int32(0)
	header.Proto.Steamid = proto.Uint64(0)
	body := &steampb.CMsgClientHello{
		ProtocolVersion: proto.Uint32(65580),
	}
	return steammsg.EncodePacket(header, body, nil)
}

func steamMachineID(accountName string) []byte {
	sum := sha1.Sum([]byte("cs-inv-edit:" + accountName))
	return append([]byte(nil), sum[:]...)
}

func formatObservedEvents(events map[string]int) string {
	if len(events) == 0 {
		return "none"
	}
	out := ""
	for eventType, count := range events {
		if out != "" {
			out += ","
		}
		out += fmt.Sprintf("%s:%d", eventType, count)
	}
	return out
}
func steamResultName(result steamlang.EResult) string {
	switch result {
	case steamlang.EResult_OK:
		return "OK (success)"
	case steamlang.EResult_Fail:
		return "Fail (generic Steam failure)"
	case steamlang.EResult_NoConnection:
		return "NoConnection (Steam CM connection is unavailable)"
	case steamlang.EResult_InvalidPassword:
		return "InvalidPassword (incorrect account name or password)"
	case steamlang.EResult_LoggedInElsewhere:
		return "LoggedInElsewhere (account is logged in elsewhere)"
	case steamlang.EResult_InvalidParam:
		return "InvalidParam (Steam rejected a malformed request)"
	case steamlang.EResult_AccessDenied:
		return "AccessDenied (Steam denied access)"
	case steamlang.EResult_Timeout:
		return "Timeout (Steam request timed out)"
	case steamlang.EResult_AccountNotFound:
		return "AccountNotFound (Steam account was not found)"
	case steamlang.EResult_ServiceUnavailable:
		return "ServiceUnavailable (Steam service is unavailable)"
	case steamlang.EResult_NotLoggedOn:
		return "NotLoggedOn (Steam session is not logged on)"
	case steamlang.EResult_Busy:
		return "Busy (Steam service is busy)"
	case steamlang.EResult_LimitExceeded:
		return "LimitExceeded (Steam rate or request limit exceeded)"
	case steamlang.EResult_LogonSessionReplaced:
		return "LogonSessionReplaced (Steam replaced this logon session)"
	case steamlang.EResult_ConnectFailed:
		return "ConnectFailed (Steam CM connection failed)"
	case steamlang.EResult_HandshakeFailed:
		return "HandshakeFailed (Steam CM handshake failed)"
	case steamlang.EResult_IOFailure:
		return "IOFailure (Steam transport I/O failed)"
	case steamlang.EResult_RemoteDisconnect:
		return "RemoteDisconnect (Steam closed the connection)"
	case steamlang.EResult_AccountDisabled:
		return "AccountDisabled (Steam account is disabled)"
	case steamlang.EResult_TryAnotherCM:
		return "TryAnotherCM (Steam requested reconnecting to a different CM)"
	case steamlang.EResult_PasswordRequiredToKickSession:
		return "PasswordRequiredToKickSession (Steam requires password to replace another session)"
	case steamlang.EResult_AlreadyLoggedInElsewhere:
		return "AlreadyLoggedInElsewhere (account already has another active session)"
	case steamlang.EResult_Suspended:
		return "Suspended (Steam account is suspended)"
	case steamlang.EResult_Cancelled:
		return "Cancelled (Steam cancelled the request)"
	case steamlang.EResult_PasswordUnset:
		return "PasswordUnset (Steam account has no password set)"
	case steamlang.EResult_IllegalPassword:
		return "IllegalPassword (Steam rejected the password format)"
	case steamlang.EResult_AccountLogonDenied:
		return "AccountLogonDenied (Steam Guard confirmation is required)"
	case steamlang.EResult_AccountLoginDeniedNeedTwoFactor:
		return "AccountLoginDeniedNeedTwoFactor (Steam Guard mobile authenticator code is required)"
	case steamlang.EResult_InvalidLoginAuthCode:
		return "InvalidLoginAuthCode (Steam Guard email code is incorrect)"
	case steamlang.EResult_TwoFactorCodeMismatch:
		return "TwoFactorCodeMismatch (Steam Guard mobile code is incorrect)"
	case steamlang.EResult_ExpiredLoginAuthCode:
		return "ExpiredLoginAuthCode (Steam Guard code expired)"
	case steamlang.EResult_AccountLoginDeniedThrottle:
		return "AccountLoginDeniedThrottle (too many Steam login attempts; wait before retrying)"
	case steamlang.EResult_RateLimitExceeded:
		return "RateLimitExceeded (Steam rate limit exceeded)"
	case steamlang.EResult_RequirePasswordReEntry:
		return "RequirePasswordReEntry (Steam requires password re-entry)"
	case steamlang.EResult_BadResponse:
		return "BadResponse (Steam returned an invalid response)"
	case steamlang.EResult_UnexpectedError:
		return "UnexpectedError (Steam returned an unexpected error)"
	case steamlang.EResult_NeedCaptcha:
		return "NeedCaptcha (Steam requires CAPTCHA; client logon cannot continue)"
	case steamlang.EResult_AccountLockedDown:
		return "AccountLockedDown (Steam account is locked)"
	case steamlang.EResult_AccountLogonDeniedVerifiedEmailRequired:
		return "AccountLogonDeniedVerifiedEmailRequired (Steam requires email verification)"
	case steamlang.EResult_IPLoginRestrictionFailed:
		return "IPLoginRestrictionFailed (Steam rejected this IP for login)"
	case steamlang.EResult_TimeNotSynced:
		return "TimeNotSynced (Steam Guard time is not synchronized)"
	default:
		return fmt.Sprintf("Unknown Steam EResult(%d)", result)
	}
}

func steamGuardResult(result steamlang.EResult) bool {
	switch result {
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
