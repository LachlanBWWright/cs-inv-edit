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
	VolatileOffers []GCVolatileOffer
}

type GCVolatileOffer struct {
	FauxItemID     uint64
	GenerationTime uint32
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

type TF2PresetItem struct {
	ClassID  uint32 `json:"classId"`
	PresetID uint32 `json:"presetId"`
	SlotID   uint32 `json:"slotId"`
	ItemID   string `json:"itemId"`
}

type TF2ClassPreset struct {
	ClassID        uint32 `json:"classId"`
	ActivePresetID uint32 `json:"activePresetId"`
}

type TF2ActivityEntry struct {
	Kind      string         `json:"kind"`
	ID        string         `json:"id,omitempty"`
	Timestamp uint32         `json:"timestamp,omitempty"`
	Data      map[string]any `json:"data"`
}

type TF2MarketEntry struct {
	DefinitionID uint32 `json:"definitionId"`
	QualityID    uint32 `json:"qualityId"`
	SellListings uint32 `json:"sellListings"`
	PriceMinor   uint32 `json:"priceMinor"`
}

type TF2InspectedAttribute struct {
	DefinitionID uint32 `json:"definitionId"`
	Value        string `json:"value,omitempty"`
	ValueBytes   string `json:"valueBytes,omitempty"`
}

type TF2InspectedEquippedState struct {
	ClassID uint32 `json:"classId"`
	SlotID  uint32 `json:"slotId"`
}

type TF2InspectedItem struct {
	ID                string                      `json:"id"`
	OriginalID        string                      `json:"originalId,omitempty"`
	DefinitionID      uint32                      `json:"definitionId"`
	Quantity          uint32                      `json:"quantity"`
	Level             uint32                      `json:"level"`
	QualityID         uint32                      `json:"qualityId"`
	Flags             uint32                      `json:"flags"`
	OriginID          uint32                      `json:"originId"`
	CustomName        string                      `json:"customName,omitempty"`
	CustomDescription string                      `json:"customDescription,omitempty"`
	Style             uint32                      `json:"style"`
	Attributes        []TF2InspectedAttribute     `json:"attributes"`
	EquippedStates    []TF2InspectedEquippedState `json:"equippedStates"`
	InteriorItem      *TF2InspectedItem           `json:"interiorItem,omitempty"`
}

type TF2FeatureSnapshot struct {
	Status         string             `json:"status"`
	RefreshedAt    string             `json:"refreshedAt"`
	PresetItems    []TF2PresetItem    `json:"presetItems"`
	ClassPresets   []TF2ClassPreset   `json:"classPresets"`
	Matches        []map[string]any   `json:"matches"`
	Ladder         []map[string]any   `json:"ladder"`
	Ratings        []map[string]any   `json:"ratings"`
	Quests         []map[string]any   `json:"quests"`
	QuestNodes     []map[string]any   `json:"questNodes"`
	QuestRewards   []map[string]any   `json:"questRewards"`
	Matchmaking    map[string]any     `json:"matchmaking,omitempty"`
	DataCenterPing map[string]any     `json:"dataCenterPing,omitempty"`
	DailyStats     map[string]any     `json:"dailyStats,omitempty"`
	Activity       []TF2ActivityEntry `json:"activity"`
	Market         []TF2MarketEntry   `json:"market"`
	InspectedItem  *TF2InspectedItem  `json:"inspectedItem,omitempty"`
	InspectedAt    string             `json:"inspectedAt,omitempty"`
	MarketAt       string             `json:"marketAt,omitempty"`
	Currency       string             `json:"currency,omitempty"`
	Diagnostics    []string           `json:"diagnostics"`
}

type CS2EquipSlot struct {
	ClassID      uint32 `json:"classId"`
	SlotID       uint32 `json:"slotId"`
	ItemID       string `json:"itemId"`
	DefinitionID uint32 `json:"definitionId"`
}

type CS2ActivityEntry struct {
	Kind      string         `json:"kind"`
	ID        string         `json:"id,omitempty"`
	Timestamp uint32         `json:"timestamp,omitempty"`
	Data      map[string]any `json:"data"`
}

type CS2FeatureSnapshot struct {
	Status             string             `json:"status"`
	RefreshedAt        string             `json:"refreshedAt,omitempty"`
	EquipSlots         []CS2EquipSlot     `json:"equipSlots"`
	Matches            []map[string]any   `json:"matches"`
	Profile            map[string]any     `json:"profile,omitempty"`
	Premier            map[string]any     `json:"premier,omitempty"`
	DeepStats          map[string]any     `json:"deepStats,omitempty"`
	SearchStats        map[string]any     `json:"searchStats,omitempty"`
	InspectedItem      map[string]any     `json:"inspectedItem,omitempty"`
	InspectedAt        string             `json:"inspectedAt,omitempty"`
	Rentals            []map[string]any   `json:"rentals"`
	Quests             []map[string]any   `json:"quests"`
	RecurringMissions  []map[string]any   `json:"recurringMissions"`
	SeasonalOperations []map[string]any   `json:"seasonalOperations"`
	XPShop             map[string]any     `json:"xpShop,omitempty"`
	RecurringSchema    map[string]any     `json:"recurringSchema,omitempty"`
	Activity           []CS2ActivityEntry `json:"activity"`
	Diagnostics        []string           `json:"diagnostics"`
}
type GCStoreData struct {
	Result            int32
	Currency          int32
	Country           string
	PriceSheetVersion uint32
	PriceSheet        []byte
}
type StorePurchaseRequest struct {
	AppID                uint32
	Country              string
	Language             int32
	Currency             int32
	ItemDefID            uint32
	Quantity             uint32
	Cost                 uint64
	PurchaseType         uint32
	SupplementalData     uint64
	CountryPresent       bool
	LanguagePresent      bool
	OmitCurrency         bool
	OmitItemDefID        bool
	OmitQuantity         bool
	OmitCost             bool
	PurchaseTypePresent  bool
	OmitSupplementalData bool
}
type StorePurchaseTransportResult struct {
	TransactionID uint64
	OrderID       uint64
	CheckoutURL   string
	ItemIDs       []uint64
	Authorization map[string]any
	Diagnostics   []string
}

type SteamInventoryServiceResponse struct {
	ETag           string
	RemovedItemIDs []uint64
	ItemJSON       string
	ItemDefJSON    string
	Replayed       bool
}

type TF2DecalRequest struct {
	ToolItemID    uint64
	SubjectItemID uint64
	PNG           []byte
}

type TF2DecalResult struct {
	UGCID              uint64
	ResponseIndex      int16
	ResponseCode       uint32
	InventoryConfirmed bool
	Diagnostics        []string
}

type SteamOwnedGame struct {
	AppID           uint32
	Name            string
	PlaytimeForever uint32
	LastPlayed      uint32
	HasMarket       bool
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
	WaitForNewCS2InventoryItem(ctx context.Context, knownIDs map[uint64]struct{}) (GCInventoryItem, error)
	RequestGameInventory(ctx context.Context, appID uint32) ([]GCInventoryItem, error)
	RequestSteamInventoryService(ctx context.Context, appID uint32, steamID uint64) (SteamInventoryServiceResponse, error)
	ApplyTF2Decal(ctx context.Context, request TF2DecalRequest) (TF2DecalResult, error)
	RequestOwnedGames(ctx context.Context, steamID uint64) ([]SteamOwnedGame, error)
	RequestArmory(ctx context.Context) (GCArmorySnapshot, error)
	RequestStore(ctx context.Context, version uint32, currency int32) (GCStoreData, error)
	RequestGameStore(ctx context.Context, appID uint32, version uint32, currency int32) (GCStoreData, error)
	InitializeStorePurchase(ctx context.Context, request StorePurchaseRequest) (StorePurchaseTransportResult, error)
	FinalizeStorePurchase(ctx context.Context, orderID uint64) ([]uint64, error)
	FinalizeGameStorePurchase(ctx context.Context, appID uint32, orderID uint64) ([]uint64, error)
	SetProtocolTracing(enabled bool)
	ProtocolTrace(after uint64) []ProtocolTraceEntry
	TF2Features() TF2FeatureSnapshot
	CS2Features() CS2FeatureSnapshot
	Events() <-chan GCEvent
	State() GCConnectionState
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
