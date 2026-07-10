package transport

import (
	"context"
	"crypto/rand"
	"crypto/rsa"
	"crypto/sha1"
	"encoding/base64"
	"encoding/binary"
	"encoding/hex"
	"errors"
	"fmt"
	"math/big"
	"net"
	"sync"
	"time"

	"cs-inv-edit/backend/internal/proto/generated"
	"cs-inv-edit/backend/internal/protocol"
	"github.com/Lucino772/envelop/pkg/steam"
	"github.com/Lucino772/envelop/pkg/steam/steamcm"
	"github.com/Lucino772/envelop/pkg/steam/steamlang"
	"github.com/Lucino772/envelop/pkg/steam/steammsg"
	"github.com/Lucino772/envelop/pkg/steam/steampb"
	"google.golang.org/protobuf/proto"
)

var ErrNotConnected = errors.New("steam gc transport is not connected")

const steamCMHandshakeTimeout = 15 * time.Second
const steamCMLogonTimeout = 8 * time.Second
const steamAuthConfirmationTimeout = 20 * time.Second
const steamEMsgClientHello steamlang.EMsg = 9805
const protoMask uint32 = 0x80000000

var errSteamGuardRequired = errors.New("steam guard required")

type GCEvent struct {
	Type    string
	Payload any
}

type GCConnectionState struct {
	State string
}

type steamCMDiagnostics struct {
	RecordCount int
	Endpoint    string
	Host        string
	Port        uint16
	Type        string
	TCPProbe    string
	Lines       []string
}

type DiagnosticError struct {
	err   error
	lines []string
}

func (e DiagnosticError) Error() string {
	if e.err == nil {
		return "steam diagnostic error"
	}
	return e.err.Error()
}

func (e DiagnosticError) Unwrap() error {
	return e.err
}

func DiagnosticsFromError(err error) []string {
	var diagnosticErr DiagnosticError
	if errors.As(err, &diagnosticErr) {
		return append([]string(nil), diagnosticErr.lines...)
	}
	return nil
}

type diagnosticTrace struct {
	mu    sync.Mutex
	lines []string
}

func newDiagnosticTrace(lines ...string) *diagnosticTrace {
	return &diagnosticTrace{lines: append([]string(nil), lines...)}
}

func (t *diagnosticTrace) Add(line string) {
	t.mu.Lock()
	defer t.mu.Unlock()
	t.lines = append(t.lines, line)
}

func (t *diagnosticTrace) Lines() []string {
	t.mu.Lock()
	defer t.mu.Unlock()
	return append([]string(nil), t.lines...)
}

func (t *diagnosticTrace) Error(err error) DiagnosticError {
	return DiagnosticError{err: err, lines: append(t.Lines(), err.Error())}
}

type LogonCredentials struct {
	Username      string
	Password      string
	AuthCode      string
	TwoFactorCode string
	LoginKey      string
	AccessToken   string
}

type LogonResult struct {
	EResult int32
	SteamID uint64
}

type steamResultError struct {
	method string
	result steamlang.EResult
}

func (e steamResultError) Error() string {
	if e.method == "" {
		return steamResultName(e.result)
	}
	return fmt.Sprintf("%s failed: %s", e.method, steamResultName(e.result))
}

type GCInventoryItem struct {
	ID         uint64
	DefIndex   uint32
	Quantity   uint32
	Quality    uint32
	Rarity     uint32
	Inventory  uint32
	CustomName string
}

type GCClient interface {
	Connect(ctx context.Context) error
	LogOn(ctx context.Context, credentials LogonCredentials) (LogonResult, error)
	Close() error
	SendGamesPlayed(ctx context.Context, appID uint32) error
	SendToGC(ctx context.Context, appID uint32, emsg uint32, body []byte) error
	RequestInventory(ctx context.Context) ([]GCInventoryItem, error)
	Events() <-chan GCEvent
	State() GCConnectionState
}

type TestGCClient struct {
	events chan GCEvent
	state  GCConnectionState
}

func NewTestGCClient() *TestGCClient {
	return &TestGCClient{events: make(chan GCEvent, 16), state: GCConnectionState{State: "test"}}
}

func (m *TestGCClient) Connect(context.Context) error {
	m.state = GCConnectionState{State: "connected"}
	return nil
}

func (m *TestGCClient) LogOn(context.Context, LogonCredentials) (LogonResult, error) {
	m.state = GCConnectionState{State: "logged_on"}
	return LogonResult{EResult: int32(steamlang.EResult_OK)}, nil
}

