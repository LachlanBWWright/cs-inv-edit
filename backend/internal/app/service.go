package app

import (
	"context"
	"sync"

	"cs-inv-edit/backend/internal/domain"
	"cs-inv-edit/backend/internal/econ"
	"cs-inv-edit/backend/internal/multigame"
	"cs-inv-edit/backend/internal/operations"
	"cs-inv-edit/backend/internal/steamprofile"
	"cs-inv-edit/backend/internal/steamtrade"
	"cs-inv-edit/backend/internal/transport"
)

type HealthStatus struct {
	Status  string `json:"status"`
	Service string `json:"service"`
	Version string `json:"version"`
	Time    string `json:"time"`
}

type steamAccountSession struct {
	Connection       domain.ConnectionStatus
	GCClient         transport.GCClient
	TradeAccessToken string
	Trades           steamtrade.Snapshot
}

type Service struct {
	mu                 sync.Mutex
	events             []operations.Event
	operations         []operations.Receipt
	inventory          domain.InventorySnapshot
	armory             domain.ArmorySnapshot
	store              domain.StoreSnapshot
	purchaseSessions   map[string]domain.PurchaseSession
	purchaseItemIDs    map[string][]uint64
	loadedStorageUnits map[uint64]bool
	storeCountry       string
	storeCurrencyID    int32
	settings           domain.Settings
	connection         domain.ConnectionStatus
	gcClient           transport.GCClient
	econProvider       *econ.Provider
	multiProvider      *multigame.Provider
	gameInventories    map[string]domain.GameInventorySnapshot
	gameRefreshes      map[string]uint64
	gameCancels        map[string]context.CancelFunc
	gcSessionEpoch     uint64
	gcSessionContext   context.Context
	gcSessionCancel    context.CancelFunc
	gcSessions         map[gcSessionKey]*gcSessionState
	lastOperation      operations.Receipt
	pendingUsername    string
	pendingPassword    string
	authCancel         context.CancelFunc
	profileResolver    *steamprofile.Resolver
	tradeAccessToken   string
	tradeProvider      *steamtrade.Provider
	trades             steamtrade.Snapshot
	tradeAccounts      map[string]steamtrade.AccountSnapshot
	steamSessions      map[string]*steamAccountSession
	activeSteamID      string
}

