package app

import (
	"context"
	"fmt"
	"strconv"
	"sync"
	"time"

	"cs-inv-edit/backend/internal/api"
	"cs-inv-edit/backend/internal/domain"
	"cs-inv-edit/backend/internal/econ"
	"cs-inv-edit/backend/internal/multigame"
	"cs-inv-edit/backend/internal/operations"
	"cs-inv-edit/backend/internal/steamprofile"
	"cs-inv-edit/backend/internal/steamtrade"
	"cs-inv-edit/backend/internal/transport"
)

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
	tf2Store           domain.StoreSnapshot
	purchaseSessions   map[string]domain.PurchaseSession
	purchaseItemIDs    map[string][]uint64
	purchaseAppIDs     map[string]uint32
	loadedStorageUnits map[uint64]bool
	storeCountry       string
	storeCurrencyID    int32
	tf2StoreCountry    string
	tf2StoreCurrencyID int32
	settings           domain.Settings
	connection         domain.ConnectionStatus
	gcClient           transport.GCClient
	econProvider       *econ.Provider
	armorySchema       *econ.Schema
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
	authEpoch          uint64
	profileResolver    *steamprofile.Resolver
	tradeAccessToken   string
	tradeProvider      *steamtrade.Provider
	trades             steamtrade.Snapshot
	tradeAccounts      map[string]steamtrade.AccountSnapshot
	steamSessions      map[string]*steamAccountSession
	activeSteamID      string
	saveSteamSession   func(transport.LogonCredentials) error
	clearSteamSession  func() error
}