func (m *TestGCClient) Close() error {
	m.state = GCConnectionState{State: "closed"}
	return nil
}

func (m *TestGCClient) SendGamesPlayed(_ context.Context, _ uint32) error {
	return nil
}

func (m *TestGCClient) SendToGC(_ context.Context, _ uint32, _ uint32, _ []byte) error {
	return nil
}

func (m *TestGCClient) RequestInventory(context.Context) ([]GCInventoryItem, error) {
	return nil, nil
}

func (m *TestGCClient) Events() <-chan GCEvent {
	return m.events
}

func (m *TestGCClient) State() GCConnectionState {
	return m.state
}

func (m *TestGCClient) Emit(event GCEvent) {
	m.events <- event
}

type MockGCClient = TestGCClient

func NewMockGCClient() *MockGCClient {
	return NewTestGCClient()
}

type GCHandler struct {
	events chan<- GCEvent
}

func NewGCHandler(events chan<- GCEvent) *GCHandler {
	return &GCHandler{events: events}
}

func (h *GCHandler) Register(handlers map[steamlang.EMsg]func(*steammsg.Packet) ([]steamcm.Event, error)) {
	handlers[steamlang.EMsg_ClientLogOnResponse] = h.handleClientLogOnResponse
	handlers[steamlang.EMsg_ClientLoggedOff] = h.handleClientLoggedOff
	handlers[steamlang.EMsg_ClientServerUnavailable] = h.handleClientServerUnavailable
	handlers[steamlang.EMsg_ClientFromGC] = h.handleClientFromGC
	handlers[steamlang.EMsg_ClientGCMsgFailed] = h.handleClientGCMsgFailed
}

func (h *GCHandler) handleClientLogOnResponse(packet *steammsg.Packet) ([]steamcm.Event, error) {
	if !packet.IsProto() {
		return nil, nil
	}
	body := new(steampb.CMsgClientLogonResponse)
	if _, err := steammsg.DecodePacket(packet, body); err != nil {
		return nil, err
	}
	if h.events != nil {
		h.events <- GCEvent{Type: "steam.logon_response", Payload: body}
	}
	return []steamcm.Event{steamcm.MakeEvent(steamcm.EventType_Incoming, steamcm.EventPacketReceived{Packet: packet})}, nil
}

func (h *GCHandler) handleClientLoggedOff(packet *steammsg.Packet) ([]steamcm.Event, error) {
	if !packet.IsProto() {
		return nil, nil
	}
	body := new(steampb.CMsgClientLoggedOff)
	if _, err := steammsg.DecodePacket(packet, body); err != nil {
		return nil, err
	}
	if h.events != nil {
		h.events <- GCEvent{Type: "steam.logged_off", Payload: body}
	}
	return []steamcm.Event{steamcm.MakeEvent(steamcm.EventType_Incoming, steamcm.EventPacketReceived{Packet: packet})}, nil
}

func (h *GCHandler) handleClientServerUnavailable(packet *steammsg.Packet) ([]steamcm.Event, error) {
	if h.events != nil {
		h.events <- GCEvent{Type: "steam.server_unavailable", Payload: packet.MsgType().String()}
	}
	return []steamcm.Event{steamcm.MakeEvent(steamcm.EventType_Incoming, steamcm.EventPacketReceived{Packet: packet})}, nil
}

func (h *GCHandler) handleClientFromGC(packet *steammsg.Packet) ([]steamcm.Event, error) {
	if !packet.IsProto() {
		return nil, nil
	}
	body := new(steampb.CMsgGCClient)
	if _, err := steammsg.DecodePacket(packet, body); err != nil {
		return nil, err
	}
	if h.events != nil {
		message := GCMessage{
			AppID:   body.GetAppid(),
			EMsg:    body.GetMsgtype(),
			Body:    append([]byte(nil), body.GetPayload()...),
			SteamID: body.GetSteamid(),
			GCName:  body.GetGcname(),
		}
		if decoded, err := decodeGCProtoPayload(message); err == nil {
			message.EMsg = decoded.EMsg
			message.Body = decoded.Body
		}
		h.events <- GCEvent{
			Type:    "gc.message",
			Payload: message,
		}
	}
	return []steamcm.Event{steamcm.MakeEvent(steamcm.EventType_Incoming, steamcm.EventPacketReceived{Packet: packet})}, nil
}