func NewService() *Service {
	service := &Service{
		inventory:          emptyInventory(),
		armory:             emptyArmory(),
		store:              emptyStore(),
		purchaseSessions:   make(map[string]domain.PurchaseSession),
		purchaseItemIDs:    make(map[string][]uint64),
		loadedStorageUnits: make(map[uint64]bool),
		settings:           defaultSettings(),
		connection:         domain.ConnectionStatus{State: "disconnected", Detail: "not connected"},
		gcClient:           transport.NewSteamGCClient(),
		econProvider:       econ.NewProvider(),
		multiProvider:      multigame.NewProvider(),
		gameInventories:    make(map[string]domain.GameInventorySnapshot),
		gameRefreshes:      make(map[string]uint64),
		gameCancels:        make(map[string]context.CancelFunc),
		gcSessions:         make(map[gcSessionKey]*gcSessionState),
		profileResolver:    steamprofile.NewResolver(),
		tradeProvider:      steamtrade.NewProvider(nil),
		trades:             steamtrade.Snapshot{Status: "requires_connection", Received: []steamtrade.Trade{}, Sent: []steamtrade.Trade{}, History: []steamtrade.Trade{}, RefreshedAt: now()},
		tradeAccounts:      make(map[string]steamtrade.AccountSnapshot),
		steamSessions:      make(map[string]*steamAccountSession),
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

func (s *Service) registerSteamSessionLocked(status domain.ConnectionStatus, token string) {
	session := &steamAccountSession{Connection: status, GCClient: s.gcClient, TradeAccessToken: token, Trades: s.trades}
	s.steamSessions[status.SteamID] = session
	s.activeSteamID = status.SteamID
	s.connection = status
	s.tradeAccessToken = token
}

func (s *Service) prepareAdditionalSteamSession() {
	s.mu.Lock()
	if s.connection.State == "connected" {
		s.gcClient = transport.NewSteamGCClient()
		s.gcClient.SetProtocolTracing(s.settings.FeatureFlags.EnableProtocolConsole)
		s.connection = domain.ConnectionStatus{State: "disconnected", Detail: "new account authentication pending"}
		s.tradeAccessToken = ""
		s.trades = steamtrade.Snapshot{Status: "requires_connection", Received: []steamtrade.Trade{}, Sent: []steamtrade.Trade{}, History: []steamtrade.Trade{}, RefreshedAt: now()}
	}
	s.mu.Unlock()
}

func (s *Service) AccountTrades() steamtrade.AccountSnapshots {
	s.mu.Lock()
	defer s.mu.Unlock()
	accounts := make([]steamtrade.AccountSnapshot, 0, len(s.tradeAccounts))
	for _, account := range s.tradeAccounts {
		accounts = append(accounts, account)
	}
	return steamtrade.AccountSnapshots{Accounts: accounts, RefreshedAt: now()}
}

func (s *Service) RefreshAccountTrades(ctx context.Context, steamID string) steamtrade.AccountSnapshots {
	type target struct{ steamID, token string }
	s.mu.Lock()
	targets := make([]target, 0, len(s.steamSessions))
	for id, session := range s.steamSessions {
		if steamID == "" || steamID == id {
			targets = append(targets, target{id, session.TradeAccessToken})
		}
	}
	s.mu.Unlock()
	for _, current := range targets {
		snapshot, err := s.tradeProvider.Load(ctx, current.token)
		if err != nil {
			snapshot = steamtrade.Snapshot{Status: "error", Received: []steamtrade.Trade{}, Sent: []steamtrade.Trade{}, History: []steamtrade.Trade{}, RefreshedAt: now(), Message: err.Error()}
		}
		s.mu.Lock()
		if session := s.steamSessions[current.steamID]; session != nil {
			session.Trades = snapshot
			s.tradeAccounts[current.steamID] = steamtrade.AccountSnapshot{SteamID: current.steamID, AccountName: session.Connection.AccountName, AvatarURL: session.Connection.AvatarURL, Snapshot: snapshot}
			if current.steamID == s.activeSteamID {
				s.trades = snapshot
			}
		}
		s.mu.Unlock()
	}
	return s.AccountTrades()
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
	if s.connection.SteamID != "" {
		s.tradeAccounts[s.connection.SteamID] = steamtrade.AccountSnapshot{SteamID: s.connection.SteamID, AccountName: s.connection.AccountName, AvatarURL: s.connection.AvatarURL, Snapshot: snapshot}
	}
	s.mu.Unlock()
	return snapshot
}

func (s *Service) CreateTradeOffer(ctx context.Context, input steamtrade.CreateRequest) steamtrade.MutationResult {
	if input.CounteredTradeOfferID != "" {
		return steamtrade.MutationResult{Status: "error", Message: "Countered trade offer IDs are only accepted on the counter endpoint."}
	}
	return s.createTradeOffer(ctx, input)
}

func (s *Service) createTradeOffer(ctx context.Context, input steamtrade.CreateRequest) steamtrade.MutationResult {
	s.mu.Lock()
	if !s.settings.FeatureFlags.EnableSteamTradeMutations {
		s.mu.Unlock()
		return steamtrade.MutationResult{Status: "blocked_by_feature_flag", Message: "Steam trade mutations are disabled. Enable them in Settings first."}
	}
	steamID, token, provider := s.connection.SteamID, s.tradeAccessToken, s.tradeProvider
	connected := s.connection.State == "connected"
	s.mu.Unlock()
	if !connected {
		return steamtrade.MutationResult{Status: "requires_connection", Message: "Connect Steam before creating a trade offer."}
	}
	result, err := provider.Create(ctx, steamID, token, input)
	if err != nil {
		return steamtrade.MutationResult{Status: "error", Message: err.Error()}
	}
	return result
}

func (s *Service) AcceptTradeOffer(ctx context.Context, tradeOfferID string) steamtrade.MutationResult {
	s.mu.Lock()
	if !s.settings.FeatureFlags.EnableSteamTradeMutations {
		s.mu.Unlock()
		return steamtrade.MutationResult{Status: "blocked_by_feature_flag", Message: "Steam trade mutations are disabled. Enable them in Settings first."}
	}
	steamID, token, provider := s.connection.SteamID, s.tradeAccessToken, s.tradeProvider
	connected := s.connection.State == "connected"
	partner := activeReceivedPartner(s.trades.Received, tradeOfferID)
	s.mu.Unlock()
	if !connected {
		return steamtrade.MutationResult{Status: "requires_connection", Message: "Connect Steam before accepting a trade offer."}
	}
	if partner == "" {
		return steamtrade.MutationResult{Status: "requires_refresh", Message: "The offer is not an active incoming offer. Refresh trades before accepting it."}
	}
	result, err := provider.Accept(ctx, steamID, token, tradeOfferID, partner)
	if err != nil {
		return steamtrade.MutationResult{Status: "error", Message: err.Error()}
	}
	return result
}

func (s *Service) CounterTradeOffer(ctx context.Context, tradeOfferID string, input steamtrade.CreateRequest) steamtrade.MutationResult {
	s.mu.Lock()
	partner := activeReceivedPartner(s.trades.Received, tradeOfferID)
	s.mu.Unlock()
	if partner == "" {
		return steamtrade.MutationResult{Status: "requires_refresh", Message: "The offer is not an active incoming offer. Refresh trades before countering it."}
	}
	if input.PartnerSteamID != "" && input.PartnerSteamID != partner {
		return steamtrade.MutationResult{Status: "error", Message: "Counteroffer partner does not match the original offer."}
	}
	input.PartnerSteamID, input.CounteredTradeOfferID = partner, tradeOfferID
	return s.createTradeOffer(ctx, input)
}

func activeReceivedPartner(trades []steamtrade.Trade, tradeOfferID string) string {
	for _, trade := range trades {
		if trade.ID == tradeOfferID && trade.Direction == "received" && trade.State == "active" {
			return trade.PartnerSteamID
		}
	}
	return ""
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
