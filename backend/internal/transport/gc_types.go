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

// SteamSessionConflictError means Steam ended or rejected this CM session
// because the account is active in another Steam/CS2 client. Callers should
// wait for that client to exit, then explicitly retry instead of continuously
// reconnecting and displacing sessions.
type SteamSessionConflictError struct {
	Result int32
}

func (e SteamSessionConflictError) Error() string {
	return fmt.Sprintf("Steam ended this session because the account is active elsewhere (EResult %d); close CS2 or sign out of Steam on the other device, then retry", e.Result)
}

func IsSteamSessionConflict(err error) bool {
	var conflict SteamSessionConflictError
	return errors.As(err, &conflict)
}

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
	RefreshToken   string
	WebAccessToken string
}

type QRAuthSession struct {
	ClientID       uint64
	RequestID      []byte
	ChallengeURL   string
	PollInterval   time.Duration
	OnChallengeURL func(string)
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
		2:   {"Fail", "generic store purchase initialization failure"},
		3:   {"InvalidParam", "the GC rejected one or more purchase parameters"},
		4:   {"InternalError", "the game store encountered an internal error"},
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
		150: {"OldPriceSheet", "the game store price sheet is stale"},
		151: {"TxnNotFound", "the store transaction was not found"},
		// Current CS2 uses this terminal-specific extension beyond the legacy
		// public econ_store.h enum. The shipped terminal UI handles it as
		// StoreCheckout_PurchaseExpiredItemsUnavailable.
		200: {"PurchaseExpiredItemsUnavailable", "the terminal purchase expired or its current item is no longer available for sale"},
	}
	if known, ok := results[result]; ok {
		return known
	}
	return storePurchaseResultInfo{fmt.Sprintf("UnknownPurchaseResult%d", result), "unknown game store purchase result"}
}

func (e steamResultError) Error() string {
	if e.method == "" {
		return steamResultName(e.result)
	}
	return fmt.Sprintf("%s failed: %s", e.method, steamResultName(e.result))
}

type TestGCClient struct {
	events                    chan GCEvent
	state                     GCConnectionState
	SentProtoMessages         []GCMessage
	SendProtoFunc             func(context.Context, uint32, uint32, []byte) error
	GameInventoryErr          error
	GameInventoryFunc         func(context.Context, uint32) ([]GCInventoryItem, error)
	SteamInventoryServiceFunc func(context.Context, uint32, uint64) (SteamInventoryServiceResponse, error)
	ApplyTF2DecalFunc         func(context.Context, TF2DecalRequest) (TF2DecalResult, error)
	OwnedGamesFunc            func(context.Context, uint64) ([]SteamOwnedGame, error)
	InventoryFunc             func(context.Context) ([]GCInventoryItem, error)
	WaitForNewCS2ItemFunc     func(context.Context, map[uint64]struct{}) (GCInventoryItem, error)
	GamesPlayedCalls          [][]uint32
	StorePurchaseCalls        []StorePurchaseRequest
	StorePurchaseFunc         func(context.Context, StorePurchaseRequest) (StorePurchaseTransportResult, error)
	StorePurchaseResult       StorePurchaseTransportResult
	StorePurchaseErr          error
	FinalizeStorePurchaseFunc func(context.Context, uint64) ([]uint64, error)
	TF2FeatureResult          TF2FeatureSnapshot
	CS2FeatureResult          CS2FeatureSnapshot
}

func (m *TestGCClient) TF2Features() TF2FeatureSnapshot { return m.TF2FeatureResult }
func (m *TestGCClient) CS2Features() CS2FeatureSnapshot { return m.CS2FeatureResult }

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

func (m *TestGCClient) SendProtoToGC(ctx context.Context, appID uint32, emsg uint32, body []byte) error {
	m.SentProtoMessages = append(m.SentProtoMessages, GCMessage{AppID: appID, EMsg: emsg, Body: append([]byte(nil), body...)})
	if m.SendProtoFunc != nil {
		return m.SendProtoFunc(ctx, appID, emsg, body)
	}
	return nil
}

func (m *TestGCClient) RequestInventory(ctx context.Context) ([]GCInventoryItem, error) {
	if m.InventoryFunc != nil {
		return m.InventoryFunc(ctx)
	}
	return nil, nil
}

func (m *TestGCClient) WaitForNewCS2InventoryItem(ctx context.Context, knownIDs map[uint64]struct{}) (GCInventoryItem, error) {
	if m.WaitForNewCS2ItemFunc != nil {
		return m.WaitForNewCS2ItemFunc(ctx, knownIDs)
	}
	return GCInventoryItem{}, context.DeadlineExceeded
}

func (m *TestGCClient) RequestGameInventory(ctx context.Context, appID uint32) ([]GCInventoryItem, error) {
	if m.GameInventoryFunc != nil {
		return m.GameInventoryFunc(ctx, appID)
	}
	return nil, m.GameInventoryErr
}

func (m *TestGCClient) RequestSteamInventoryService(ctx context.Context, appID uint32, steamID uint64) (SteamInventoryServiceResponse, error) {
	if m.SteamInventoryServiceFunc != nil {
		return m.SteamInventoryServiceFunc(ctx, appID, steamID)
	}
	return SteamInventoryServiceResponse{}, nil
}

func (m *TestGCClient) ApplyTF2Decal(ctx context.Context, request TF2DecalRequest) (TF2DecalResult, error) {
	if m.ApplyTF2DecalFunc != nil {
		return m.ApplyTF2DecalFunc(ctx, request)
	}
	return TF2DecalResult{}, nil
}

func (m *TestGCClient) RequestOwnedGames(ctx context.Context, steamID uint64) ([]SteamOwnedGame, error) {
	if m.OwnedGamesFunc != nil {
		return m.OwnedGamesFunc(ctx, steamID)
	}
	return []SteamOwnedGame{}, nil
}

func (m *TestGCClient) RequestArmory(context.Context) (GCArmorySnapshot, error) {
	return GCArmorySnapshot{}, nil
}
func (m *TestGCClient) RequestStore(context.Context, uint32, int32) (GCStoreData, error) {
	return GCStoreData{}, nil
}
func (m *TestGCClient) RequestGameStore(ctx context.Context, _ uint32, version uint32, currency int32) (GCStoreData, error) {
	return m.RequestStore(ctx, version, currency)
}
func (m *TestGCClient) InitializeStorePurchase(ctx context.Context, request StorePurchaseRequest) (StorePurchaseTransportResult, error) {
	m.StorePurchaseCalls = append(m.StorePurchaseCalls, request)
	if m.StorePurchaseFunc != nil {
		return m.StorePurchaseFunc(ctx, request)
	}
	return m.StorePurchaseResult, m.StorePurchaseErr
}

func (m *TestGCClient) FinalizeStorePurchase(ctx context.Context, orderID uint64) ([]uint64, error) {
	if m.FinalizeStorePurchaseFunc != nil {
		return m.FinalizeStorePurchaseFunc(ctx, orderID)
	}
	return nil, nil
}
func (m *TestGCClient) FinalizeGameStorePurchase(ctx context.Context, _ uint32, orderID uint64) ([]uint64, error) {
	return m.FinalizeStorePurchase(ctx, orderID)
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