func (h *GCHandler) handleClientGCMsgFailed(packet *steammsg.Packet) ([]steamcm.Event, error) {
	if h.events != nil {
		h.events <- GCEvent{Type: "gc.failed", Payload: packet.MsgType()}
	}
	return []steamcm.Event{steamcm.MakeEvent(steamcm.EventType_Incoming, steamcm.EventPacketReceived{Packet: packet})}, nil
}

type GCMessage struct {
	AppID   uint32
	EMsg    uint32
	Body    []byte
	SteamID uint64
	GCName  string
}

type gcProtoMessage struct {
	EMsg uint32
	Body []byte
}

type SteamGCClient struct {
	mu     sync.Mutex
	conn   *steamcm.SteamConnection
	events chan GCEvent
	state  GCConnectionState
}

func NewSteamGCClient() *SteamGCClient {
	return &SteamGCClient{
		events: make(chan GCEvent, 64),
		state:  GCConnectionState{State: "disconnected"},
	}
}

func (s *SteamGCClient) Connect(ctx context.Context) error {
	s.mu.Lock()
	if s.conn != nil {
		s.mu.Unlock()
		return nil
	}
	s.state = GCConnectionState{State: "connecting"}
	s.mu.Unlock()

	diagnostics, err := diagnoseSteamCM()
	if err != nil {
		s.setState("error")
		return err
	}

	events := s.events
	unified := steamcm.NewSteamUnifiedMessageHandler()
	var conn *steamcm.SteamConnection
	if diagnostics.Type == "websockets" {
		conn = steamcm.NewSteamWebSocketConnection(
			steamcm.NewSteamBaseHandler(),
			unified,
			NewGCHandler(events),
		)
	} else {
		conn = steamcm.NewSteamConnection(
			steamcm.NewSteamBaseHandler(),
			unified,
			NewGCHandler(events),
		)
	}
	s.mu.Lock()
	s.conn = conn
	s.mu.Unlock()

	errCh := make(chan error, 1)
	go func() {
		errCh <- connectSteamCM(conn, diagnostics)
	}()

	select {
	case <-ctx.Done():
		s.setState("error")
		s.clearConn(conn)
		return fmt.Errorf("steam cm connect cancelled before transport startup: %w", ctx.Err())
	case err := <-errCh:
		if err != nil {
			s.setState("error")
			s.clearConn(conn)
			wrapped := fmt.Errorf("steam cm connect failed (%s): %w", diagnostics.String(), err)
			return DiagnosticError{err: wrapped, lines: append(diagnostics.Lines, wrapped.Error())}
		}
	case <-time.After(250 * time.Millisecond):
	}

	if diagnostics.Type != "websockets" {
		waitCtx, cancel := context.WithTimeout(ctx, steamCMHandshakeTimeout)
		defer cancel()
		handshakeLines := append([]string(nil), diagnostics.Lines...)
		handshakeLines = append(handshakeLines, fmt.Sprintf("steam cm encrypted handshake wait started timeout=%s", steamCMHandshakeTimeout))
		ready := make(chan error, 1)
		go func() {
			ready <- conn.WaitReady(steamCMHandshakeTimeout)
		}()
		select {
		case <-waitCtx.Done():
			s.setState("error")
			s.clearConn(conn)
			wrapped := fmt.Errorf("steam cm encrypted handshake timed out after %s (%s); TCP opened but ChannelEncryptResult was not received", steamCMHandshakeTimeout, diagnostics.String())
			return DiagnosticError{err: wrapped, lines: append(handshakeLines, wrapped.Error())}
		case err := <-ready:
			if err != nil {
				s.setState("error")
				s.clearConn(conn)
				if errors.Is(err, context.DeadlineExceeded) {
					wrapped := fmt.Errorf("steam cm encrypted handshake timed out after %s (%s); TCP opened but ChannelEncryptResult was not received", steamCMHandshakeTimeout, diagnostics.String())
					return DiagnosticError{err: wrapped, lines: append(handshakeLines, wrapped.Error())}
				}
				wrapped := fmt.Errorf("steam cm encrypted handshake failed (%s): %w", diagnostics.String(), err)
				return DiagnosticError{err: wrapped, lines: append(handshakeLines, wrapped.Error())}
			}
		}
	} else {
		diagnostics.Lines = append(diagnostics.Lines, "steam cm websocket connected; raw encrypted handshake is not used")
	}
	s.setState("connected")
	s.events <- GCEvent{Type: "gc.connected", Payload: "steam cm encrypted channel ready"}
	return nil
}

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
	unified := steamcm.NewSteamUnifiedMessageHandler()
	trace := newDiagnosticTrace("steam auth client auth flow started")
	if err := conn.SendPacket(mustClientHelloPacket()); err != nil {
		wrapped := fmt.Errorf("steam client hello send failed: %w", err)
		return "", trace.Error(wrapped)
	}
	s.events <- GCEvent{Type: "steam.client_hello.sent", Payload: credentials.Username}
	trace.Add("steam auth sent ClientHello")

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
	pollTimeout := steamCMLogonTimeout
	if credentials.AuthCode == "" && credentials.TwoFactorCode == "" && hasMobileConfirmation(allowedConfirmations) {
		pollTimeout = steamAuthConfirmationTimeout
		trace.Add(fmt.Sprintf("steam auth waiting for mobile approval timeout=%s", pollTimeout))
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
			if credentials.AuthCode == "" && credentials.TwoFactorCode == "" && len(allowedConfirmations) > 0 {
				trace.Add("steam auth approval polling timed out before refresh token")
				return "", DiagnosticError{err: errSteamGuardRequired, lines: trace.Lines()}
			}
			return "", fmt.Errorf("steam auth polling timed out waiting for refresh token")
		case <-tick.C:
			pollResp := new(steampb.CAuthentication_PollAuthSessionStatus_Response)
			err := sendNonAuthedUnified(ctx, unified, conn, "Authentication.PollAuthSessionStatus#1", &steampb.CAuthentication_PollAuthSessionStatus_Request{
				ClientId:  proto.Uint64(beginResp.GetClientId()),
				RequestId: append([]byte(nil), beginResp.GetRequestId()...),
			}, pollResp, trace)
			if err != nil {
				wrapped := fmt.Errorf("steam auth poll failed: %w", err)
				return "", trace.Error(wrapped)
			}
			if pollResp.GetRefreshToken() != "" {
				trace.Add("steam auth poll returned refresh token")
				return pollResp.GetRefreshToken(), nil
			}
			tick.Reset(pollInterval)
		}
	}
}

