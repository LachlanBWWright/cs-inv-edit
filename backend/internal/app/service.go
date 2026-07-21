package app

import (
	"context"
	"os"
	"sync"

	"cs-inv-edit/backend/internal/domain"
	"cs-inv-edit/backend/internal/econ"
	"cs-inv-edit/backend/internal/multigame"
	"cs-inv-edit/backend/internal/operations"
	"cs-inv-edit/backend/internal/steamprofile"
	"cs-inv-edit/backend/internal/steamtrade"
	"cs-inv-edit/backend/internal/transport"
	"cs-inv-edit/backend/pricescanner"
)

type HealthStatus struct {
	Status  string `json:"status"`
	Service string `json:"service"`
	Version string `json:"version"`
	Time    string `json:"time"`
}

type Service struct {
	mu               sync.Mutex
	events           []operations.Event
	operations       []operations.Receipt
	inventory        domain.InventorySnapshot
	armory           domain.ArmorySnapshot
	store            domain.StoreSnapshot
	purchaseSessions map[string]domain.PurchaseSession
	purchaseItemIDs  map[string][]uint64
	storeCountry     string
	storeCurrencyID  int32
	settings         domain.Settings
	connection       domain.ConnectionStatus
	gcClient         transport.GCClient
	econProvider     *econ.Provider
	multiProvider    *multigame.Provider
	gameInventories  map[string]domain.GameInventorySnapshot
	gameRefreshes    map[string]uint64
	gameCancels      map[string]context.CancelFunc
	lastOperation    operations.Receipt
	pendingUsername  string
	pendingPassword  string
	authCancel       context.CancelFunc
	profileResolver  *steamprofile.Resolver
	priceScanner     *pricescanner.Scanner
	tradeAccessToken string
	tradeProvider    *steamtrade.Provider
	trades           steamtrade.Snapshot
}

func NewService() *Service {
	service := &Service{
		inventory:        emptyInventory(),
		armory:           emptyArmory(),
		store:            emptyStore(),
		purchaseSessions: make(map[string]domain.PurchaseSession),
		purchaseItemIDs:  make(map[string][]uint64),
		settings:         defaultSettings(),
		connection:       domain.ConnectionStatus{State: "disconnected", Detail: "not connected"},
		gcClient:         transport.NewSteamGCClient(),
		econProvider:     econ.NewProvider(),
		multiProvider:    multigame.NewProvider(),
		gameInventories:  make(map[string]domain.GameInventorySnapshot),
		gameRefreshes:    make(map[string]uint64),
		gameCancels:      make(map[string]context.CancelFunc),
		profileResolver:  steamprofile.NewResolver(),
		tradeProvider:    steamtrade.NewProvider(nil),
		trades:           steamtrade.Snapshot{Status: "requires_connection", Received: []steamtrade.Trade{}, Sent: []steamtrade.Trade{}, History: []steamtrade.Trade{}, RefreshedAt: now()},
		priceScanner: pricescanner.New(
			pricescanner.NewSteamProvider(nil),
			pricescanner.NewSkinportProvider(nil),
			pricescanner.NewCSFloatProvider(nil, os.Getenv("CSFLOAT_API_KEY")),
		),
	}
	service.events = []operations.Event{{
		OperationID: "system",
		Type:        "log",
		State:       "queued",
		Message:     "backend started",
		CreatedAt:   now(),
	}}
	service.gcClient.SetProtocolTracing(service.settings.FeatureFlags.EnableProtocolConsole)
	return service
}

func (s *Service) Trades() steamtrade.Snapshot {
	s.mu.Lock()
	defer s.mu.Unlock()
	return s.trades
}

func (s *Service) RefreshTrades(ctx context.Context) steamtrade.Snapshot {
	s.mu.Lock()
	if s.connection.State != "connected" {
		s.trades = steamtrade.Snapshot{Status: "requires_connection", Received: []steamtrade.Trade{}, Sent: []steamtrade.Trade{}, History: []steamtrade.Trade{}, RefreshedAt: now(), Message: "Connect a Steam account to view trades."}
		out := s.trades
		s.mu.Unlock()
		return out
	}
	token := s.tradeAccessToken
	s.mu.Unlock()
	if token == "" {
		return steamtrade.Snapshot{Status: "requires_reauthentication", Received: []steamtrade.Trade{}, Sent: []steamtrade.Trade{}, History: []steamtrade.Trade{}, RefreshedAt: now(), Message: "Sign in again to grant read-only access to Steam trades."}
	}
	snapshot, err := s.tradeProvider.Load(ctx, token)
	if err != nil {
		return steamtrade.Snapshot{Status: "error", Received: []steamtrade.Trade{}, Sent: []steamtrade.Trade{}, History: []steamtrade.Trade{}, RefreshedAt: now(), Message: err.Error()}
	}
	s.mu.Lock()
	s.trades = snapshot
	s.mu.Unlock()
	return snapshot
}

func (s *Service) ScanPrices(ctx context.Context, query pricescanner.Query) (pricescanner.Result, error) {
	return s.priceScanner.Scan(ctx, query)
}

func (s *Service) ProtocolTrace(after uint64) []transport.ProtocolTraceEntry {
	s.mu.Lock()
	enabled := s.settings.FeatureFlags.EnableProtocolConsole
	s.mu.Unlock()
	if !enabled {
		return []transport.ProtocolTraceEntry{}
	}
	return s.gcClient.ProtocolTrace(after)
}

func (s *Service) Health() HealthStatus {
	return HealthStatus{
		Status:  "ok",
		Service: "cs2-backend",
		Version: "0.0.0",
		Time:    now(),
	}
}

func (s *Service) Inventory() domain.InventorySnapshot {
	s.mu.Lock()
	defer s.mu.Unlock()
	return cloneInventory(s.inventory)
}