func NewService() *Service {
	service := &Service{
		inventory:          emptyInventory(),
		armory:             emptyArmory(),
		store:              emptyStore(),
		tf2Store:           emptyTF2Store(),
		purchaseSessions:   make(map[string]domain.PurchaseSession),
		purchaseItemIDs:    make(map[string][]uint64),
		purchaseAppIDs:     make(map[string]uint32),
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
	if s.connection.State == domain.ConnectionStateConnected {
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
	if s.connection.State != domain.ConnectionStateConnected {
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
	connected := s.connection.State == domain.ConnectionStateConnected
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
	connected := s.connection.State == domain.ConnectionStateConnected
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
		if trade.ID == tradeOfferID &&
			trade.Direction == steamtrade.TradeDirectionReceived &&
			trade.State == steamtrade.TradeStateActive {
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

func (s *Service) TF2Features() transport.TF2FeatureSnapshot {
	s.mu.Lock()
	enabled := s.settings.FeatureFlags.EnableTF2Inventory
	connected := s.connection.State == domain.ConnectionStateConnected
	currency := s.store.Currency
	s.mu.Unlock()
	if !enabled {
		snapshot := transport.TF2FeatureSnapshot{Status: "disabled", RefreshedAt: now(), Diagnostics: []string{"TF2 inventory is disabled."}}
		snapshot.PresetItems, snapshot.ClassPresets = []transport.TF2PresetItem{}, []transport.TF2ClassPreset{}
		snapshot.Matches, snapshot.Ladder, snapshot.Ratings = []map[string]any{}, []map[string]any{}, []map[string]any{}
		snapshot.Quests, snapshot.QuestNodes, snapshot.QuestRewards = []map[string]any{}, []map[string]any{}, []map[string]any{}
		snapshot.Activity, snapshot.Market = []transport.TF2ActivityEntry{}, []transport.TF2MarketEntry{}
		return snapshot
	}
	if !connected {
		snapshot := transport.TF2FeatureSnapshot{Status: "requires_connection", RefreshedAt: now(), Diagnostics: []string{"Connect Steam to load TF2 coordinator state."}}
		snapshot.PresetItems, snapshot.ClassPresets = []transport.TF2PresetItem{}, []transport.TF2ClassPreset{}
		snapshot.Matches, snapshot.Ladder, snapshot.Ratings = []map[string]any{}, []map[string]any{}, []map[string]any{}
		snapshot.Quests, snapshot.QuestNodes, snapshot.QuestRewards = []map[string]any{}, []map[string]any{}, []map[string]any{}
		snapshot.Activity, snapshot.Market = []transport.TF2ActivityEntry{}, []transport.TF2MarketEntry{}
		return snapshot
	}
	snapshot := s.gcClient.TF2Features()
	if snapshot.RefreshedAt == "" {
		snapshot.RefreshedAt = now()
	}
	snapshot.Currency = currency
	s.reconcileTF2Operations(snapshot)
	return snapshot
}

func (s *Service) TF2FeaturesWithMetadata(ctx context.Context) transport.TF2FeatureSnapshot {
	snapshot := s.TF2Features()
	if snapshot.Status != "ready" {
		return snapshot
	}
	definitions, _, err := s.multiProvider.TF2Definitions(ctx)
	if err != nil {
		snapshot.Diagnostics = append(snapshot.Diagnostics, "TF2 campaign metadata: "+err.Error())
		return snapshot
	}
	enrich := func(entries []map[string]any, indexField string) {
		for _, entry := range entries {
			definition, found := definitions[resultUint32(entry[indexField])]
			if !found {
				continue
			}
			entry["name"] = definition.Name
			entry["description"] = definition.Description
			if len(definition.QuestObjectives) > 0 {
				entry["objectives"] = definition.QuestObjectives
			}
		}
	}
	enrich(snapshot.Quests, "defindex")
	enrich(snapshot.QuestNodes, "selected_quest_def")
	enrich(snapshot.QuestRewards, "defindex")
	return snapshot
}

func (s *Service) CS2Features() transport.CS2FeatureSnapshot {
	s.mu.Lock()
	connected := s.connection.State == domain.ConnectionStateConnected
	s.mu.Unlock()
	if !connected {
		return transport.CS2FeatureSnapshot{
			Status: "requires_connection", EquipSlots: []transport.CS2EquipSlot{},
			Matches: []map[string]any{}, Rentals: []map[string]any{}, Quests: []map[string]any{},
			RecurringMissions: []map[string]any{}, SeasonalOperations: []map[string]any{},
			Activity: []transport.CS2ActivityEntry{}, Diagnostics: []string{"Connect Steam to load CS2 coordinator features."},
		}
	}
	snapshot := s.gcClient.CS2Features()
	s.reconcileCS2FeatureOperations(snapshot)
	return snapshot
}

func (s *Service) reconcileCS2FeatureOperations(snapshot transport.CS2FeatureSnapshot) {
	s.mu.Lock()
	defer s.mu.Unlock()
	current := time.Now().UTC()
	for index := range s.operations {
		receipt := &s.operations[index]
		if receipt.State != operations.StateAwaitingGCConfirmation || len(receipt.Type) < 4 || receipt.Type[:4] != "cs2." {
			continue
		}
		created, err := time.Parse(time.RFC3339Nano, receipt.CreatedAt)
		if err != nil {
			continue
		}
		result, _ := receipt.Result.(map[string]any)
		confirmed := false
		switch receipt.Type {
		case "cs2.loadout.set":
			classID, slotID := resultUint32(result["classId"]), resultUint32(result["slotId"])
			itemID := fmt.Sprint(result["itemId"])
			for _, entry := range snapshot.EquipSlots {
				confirmed = confirmed || entry.ClassID == classID && entry.SlotID == slotID && entry.ItemID == itemID
			}
		case "cs2.inspect.resolve":
			confirmed = timestampAfter(snapshot.InspectedAt, created)
		case "cs2.matches.recent", "cs2.matches.details":
			confirmed = timestampAfter(snapshot.RefreshedAt, created) && len(snapshot.Matches) > 0
		case "cs2.profile.refresh":
			confirmed = timestampAfter(snapshot.RefreshedAt, created) && snapshot.Profile != nil
		case "cs2.progression.refresh":
			confirmed = timestampAfter(snapshot.RefreshedAt, created) && snapshot.RecurringSchema != nil
		}
		if confirmed {
			receipt.State, receipt.Message = "completed", "CS2 Game Coordinator state confirmed the operation"
			s.events = append(s.events, operations.NewEvent(*receipt, receipt.State, receipt.Message))
			continue
		}
		if current.Sub(created) >= 15*time.Second {
			receipt.State, receipt.Message = "failed", "CS2 Game Coordinator did not confirm the request before timeout; it was not retried"
			s.events = append(s.events, operations.NewEvent(*receipt, receipt.State, receipt.Message))
		}
	}
}

func (s *Service) reconcileTF2Operations(snapshot transport.TF2FeatureSnapshot) {
	s.mu.Lock()
	defer s.mu.Unlock()
	nowTime := time.Now().UTC()
	for index := range s.operations {
		receipt := &s.operations[index]
		if receipt.State != operations.StateAwaitingGCConfirmation || len(receipt.Type) < 4 || receipt.Type[:4] != "tf2." {
			continue
		}
		created, err := time.Parse(time.RFC3339Nano, receipt.CreatedAt)
		if err != nil {
			continue
		}
		result, _ := receipt.Result.(map[string]any)
		confirmed := tf2ReceiptConfirmed(*receipt, result, snapshot, created)
		if confirmed {
			receipt.State = "completed"
			receipt.Message = "TF2 Game Coordinator state confirmed the operation"
			s.events = append(s.events, operations.NewEvent(*receipt, receipt.State, receipt.Message))
			s.lastOperation = *receipt
			continue
		}
		if nowTime.Sub(created) >= 15*time.Second {
			receipt.State = "failed"
			receipt.Message = "TF2 Game Coordinator did not confirm the operation before timeout; it was not retried"
			s.events = append(s.events, operations.NewEvent(*receipt, receipt.State, receipt.Message))
			s.lastOperation = *receipt
		}
	}
}

func tf2ReceiptConfirmed(receipt operations.Receipt, result map[string]any, snapshot transport.TF2FeatureSnapshot, created time.Time) bool {
	switch receipt.Type {
	case "tf2.loadout.set-preset-item":
		classID, presetID, slotID := resultUint32(result["classId"]), resultUint32(result["presetId"]), resultUint32(result["slotId"])
		itemID := fmt.Sprint(result["itemId"])
		for _, entry := range snapshot.PresetItems {
			if entry.ClassID == classID && entry.PresetID == presetID && entry.SlotID == slotID && entry.ItemID == itemID {
				return true
			}
		}
	case "tf2.loadout.select-preset":
		classID, presetID := resultUint32(result["classId"]), resultUint32(result["presetId"])
		for _, entry := range snapshot.ClassPresets {
			if entry.ClassID == classID && entry.ActivePresetID == presetID {
				return true
			}
		}
	case "tf2.inspect.resolve":
		return timestampAfter(snapshot.InspectedAt, created)
	case "tf2.market.refresh":
		return timestampAfter(snapshot.MarketAt, created)
	case "tf2.matches.load":
		return timestampAfter(snapshot.RefreshedAt, created) && len(snapshot.Matches) > 0
	case "tf2.matches.stats":
		return timestampAfter(snapshot.RefreshedAt, created) && snapshot.Matchmaking != nil
	}
	return false
}

func resultUint32(value any) uint32 {
	switch typed := value.(type) {
	case float64:
		return uint32(typed)
	case uint32:
		return typed
	case int:
		return uint32(typed)
	case string:
		parsed, _ := strconv.ParseUint(typed, 10, 32)
		return uint32(parsed)
	default:
		return 0
	}
}

func timestampAfter(value string, reference time.Time) bool {
	parsed, err := time.Parse(time.RFC3339Nano, value)
	return err == nil && !parsed.Before(reference)
}

func (s *Service) Health() api.HealthStatus {
	return api.HealthStatus{
		Status:  api.HealthStatusStatus("ok"),
		Service: "cs2-backend",
		Version: "0.0.0",
		Time:    time.Now().UTC(),
	}
}

func (s *Service) Inventory() domain.InventorySnapshot {
	s.mu.Lock()
	defer s.mu.Unlock()
	return cloneInventory(s.inventory)
}