func sendNonAuthedUnified(ctx context.Context, unified *steamcm.SteamUnifiedMessageHandler, conn *steamcm.SteamConnection, name string, in proto.Message, out proto.Message, trace *diagnosticTrace) error {
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

func sendNonAuthedUnifiedWithRetry(ctx context.Context, unified *steamcm.SteamUnifiedMessageHandler, conn *steamcm.SteamConnection, name string, in proto.Message, out proto.Message, trace *diagnosticTrace, attempts int) error {
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

func (s *SteamGCClient) Close() error {
	s.mu.Lock()
	defer s.mu.Unlock()
	if s.conn != nil {
		_ = s.conn.Close()
	}
	s.conn = nil
	s.state = GCConnectionState{State: "closed"}
	return nil
}

func (s *SteamGCClient) clearConn(conn *steamcm.SteamConnection) {
	s.mu.Lock()
	defer s.mu.Unlock()
	if s.conn == conn {
		s.conn = nil
	}
}

func (s *SteamGCClient) closeAndClearConn(conn *steamcm.SteamConnection) {
	if conn != nil {
		_ = conn.Close()
	}
	s.clearConn(conn)
}

func connectSteamCM(conn *steamcm.SteamConnection, diagnostics steamCMDiagnostics) (err error) {
	defer func() {
		if recovered := recover(); recovered != nil {
			err = fmt.Errorf("steam cm connection failed inside transport library")
		}
	}()
	if diagnostics.Host == "" || diagnostics.Port == 0 {
		return fmt.Errorf("steam cm selected endpoint is missing")
	}
	if diagnostics.Type == "websockets" {
		return conn.ConnectWebSocketTo(diagnostics.Host, diagnostics.Port)
	}
	return conn.ConnectTo(diagnostics.Host, diagnostics.Port)
}

func diagnoseSteamCM() (steamCMDiagnostics, error) {
	lines := []string{"steam cm directory lookup started"}
	servers := steamcm.NewServers()
	if err := servers.Update(); err != nil {
		wrapped := fmt.Errorf("steam cm directory lookup failed: %w", err)
		return steamCMDiagnostics{Lines: lines}, DiagnosticError{err: wrapped, lines: append(lines, wrapped.Error())}
	}
	records := servers.Records()
	lines = append(lines, fmt.Sprintf("steam cm directory returned %d candidate records", len(records)))
	if len(records) == 0 {
		wrapped := fmt.Errorf("steam cm directory returned no connectable servers")
		return steamCMDiagnostics{RecordCount: len(records), TCPProbe: "not_run", Lines: lines}, DiagnosticError{err: wrapped, lines: append(lines, wrapped.Error())}
	}

	var lastErr error
	for idx, candidate := range records {
		if candidate == nil || candidate.Host == "" || candidate.Port == 0 {
			lines = append(lines, fmt.Sprintf("steam cm candidate %d skipped: missing host or port", idx+1))
			continue
		}
		endpoint := net.JoinHostPort(candidate.Host, fmt.Sprintf("%d", candidate.Port))
		protocol := candidate.Type
		if protocol == "" {
			protocol = "tcp"
		}
		lines = append(lines, fmt.Sprintf("steam cm probe started candidate=%d/%d endpoint=%s type=%s timeout=5s", idx+1, len(records), endpoint, protocol))
		probeAddr := endpoint
		probeNetwork := "tcp"
		probeTimeout := 5 * time.Second
		probe, err := net.DialTimeout(probeNetwork, probeAddr, probeTimeout)
		if err != nil {
			lastErr = err
			lines = append(lines, fmt.Sprintf("steam cm probe failed candidate=%d/%d endpoint=%s type=%s: %v", idx+1, len(records), endpoint, protocol, err))
			continue
		}
		_ = probe.Close()
		lines = append(lines, fmt.Sprintf("steam cm probe ok candidate=%d/%d endpoint=%s type=%s", idx+1, len(records), endpoint, protocol))
		lines = append(lines, fmt.Sprintf("steam cm selected endpoint %s type=%s", endpoint, protocol))
		return steamCMDiagnostics{
			RecordCount: len(records),
			Endpoint:    endpoint,
			Host:        candidate.Host,
			Port:        candidate.Port,
			Type:        candidate.Type,
			TCPProbe:    "ok",
			Lines:       lines,
		}, nil
	}

	diagnostics := steamCMDiagnostics{RecordCount: len(records), TCPProbe: "failed", Lines: lines}
	wrapped := fmt.Errorf("steam cm tcp probe failed for all %d candidate records", len(records))
	if lastErr != nil {
		wrapped = fmt.Errorf("%w: last error: %v", wrapped, lastErr)
	}
	return diagnostics, DiagnosticError{err: wrapped, lines: append(lines, wrapped.Error())}
}

func (d steamCMDiagnostics) String() string {
	endpoint := d.Endpoint
	if endpoint == "" {
		endpoint = "none"
	}
	probe := d.TCPProbe
	if probe == "" {
		probe = "unknown"
	}
	return fmt.Sprintf("directory_records=%d selected=%s tcp_probe=%s", d.RecordCount, endpoint, probe)
}

func (s *SteamGCClient) SendGamesPlayed(_ context.Context, appID uint32) error {
	s.mu.Lock()
	conn := s.conn
	s.mu.Unlock()
	if conn == nil {
		return ErrNotConnected
	}
	packet, err := encodeGamesPlayedPacket(appID)
	if err != nil {
		return err
	}
	if err := conn.SendPacket(packet); err != nil {
		return err
	}
	s.events <- GCEvent{Type: "steam.games_played.sent", Payload: fmt.Sprintf("emsg=%s appid=%d gameid=%d", steamlang.EMsg_ClientGamesPlayed.String(), appID, steamAppGameID(appID))}
	return nil
}

func (s *SteamGCClient) SendToGC(_ context.Context, appID uint32, emsg uint32, body []byte) error {
	return s.sendToGC(appID, emsg, body, false)
}

func (s *SteamGCClient) sendProtoToGC(_ context.Context, appID uint32, emsg uint32, body []byte) error {
	return s.sendToGC(appID, emsg, body, true)
}

func (s *SteamGCClient) sendToGC(appID uint32, emsg uint32, body []byte, protobufPayload bool) error {
	s.mu.Lock()
	conn := s.conn
	s.mu.Unlock()
	if conn == nil {
		return ErrNotConnected
	}
	packet, err := encodeGCClientPacket(appID, emsg, body, protobufPayload)
	if err != nil {
		return err
	}
	if err := conn.SendPacket(packet); err != nil {
		return err
	}
	diagnosticEMsg := emsg
	if protobufPayload {
		diagnosticEMsg = emsg | protoMask
	}
	s.events <- GCEvent{Type: "gc.sent", Payload: GCMessage{AppID: appID, EMsg: diagnosticEMsg, Body: append([]byte(nil), packetBodyForDiagnostics(emsg, body, protobufPayload)...)}}
	return nil
}

func packetBodyForDiagnostics(emsg uint32, body []byte, protobufPayload bool) []byte {
	if !protobufPayload {
		return body
	}
	payload, err := encodeGCProtoPayload(emsg, body)
	if err != nil {
		return body
	}
	return payload
}

func (s *SteamGCClient) RequestInventory(ctx context.Context) ([]GCInventoryItem, error) {
	trace := newDiagnosticTrace("cs2 gc inventory request started")
	if err := s.SendGamesPlayed(ctx, protocol.AppIDCS2); err != nil {
		wrapped := fmt.Errorf("cs2 games played presence failed: %w", err)
		return nil, trace.Error(wrapped)
	}
	trace.Add("cs2 games played presence sent")
	body, err := proto.Marshal(&cs2pb.CMsgClientHello{
		Version:           proto.Uint32(2000244),
		ClientSessionNeed: proto.Uint32(0),
		ClientLauncher:    proto.Uint32(0),
		SteamLauncher:     proto.Uint32(0),
	})
	if err != nil {
		return nil, err
	}
	helloEMsg := uint32(protocol.EMsgGCClientHello)
	if err := s.sendProtoToGC(ctx, protocol.AppIDCS2, helloEMsg, body); err != nil {
		wrapped := fmt.Errorf("cs2 gc client hello send failed: %w", err)
		return nil, trace.Error(wrapped)
	}
	trace.Add(fmt.Sprintf("cs2 gc ClientHello sent emsg=%d", helloEMsg))
	helloRetry := time.NewTimer(time.Second)
	defer helloRetry.Stop()
	helloRetryDelay := time.Second
	statusNoSessionCount := 0
	for {
		select {
		case <-ctx.Done():
			wrapped := fmt.Errorf("cs2 gc inventory timed out waiting for ClientWelcome: %w", ctx.Err())
			return nil, trace.Error(wrapped)
		case <-helloRetry.C:
			if err := s.sendProtoToGC(ctx, protocol.AppIDCS2, helloEMsg, body); err != nil {
				wrapped := fmt.Errorf("cs2 gc client hello retry failed: %w", err)
				return nil, trace.Error(wrapped)
			}
			trace.Add(fmt.Sprintf("cs2 gc ClientHello retry sent emsg=%d delay=%s", helloEMsg, helloRetryDelay))
			helloRetryDelay *= 2
			if helloRetryDelay > 8*time.Second {
				helloRetryDelay = 8 * time.Second
			}
			helloRetry.Reset(helloRetryDelay)
		case event := <-s.events:
			trace.Add(fmt.Sprintf("cs2 gc observed event type=%s", event.Type))
			if event.Type == "steam.games_played.sent" || event.Type == "gc.sent" {
				trace.Add(fmt.Sprintf("cs2 gc observed event payload=%v", event.Payload))
			}
			message, ok := event.Payload.(GCMessage)
			if !ok || event.Type != "gc.message" {
				continue
			}
			trace.Add(fmt.Sprintf("cs2 gc observed appid=%d emsg=%d body_bytes=%d", message.AppID, message.EMsg, len(message.Body)))
			if message.AppID != protocol.AppIDCS2 {
				continue
			}
			if message.EMsg == protocol.EMsgGCCStrike15V2ClientLogonFatalError {
				return nil, trace.Error(decodeCS2ClientLogonFatalError(message.Body))
			}
			if message.EMsg == protocol.EMsgGCClientConnectionStatus {
				status, err := decodeCS2ConnectionStatus(message.Body)
				if err != nil {
					return nil, trace.Error(err)
				}
				trace.Add("cs2 gc connection status " + status)
				if isCS2ConnectionStatusNoSession(message.Body) {
					statusNoSessionCount++
					nextHello := nextCS2HelloEMsg(helloEMsg)
					if nextHello != helloEMsg {
						helloEMsg = nextHello
						helloRetryDelay = time.Second
						trace.Add(fmt.Sprintf("cs2 gc switching ClientHello variant after NO_SESSION next_emsg=%d", helloEMsg))
						if err := s.sendProtoToGC(ctx, protocol.AppIDCS2, helloEMsg, body); err != nil {
							wrapped := fmt.Errorf("cs2 gc client hello variant send failed: %w", err)
							return nil, trace.Error(wrapped)
						}
						trace.Add(fmt.Sprintf("cs2 gc ClientHello variant sent emsg=%d", helloEMsg))
						resetTimer(helloRetry, helloRetryDelay)
						continue
					}
					if statusNoSessionCount >= 2 {
						return nil, trace.Error(fmt.Errorf("CS2 GC refused session: %s", status))
					}
				}
				continue
			}
			if message.EMsg == protocol.EMsgGCClientWelcome {
				items, err := decodeInventoryFromClientWelcome(message.Body)
				if err != nil {
					return nil, trace.Error(err)
				}
				trace.Add(fmt.Sprintf("cs2 gc ClientWelcome decoded inventory_items=%d", len(items)))
				return items, nil
			}
		}
	}
}

func decodeCS2ClientLogonFatalError(body []byte) error {
	var fatal cs2pb.CMsgGCCStrike15V2ClientLogonFatalError
	if err := proto.Unmarshal(body, &fatal); err != nil {
		return fmt.Errorf("CS2 GC ClientLogonFatalError emsg=%d body_bytes=%d decode failed: %w", protocol.EMsgGCCStrike15V2ClientLogonFatalError, len(body), err)
	}
	message := fatal.GetMessage()
	if message == "" {
		message = fmt.Sprintf("errorcode=%d", fatal.GetErrorcode())
	}
	if fatal.GetCountry() != "" {
		return fmt.Errorf("CS2 GC ClientLogonFatalError: %s country=%s", message, fatal.GetCountry())
	}
	return fmt.Errorf("CS2 GC ClientLogonFatalError: %s", message)
}

func decodeCS2ConnectionStatus(body []byte) (string, error) {
	var status cs2pb.CMsgConnectionStatus
	if err := proto.Unmarshal(body, &status); err != nil {
		return "", fmt.Errorf("CS2 GC ConnectionStatus emsg=%d body_bytes=%d decode failed: %w", protocol.EMsgGCClientConnectionStatus, len(body), err)
	}
	return fmt.Sprintf(
		"status=%s client_session_need=%d queue_position=%d queue_size=%d wait_seconds=%d estimated_wait_seconds_remaining=%d",
		status.GetStatus().String(),
		status.GetClientSessionNeed(),
		status.GetQueuePosition(),
		status.GetQueueSize(),
		status.GetWaitSeconds(),
		status.GetEstimatedWaitSecondsRemaining(),
	), nil
}

func isCS2ConnectionStatusNoSession(body []byte) bool {
	var status cs2pb.CMsgConnectionStatus
	if err := proto.Unmarshal(body, &status); err != nil {
		return false
	}
	return status.GetStatus() == cs2pb.GCConnectionStatus_GCConnectionStatus_NO_SESSION
}

func nextCS2HelloEMsg(current uint32) uint32 {
	switch current {
	case protocol.EMsgGCClientHello:
		return protocol.EMsgGCClientHelloR2
	case protocol.EMsgGCClientHelloR2:
		return protocol.EMsgGCClientHelloR3
	case protocol.EMsgGCClientHelloR3:
		return protocol.EMsgGCClientHelloR4
	default:
		return current
	}
}

func resetTimer(timer *time.Timer, delay time.Duration) {
	if !timer.Stop() {
		select {
		case <-timer.C:
		default:
		}
	}
	timer.Reset(delay)
}

func encodeGCClientPacket(appID uint32, emsg uint32, body []byte, protobufPayload bool) (*steammsg.Packet, error) {
	if appID == 0 {
		return nil, fmt.Errorf("app id is required")
	}
	if emsg == 0 {
		return nil, fmt.Errorf("gc emsg is required")
	}
	payload := append([]byte(nil), body...)
	if protobufPayload {
		var err error
		payload, err = encodeGCProtoPayload(emsg, body)
		if err != nil {
			return nil, err
		}
	}
	header := steammsg.NewProtoHeader(steamlang.EMsg_ClientToGC)
	header.Proto.RoutingAppid = proto.Uint32(appID)
	msgType := emsg
	if protobufPayload {
		msgType = emsg | protoMask
	}
	msg := &steampb.CMsgGCClient{
		Appid:   proto.Uint32(appID),
		Msgtype: proto.Uint32(msgType),
		Payload: payload,
	}
	return steammsg.EncodePacket(header, msg, nil)
}

func encodeGCProtoPayload(emsg uint32, body []byte) ([]byte, error) {
	headerBytes, err := proto.Marshal(&steampb.CMsgProtoBufHeader{
		JobidSource: proto.Uint64(^uint64(0)),
	})
	if err != nil {
		return nil, err
	}
	payload := make([]byte, 8, 8+len(headerBytes)+len(body))
	binary.LittleEndian.PutUint32(payload[0:4], emsg|protoMask)
	binary.LittleEndian.PutUint32(payload[4:8], uint32(len(headerBytes)))
	payload = append(payload, headerBytes...)
	payload = append(payload, body...)
	return payload, nil
}

func decodeGCProtoPayload(message GCMessage) (gcProtoMessage, error) {
	if message.EMsg&protoMask == 0 {
		return gcProtoMessage{EMsg: message.EMsg, Body: append([]byte(nil), message.Body...)}, nil
	}
	emsg := message.EMsg &^ protoMask
	if len(message.Body) < 8 {
		return gcProtoMessage{EMsg: emsg, Body: append([]byte(nil), message.Body...)}, nil
	}
	innerMsg := binary.LittleEndian.Uint32(message.Body[0:4])
	headerLen := int(binary.LittleEndian.Uint32(message.Body[4:8]))
	if innerMsg != message.EMsg && innerMsg != emsg {
		return gcProtoMessage{EMsg: emsg, Body: append([]byte(nil), message.Body...)}, nil
	}
	if headerLen < 0 || 8+headerLen > len(message.Body) {
		return gcProtoMessage{}, fmt.Errorf("protobuf GC payload for appid=%d emsg=%d has invalid header length %d for %d bytes", message.AppID, message.EMsg, headerLen, len(message.Body))
	}
	var header steampb.CMsgProtoBufHeader
	if err := proto.Unmarshal(message.Body[8:8+headerLen], &header); err != nil {
		return gcProtoMessage{}, fmt.Errorf("failed to decode GC protobuf header for appid=%d emsg=%d: %w", message.AppID, message.EMsg, err)
	}
	return gcProtoMessage{EMsg: emsg, Body: append([]byte(nil), message.Body[8+headerLen:]...)}, nil
}

func decodeInventoryFromClientWelcome(body []byte) ([]GCInventoryItem, error) {
	var welcome cs2pb.CMsgClientWelcome
	if err := proto.Unmarshal(body, &welcome); err != nil {
		return nil, fmt.Errorf("failed to decode CS2 ClientWelcome: %w", err)
	}
	items := make([]GCInventoryItem, 0)
	var decodeErrors int
	for _, cache := range welcome.GetOutofdateSubscribedCaches() {
		for _, objectType := range cache.GetObjects() {
			for _, objectData := range objectType.GetObjectData() {
				var econ cs2pb.CSOEconItem
				if err := proto.Unmarshal(objectData, &econ); err != nil {
					decodeErrors++
					continue
				}
				if econ.GetId() == 0 {
					continue
				}
				items = append(items, GCInventoryItem{
					ID:         econ.GetId(),
					DefIndex:   econ.GetDefIndex(),
					Quantity:   econ.GetQuantity(),
					Quality:    econ.GetQuality(),
					Rarity:     econ.GetRarity(),
					Inventory:  econ.GetInventory(),
					CustomName: econ.GetCustomName(),
				})
			}
		}
	}
	if len(items) == 0 && decodeErrors > 0 {
		return nil, fmt.Errorf("failed to decode CS2 econ items from SOCache: %d object decode errors", decodeErrors)
	}
	if len(items) == 0 {
		return nil, fmt.Errorf("CS2 ClientWelcome contained no decoded econ inventory items")
	}
	return items, nil
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

func encodeGamesPlayedPacket(appID uint32) (*steammsg.Packet, error) {
	if appID == 0 {
		return nil, fmt.Errorf("app id is required")
	}
	header := steammsg.NewProtoHeader(steamlang.EMsg_ClientGamesPlayed)
	msg := &steampb.CMsgClientGamesPlayed{
		GamesPlayed: []*steampb.CMsgClientGamesPlayed_GamePlayed{
			{
				GameId:        proto.Uint64(steamAppGameID(appID)),
				GameExtraInfo: proto.String("Counter-Strike 2"),
			},
		},
	}
	return steammsg.EncodePacket(header, msg, nil)
}

func steamAppGameID(appID uint32) uint64 {
	gameID := steam.GameId(0)
	gameID.SetAppId(appID)
	gameID.SetAppType(steam.GameType_App)
	return uint64(gameID)
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

func (s *SteamGCClient) Events() <-chan GCEvent {
	return s.events
}

func (s *SteamGCClient) State() GCConnectionState {
	s.mu.Lock()
	defer s.mu.Unlock()
	return s.state
}

func (s *SteamGCClient) setState(state string) {
	s.mu.Lock()
	s.state = GCConnectionState{State: state}
	s.mu.Unlock()
}
