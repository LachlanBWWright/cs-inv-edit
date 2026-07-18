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

type ProtocolTraceEntry struct {
	ID          uint64 `json:"id"`
	Timestamp   string `json:"timestamp"`
	Direction   string `json:"direction"`
	Layer       string `json:"layer"`
	AppID       uint32 `json:"appId,omitempty"`
	EMsg        uint32 `json:"emsg"`
	Name        string `json:"name"`
	Protobuf    bool   `json:"protobuf"`
	BodyBytes   int    `json:"bodyBytes"`
	BodyHex     string `json:"bodyHex"`
	Decoded     any    `json:"decoded,omitempty"`
	DecodeError string `json:"decodeError,omitempty"`
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
	Username       string
	Password       string
	AuthCode       string
	TwoFactorCode  string
	LoginKey       string
	AccessToken    string
	WebAccessToken string
}

type LogonResult struct {
	EResult        int32
	SteamID        uint64
	WebAccessToken string
}

type QRAuthSession struct {
	ClientID     uint64
	RequestID    []byte
	ChallengeURL string
	PollInterval time.Duration
}

type QRAuthResult struct {
	AccountName  string
	AccessToken  string
	RefreshToken string
}

type steamResultError struct {
	method string
	result steamlang.EResult
}

type StorePurchaseRejectedError struct {
	Result int32
}

func (e StorePurchaseRejectedError) Code() string {
	return storePurchaseResult(e.Result).code
}

func (e StorePurchaseRejectedError) Error() string {
	result := storePurchaseResult(e.Result)
	return fmt.Sprintf("GC rejected store purchase: %s (%s) (GC purchase result %d)", result.code, result.description, e.Result)
}

type storePurchaseResultInfo struct {
	code        string
	description string
}

func storePurchaseResult(result int32) storePurchaseResultInfo {
	results := map[int32]storePurchaseResultInfo{
		1:   {"OK", "purchase initialization accepted"},
		2:   {"Fail", "generic CS2 store purchase initialization failure"},
		3:   {"InvalidParam", "the GC rejected one or more purchase parameters"},
		4:   {"InternalError", "the CS2 store encountered an internal error"},
		5:   {"NotApproved", "the purchase was not approved"},
		6:   {"AlreadyCommitted", "the purchase transaction was already committed"},
		7:   {"UserNotLoggedIn", "the Steam user is not logged in"},
		8:   {"WrongCurrency", "the requested currency does not match the account store currency"},
		9:   {"AccountError", "the Steam account cannot initialize this purchase"},
		10:  {"InvalidItem", "the requested store item is invalid"},
		11:  {"NotEnoughBackpackSpace", "there is insufficient inventory space"},
		12:  {"LimitedQuantityItemsUnavailable", "the requested limited-quantity items are unavailable"},
		100: {"InsufficientFunds", "the Steam wallet has insufficient funds"},
		101: {"TimedOut", "the store transaction timed out"},
		102: {"AcctDisabled", "purchases are disabled for this account"},
		103: {"AcctCannotPurchase", "this account cannot make the requested purchase"},
		104: {"Fraud", "Steam rejected the transaction for account-security reasons"},
		150: {"OldPriceSheet", "the CS2 store price sheet is stale"},
		151: {"TxnNotFound", "the store transaction was not found"},
	}
	if known, ok := results[result]; ok {
		return known
	}
	return storePurchaseResultInfo{fmt.Sprintf("UnknownPurchaseResult%d", result), "unknown CS2 store purchase result"}
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
type GCStoreData struct {
	Result            int32
	Currency          int32
	Country           string
	PriceSheetVersion uint32
	PriceSheet        []byte
}
type StorePurchaseRequest struct {
	Country          string
	Language         int32
	Currency         int32
	ItemDefID        uint32
	Quantity         uint32
	Cost             uint64
	PurchaseType     uint32
	SupplementalData uint64
}
type StorePurchaseTransportResult struct {
	TransactionID uint64
	OrderID       uint64
	CheckoutURL   string
	ItemIDs       []uint64
	Authorization map[string]any
	Diagnostics   []string
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
	RequestStore(ctx context.Context, version uint32, currency int32) (GCStoreData, error)
	InitializeStorePurchase(ctx context.Context, request StorePurchaseRequest) (StorePurchaseTransportResult, error)
	SetProtocolTracing(enabled bool)
	ProtocolTrace(after uint64) []ProtocolTraceEntry
	Events() <-chan GCEvent
	State() GCConnectionState
}

type TestGCClient struct {
	events              chan GCEvent
	state               GCConnectionState
	SentProtoMessages   []GCMessage
	GameInventoryErr    error
	GameInventoryFunc   func(context.Context, uint32) ([]GCInventoryItem, error)
	InventoryFunc       func(context.Context) ([]GCInventoryItem, error)
	GamesPlayedCalls    [][]uint32
	StorePurchaseCalls  []StorePurchaseRequest
	StorePurchaseResult StorePurchaseTransportResult
	StorePurchaseErr    error
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

func (m *TestGCClient) RequestInventory(ctx context.Context) ([]GCInventoryItem, error) {
	if m.InventoryFunc != nil {
		return m.InventoryFunc(ctx)
	}
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
func (m *TestGCClient) RequestStore(context.Context, uint32, int32) (GCStoreData, error) {
	return GCStoreData{}, nil
}
func (m *TestGCClient) InitializeStorePurchase(_ context.Context, request StorePurchaseRequest) (StorePurchaseTransportResult, error) {
	m.StorePurchaseCalls = append(m.StorePurchaseCalls, request)
	return m.StorePurchaseResult, m.StorePurchaseErr
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
