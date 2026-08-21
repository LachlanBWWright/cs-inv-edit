package transport

import "context"

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
