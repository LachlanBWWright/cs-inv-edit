package transport

import (
	"context"
	"errors"
	"fmt"
	"sync"
	"time"

	"github.com/Lucino772/envelop/pkg/steam/steamlang"
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

type QRAuthSession struct {
	ClientID     uint64
	RequestID    []byte
	ChallengeURL string
	PollInterval time.Duration
}

type QRAuthResult struct {
	AccountName string
	AccessToken string
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
	ID             uint64
	OriginalID     uint64
	DefIndex       uint32
	Quantity       uint32
	Quality        uint32
	Rarity         uint32
	Inventory      uint32
	CustomName     string
	PaintKit       uint32
	PaintWear      *float64
	Attributes     map[uint32]uint32
	AttributeBytes map[uint32][]byte
	EquippedStates []GCEquippedState
	InteriorItemID uint64
	Level          uint32
	Flags          uint32
	Origin         uint32
	Style          uint32
	CustomDesc     string
}

type GCEquippedState struct {
	Class uint32
	Slot  uint32
}

type GCArmoryOffer struct {
	CampaignID     uint32
	RedeemID       uint32
	ExpectedCost   uint32
	GenerationTime uint32
}

type GCArmorySnapshot struct {
	GenerationTime uint32
	Balance        uint32
	ItemIDs        []uint64
	Offers         []GCArmoryOffer
	Diagnostics    []string
	XpShopTypeID   int32
}

type GCClient interface {
	Connect(ctx context.Context) error
	LogOn(ctx context.Context, credentials LogonCredentials) (LogonResult, error)
	BeginQRAuth(ctx context.Context) (QRAuthSession, error)
	CompleteQRAuth(ctx context.Context, session QRAuthSession) (QRAuthResult, error)
	Close() error
	SendGamesPlayed(ctx context.Context, appID uint32) error
	SetGamesPlayed(ctx context.Context, appIDs []uint32) error
	SendToGC(ctx context.Context, appID uint32, emsg uint32, body []byte) error
	SendProtoToGC(ctx context.Context, appID uint32, emsg uint32, body []byte) error
	RequestInventory(ctx context.Context) ([]GCInventoryItem, error)
	RequestGameInventory(ctx context.Context, appID uint32) ([]GCInventoryItem, error)
	RequestArmory(ctx context.Context) (GCArmorySnapshot, error)
	Events() <-chan GCEvent
	State() GCConnectionState
}

type TestGCClient struct {
	events            chan GCEvent
	state             GCConnectionState
	SentProtoMessages []GCMessage
	GameInventoryErr  error
	GameInventoryFunc func(context.Context, uint32) ([]GCInventoryItem, error)
	GamesPlayedCalls  [][]uint32
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

func (m *TestGCClient) BeginQRAuth(context.Context) (QRAuthSession, error) {
	return QRAuthSession{}, nil
}

func (m *TestGCClient) CompleteQRAuth(context.Context, QRAuthSession) (QRAuthResult, error) {
	return QRAuthResult{}, nil
}

func (m *TestGCClient) Close() error {
	m.state = GCConnectionState{State: "closed"}
	return nil
}

func (m *TestGCClient) SendGamesPlayed(_ context.Context, _ uint32) error {
	return nil
}

func (m *TestGCClient) SetGamesPlayed(_ context.Context, appIDs []uint32) error {
	m.GamesPlayedCalls = append(m.GamesPlayedCalls, append([]uint32(nil), appIDs...))
	return nil
}

func (m *TestGCClient) SendToGC(_ context.Context, _ uint32, _ uint32, _ []byte) error {
	return nil
}

func (m *TestGCClient) SendProtoToGC(_ context.Context, appID uint32, emsg uint32, body []byte) error {
	m.SentProtoMessages = append(m.SentProtoMessages, GCMessage{AppID: appID, EMsg: emsg, Body: append([]byte(nil), body...)})
	return nil
}

func (m *TestGCClient) RequestInventory(context.Context) ([]GCInventoryItem, error) {
	return nil, nil
}

func (m *TestGCClient) RequestGameInventory(ctx context.Context, appID uint32) ([]GCInventoryItem, error) {
	if m.GameInventoryFunc != nil {
		return m.GameInventoryFunc(ctx, appID)
	}
	return nil, m.GameInventoryErr
}

func (m *TestGCClient) RequestArmory(context.Context) (GCArmorySnapshot, error) {
	return GCArmorySnapshot{}, nil
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
