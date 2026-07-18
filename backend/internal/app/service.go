package app

import (
	"context"
	"encoding/hex"
	"errors"
	"fmt"
	"log"
	"math"
	"os"
	"sort"
	"strconv"
	"strings"
	"sync"
	"time"

	"cs-inv-edit/backend/internal/domain"
	"cs-inv-edit/backend/internal/econ"
	"cs-inv-edit/backend/internal/multigame"
	"cs-inv-edit/backend/internal/operations"
	cs2pb "cs-inv-edit/backend/internal/proto/generated"
	"cs-inv-edit/backend/internal/protocol"
	"cs-inv-edit/backend/internal/steamprofile"
	"cs-inv-edit/backend/internal/steamtrade"
	"cs-inv-edit/backend/internal/transport"
	"cs-inv-edit/backend/pricescanner"
	"github.com/Lucino772/envelop/pkg/steam/steamlang"
	"google.golang.org/protobuf/proto"
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

func (s *Service) GameInventory(gameID string) (domain.GameInventorySnapshot, bool, bool) {
	game, supported := multigame.ParseGame(gameID)
	if !supported {
		return domain.GameInventorySnapshot{}, false, false
	}
	s.mu.Lock()
	defer s.mu.Unlock()
	enabled := s.gameInventoryEnabledLocked(game.ID)
	if !enabled {
		return emptyGameInventory(game.ID, game.AppID), true, false
	}
	if s.connection.State != "connected" || s.connection.SteamID == "" {
		return emptyGameInventory(game.ID, game.AppID), true, true
	}
	snapshot, ok := s.gameInventories[gameInventoryKey(s.connection.SteamID, game.ID)]
	if !ok {
		snapshot = emptyGameInventory(game.ID, game.AppID)
		snapshot.Status = "loading"
		snapshot.Message = "Waiting for the first " + game.ID + " inventory refresh"
	}
	return cloneGameInventory(snapshot), true, true
}

func (s *Service) RefreshGameInventory(gameID string) operations.Receipt {
	game, supported := multigame.ParseGame(gameID)
	receipt := s.newReceipt("inventory.refresh." + gameID)
	if !supported {
		receipt.State, receipt.Message = "failed", "unsupported economy game"
		s.addEvent(receipt, receipt.State, receipt.Message)
		return receipt
	}

	s.mu.Lock()
	if !s.gameInventoryEnabledLocked(game.ID) {
		s.mu.Unlock()
		receipt.State, receipt.Message = "blocked_by_feature_flag", game.ID+" inventory viewing is disabled"
		s.addEvent(receipt, receipt.State, receipt.Message)
		return receipt
	}
	if s.connection.State != "connected" || s.connection.SteamID == "" {
		s.mu.Unlock()
		receipt.State, receipt.Message = "requires_connection", "connect a Steam account to load "+game.ID+" inventory"
		s.addEvent(receipt, receipt.State, receipt.Message)
		return receipt
	}
	steamID := s.connection.SteamID
	webAccessToken := s.tradeAccessToken
	key := gameInventoryKey(steamID, game.ID)
	if cancel := s.gameCancels[key]; cancel != nil {
		cancel()
	}
	s.gameRefreshes[key]++
	generation := s.gameRefreshes[key]
	loading, ok := s.gameInventories[key]
	if !ok {
		loading = emptyGameInventory(game.ID, game.AppID)
	}
	loading = cloneGameInventory(loading)
	loading.Status, loading.Message, loading.Error, loading.RefreshedAt = "loading", "loading "+game.ID+" inventory", "", now()
	s.gameInventories[key] = loading
	refreshCtx, cancelRefresh := context.WithTimeout(context.Background(), 60*time.Second)
	s.gameCancels[key] = cancelRefresh
	s.mu.Unlock()
	defer cancelRefresh()

	var snapshot domain.GameInventorySnapshot
	var err error
	if game.ID == "steam" {
		snapshot, err = s.multiProvider.LoadAuthenticated(refreshCtx, steamID, game, webAccessToken)
	} else {
		gcCtx, cancelGC := context.WithTimeout(refreshCtx, 30*time.Second)
		gcItems, gcErr := s.gcClient.RequestGameInventory(gcCtx, game.AppID)
		cancelGC()
		err = gcErr
		if err == nil {
			owned := make([]multigame.OwnedItem, 0, len(gcItems))
			for _, item := range gcItems {
				equipped := make([]domain.EquippedState, 0, len(item.EquippedStates))
				for _, state := range item.EquippedStates {
					equipped = append(equipped, domain.EquippedState{Class: state.Class, Slot: state.Slot})
				}
				owned = append(owned, multigame.OwnedItem{ID: item.ID, OriginalID: item.OriginalID, DefIndex: item.DefIndex, Quantity: item.Quantity, Quality: item.Quality, Inventory: item.Inventory, Level: item.Level, Flags: item.Flags, Origin: item.Origin, Style: item.Style, CustomName: item.CustomName, CustomDesc: item.CustomDesc, Attributes: item.Attributes, AttributeBytes: item.AttributeBytes, EquippedStates: equipped, InteriorItemID: item.InteriorItemID})
			}
			snapshot = s.multiProvider.EnrichOwned(refreshCtx, steamID, game, owned)
		}
	}

	s.mu.Lock()
	if s.gameRefreshes[key] != generation {
		s.mu.Unlock()
		receipt.State, receipt.Message = "completed", "newer "+game.ID+" inventory refresh superseded this result"
		s.addEvent(receipt, receipt.State, receipt.Message)
		return receipt
	}
	delete(s.gameCancels, key)
	if err != nil {
		failed := emptyGameInventory(game.ID, game.AppID)
		failed.Status, failed.Error, failed.Message, failed.RefreshedAt = "error", err.Error(), "inventory refresh failed", now()
		s.gameInventories[key] = failed
		receipt.State, receipt.Message = "failed", err.Error()
	} else {
		s.gameInventories[key] = snapshot
		receipt.State, receipt.Message = "completed", game.ID+" inventory refreshed"
	}
	s.mu.Unlock()
	s.addEvent(receipt, receipt.State, receipt.Message)
	return receipt
}

func gameInventoryKey(steamID, gameID string) string {
	return strings.TrimSpace(steamID) + "\x00" + gameID
}

func (s *Service) clearGameInventoriesLocked(gameID string) {
	for key, cancel := range s.gameCancels {
		if strings.HasSuffix(key, "\x00"+gameID) {
			cancel()
			delete(s.gameCancels, key)
			s.gameRefreshes[key]++
		}
	}
	for key := range s.gameInventories {
		if strings.HasSuffix(key, "\x00"+gameID) {
			delete(s.gameInventories, key)
		}
	}
}

func (s *Service) clearAllGameInventoriesLocked() {
	s.cancelAllGameRefreshesLocked()
	clear(s.gameInventories)
}

func (s *Service) cancelAllGameRefreshesLocked() {
	for key, cancel := range s.gameCancels {
		cancel()
		delete(s.gameCancels, key)
		s.gameRefreshes[key]++
	}
}

func (s *Service) gameInventoryEnabledLocked(gameID string) bool {
	switch gameID {
	case "steam":
		return s.settings.FeatureFlags.EnableSteamInventory
	case "tf2":
		return s.settings.FeatureFlags.EnableTF2Inventory
	case "dota2":
		return s.settings.FeatureFlags.EnableDota2Inventory
	default:
		return false
	}
}

func (s *Service) Armory() domain.ArmorySnapshot {
	s.mu.Lock()
	defer s.mu.Unlock()
	return cloneArmory(s.armory)
}

func (s *Service) Store() domain.StoreSnapshot {
	s.mu.Lock()
	defer s.mu.Unlock()
	if !s.settings.FeatureFlags.EnableStoreRead {
		return domain.StoreSnapshot{Status: "error", Offers: []domain.StoreOffer{}, RefreshedAt: now(), Message: "CS2 cash-store reads are disabled. Enable enableStoreRead in Settings to load the catalogue."}
	}
	if s.connection.State == "connected" && s.store.Status == "requires_connection" {
		store := cloneStore(s.store)
		store.Message = "Steam is connected. Refresh the Store to load the current GC price sheet."
		return store
	}
	return cloneStore(s.store)
}

func (s *Service) RefreshStore() operations.Receipt {
	receipt := s.newReceipt("store.refresh")
	s.mu.Lock()
	if !s.settings.FeatureFlags.EnableStoreRead {
		s.store = domain.StoreSnapshot{Status: "error", Offers: []domain.StoreOffer{}, RefreshedAt: now(), Message: "CS2 cash-store reads are disabled. Enable enableStoreRead in Settings to load the catalogue."}
		s.mu.Unlock()
		receipt.State, receipt.Message = "blocked_by_feature_flag", "CS2 cash-store reads are disabled"
		s.addEvent(receipt, receipt.State, receipt.Message)
		return receipt
	}
	if s.connection.State != "connected" {
		s.store = emptyStore()
		s.mu.Unlock()
		receipt.State, receipt.Message = "requires_connection", "connect a Steam account to load the CS2 cash store"
		s.addEvent(receipt, receipt.State, receipt.Message)
		return receipt
	}
	version := s.store.PriceSheetVersion
	s.store.Status, s.store.Message = "loading", "Waiting for the CS2 Game Coordinator price sheet"
	s.mu.Unlock()
	welcomeCtx, cancelWelcome := context.WithTimeout(context.Background(), 20*time.Second)
	_, err := s.gcClient.RequestInventory(welcomeCtx)
	cancelWelcome()
	if err != nil {
		s.mu.Lock()
		s.store = domain.StoreSnapshot{Status: "error", Offers: []domain.StoreOffer{}, RefreshedAt: now(), Message: fmt.Sprintf("load authoritative CS2 store currency: %v", err)}
		receipt.State, receipt.Message = "failed", s.store.Message
		s.mu.Unlock()
		s.addEvent(receipt, receipt.State, receipt.Message)
		return receipt
	}
	ctx, cancel := context.WithTimeout(context.Background(), 20*time.Second)
	data, err := s.gcClient.RequestStore(ctx, version, 0)
	cancel()
	var catalog econ.StoreCatalog
	var schema *econ.Schema
	if err == nil {
		catalog, err = econ.ParseStorePriceSheet(data.PriceSheet)
	}
	if err == nil {
		metadataCtx, metadataCancel := context.WithTimeout(context.Background(), 20*time.Second)
		schema, err = s.econProvider.Load(metadataCtx)
		metadataCancel()
	}
	s.mu.Lock()
	if err != nil {
		s.store = domain.StoreSnapshot{Status: "error", Offers: []domain.StoreOffer{}, RefreshedAt: now(), Message: err.Error()}
		receipt.State, receipt.Message = "failed", err.Error()
		s.mu.Unlock()
		s.addEvent(receipt, receipt.State, receipt.Message)
		return receipt
	}
	currency := steamCurrencyCode(data.Currency)
	diagnostics := []string{fmt.Sprintf("Authoritative Steam wallet store context: gc_currency_id=%d currency=%s wallet_country=%q", data.Currency, currency, data.Country)}
	if strings.HasPrefix(currency, "CURRENCY_") {
		currency = "USD"
		diagnostics = append(diagnostics, "The GC did not return an account currency; displaying USD prices until Steam supplies one.")
	}
	offers := make([]domain.StoreOffer, 0, len(catalog.Offers))
	for _, source := range catalog.Offers {
		defIndex, meta, found := schema.MetadataByItemName(source.ItemLink)
		if !found {
			diagnostics = append(diagnostics, fmt.Sprintf("Store item_link %q was not found in the live items_game items table", source.ItemLink))
			continue
		}
		amount, priced := source.Prices[currency]
		if !priced {
			diagnostics = append(diagnostics, fmt.Sprintf("Store offer %q has no %s price", source.ItemLink, currency))
			continue
		}
		var saleAmount *uint64
		if sale, onSale := source.SalePrices[currency]; onSale && sale < amount {
			saleCopy := sale
			saleAmount = &saleCopy
		}
		supported := !source.SupplementalDataRequired
		imageURL := meta.ImageURL
		if len(meta.ContainerItems) == 1 && meta.ContainerItems[0].ImageURL != "" {
			imageURL = meta.ContainerItems[0].ImageURL
		}
		offers = append(offers, domain.StoreOffer{ID: source.ID, ItemLink: source.ItemLink, DefIndex: defIndex, Name: meta.Name, ImageURL: imageURL, Category: firstNonEmptyApp(source.Category, meta.Kind), Rarity: meta.Rarity, Currency: currency, AmountMinor: amount, FormattedPrice: formatStoreAmount(currency, amount), SaleAmountMinor: saleAmount, PurchaseType: source.PurchaseType, Items: domainRelatedItems(meta.ContainerItems), FormattedSalePrice: func() string {
			if saleAmount == nil {
				return ""
			}
			return formatStoreAmount(currency, *saleAmount)
		}(), RequiresSupplementalData: source.SupplementalDataRequired, Purchasable: supported, UnsupportedReason: func() string {
			if supported {
				return ""
			}
			return "This offer requires unsupported supplemental purchase data."
		}()})
	}
	if len(offers) == 0 {
		err = fmt.Errorf("the GC price sheet contained %d entries, but none could be joined to live items_game metadata and %s prices", len(catalog.Offers), currency)
		s.store = domain.StoreSnapshot{Status: "error", Offers: []domain.StoreOffer{}, RefreshedAt: now(), Message: err.Error(), Diagnostics: diagnostics}
		receipt.State, receipt.Message = "failed", err.Error()
		s.mu.Unlock()
		s.addEvent(receipt, receipt.State, receipt.Message)
		return receipt
	}
	s.store = domain.StoreSnapshot{Status: "ready", PriceSheetVersion: data.PriceSheetVersion, Currency: currency, Offers: offers, RefreshedAt: now(), Diagnostics: diagnostics}
	s.storeCountry, s.storeCurrencyID = data.Country, data.Currency
	receipt.State, receipt.Message = "completed", "CS2 cash-store catalogue refreshed"
	s.mu.Unlock()
	s.addEvent(receipt, receipt.State, receipt.Message)
	return receipt
}

func (s *Service) InitializeStorePurchase(input map[string]any) domain.PurchaseSession {
	created := now()
	failed := func(message string) domain.PurchaseSession {
		return domain.PurchaseSession{ID: newID(), Status: "failed", OfferID: stringInput(input, "offerId"), Quantity: 1, Currency: "", FormattedAmount: "", CreatedAt: created, Message: message}
	}
	s.mu.Lock()
	if !s.settings.FeatureFlags.EnableStorePurchases {
		s.mu.Unlock()
		return failed("CS2 cash-store purchases are disabled")
	}
	if s.connection.State != "connected" || s.store.Status != "ready" {
		s.mu.Unlock()
		return failed("refresh the connected CS2 cash store before purchasing")
	}
	offerID := stringInput(input, "offerId")
	quantity64, qerr := requiredUint64Input(input, "quantity")
	version64, verr := requiredUint64Input(input, "expectedPriceSheetVersion")
	expected, aerr := requiredUint64Input(input, "expectedAmountMinor")
	if err := firstError(qerr, verr, aerr); err != nil || quantity64 == 0 || quantity64 > 20 {
		s.mu.Unlock()
		return failed("invalid store purchase quantity; CS2 supports between 1 and 20 items per purchase")
	}
	var offer *domain.StoreOffer
	for i := range s.store.Offers {
		if s.store.Offers[i].ID == offerID {
			offer = &s.store.Offers[i]
			break
		}
	}
	if offer == nil || !offer.Purchasable {
		s.mu.Unlock()
		return failed("store offer is unavailable or unsupported")
	}
	amount := offer.AmountMinor
	if offer.SaleAmountMinor != nil {
		amount = *offer.SaleAmountMinor
	}
	if uint32(version64) != s.store.PriceSheetVersion || expected != amount {
		s.mu.Unlock()
		return failed("The CS2 store price changed. Refresh the store and review the updated price before continuing.")
	}
	if amount == 0 || quantity64 > math.MaxUint64/amount {
		s.mu.Unlock()
		return failed("store purchase total is too large")
	}
	purchaseCurrency := s.storeCurrencyID
	purchaseCountry := strings.TrimSpace(s.storeCountry)
	if purchaseCountry == "" {
		s.mu.Unlock()
		return failed("the authoritative Steam wallet country is unavailable; refresh the store before purchasing")
	}
	if steamCurrencyCode(purchaseCurrency) != offer.Currency {
		s.mu.Unlock()
		return failed("the selected offer currency does not match the authoritative CS2 account currency; refresh the store")
	}
	sessionID := newID()
	session := domain.PurchaseSession{ID: sessionID, Status: "initializing", OfferID: offer.ID, DefIndex: offer.DefIndex, Name: offer.Name, Quantity: uint32(quantity64), Currency: offer.Currency, AmountMinor: amount * quantity64, FormattedAmount: formatStoreAmount(offer.Currency, amount*quantity64), CreatedAt: created, ExpiresAt: time.Now().Add(15 * time.Minute).UTC().Format(time.RFC3339), Message: "Initializing purchase with Steam"}
	purchaseRequest := transport.StorePurchaseRequest{Country: purchaseCountry, Language: 0, Currency: purchaseCurrency, ItemDefID: offer.DefIndex, Quantity: uint32(quantity64), Cost: amount * quantity64, PurchaseType: offer.PurchaseType}
	s.purchaseSessions[sessionID] = session
	s.mu.Unlock()
	ctx, cancel := context.WithTimeout(context.Background(), 20*time.Second)
	result, err := s.gcClient.InitializeStorePurchase(ctx, purchaseRequest)
	cancel()
	s.mu.Lock()
	defer s.mu.Unlock()
	if err != nil {
		session.Status, session.Message = "failed", err.Error()
		session.Diagnostics = transport.DiagnosticsFromError(err)
		var rejected transport.StorePurchaseRejectedError
		if errors.As(err, &rejected) {
			resultCode := rejected.Result
			session.ErrorCode = rejected.Code()
			session.ErrorResult = &resultCode
			session.Diagnostics = append([]string{fmt.Sprintf("CS2 EPurchaseResult %d decoded as %s", resultCode, rejected.Code())}, session.Diagnostics...)
		}
	} else {
		session.Status, session.Message, session.TransactionID, session.OrderID, session.CheckoutURL = "awaiting_user", "Steam confirmation link ready. Review and authorize the transaction on Steam.", strconv.FormatUint(result.TransactionID, 10), strconv.FormatUint(result.OrderID, 10), result.CheckoutURL
		session.Diagnostics = append([]string(nil), result.Diagnostics...)
		s.purchaseItemIDs[sessionID] = append([]uint64(nil), result.ItemIDs...)
	}
	s.purchaseSessions[sessionID] = session
	return session
}
func (s *Service) ReconcileStorePurchase(id string) domain.PurchaseSession {
	s.mu.Lock()
	session, ok := s.purchaseSessions[id]
	if !ok {
		s.mu.Unlock()
		return domain.PurchaseSession{ID: id, Status: "failed", Quantity: 1, CreatedAt: now(), Message: "purchase session not found"}
	}
	if session.Status != "awaiting_user" && session.Status != "finalizing" {
		s.mu.Unlock()
		return session
	}
	session.Status, session.Message = "finalizing", "Refreshing inventory to reconcile the Steam purchase"
	s.purchaseSessions[id] = session
	expected := append([]uint64(nil), s.purchaseItemIDs[id]...)
	s.mu.Unlock()
	receipt := s.RefreshInventory()
	s.mu.Lock()
	defer s.mu.Unlock()
	session = s.purchaseSessions[id]
	if receipt.State != "completed" {
		session.Status, session.Message = "awaiting_user", "Inventory refresh could not confirm the purchase; retry reconciliation after Steam finishes."
		s.purchaseSessions[id] = session
		return session
	}
	owned := make(map[string]struct{}, len(s.inventory.Items))
	for _, item := range s.inventory.Items {
		owned[item.ID] = struct{}{}
	}
	matched := make([]string, 0, len(expected))
	for _, itemID := range expected {
		idText := strconv.FormatUint(itemID, 10)
		if _, ok := owned[idText]; ok {
			matched = append(matched, idText)
		}
	}
	if len(expected) > 0 && len(matched) == len(expected) {
		session.Status, session.Message, session.PurchasedItemIDs = "completed", "Purchase confirmed in the GC-owned inventory.", matched
	} else {
		session.Status, session.Message = "awaiting_user", "Steam checkout is not yet reflected in the GC-owned inventory."
	}
	s.purchaseSessions[id] = session
	return session
}
func (s *Service) StorePurchase(id string) (domain.PurchaseSession, bool) {
	s.mu.Lock()
	defer s.mu.Unlock()
	session, ok := s.purchaseSessions[id]
	return session, ok
}

func (s *Service) MarketPreview(marketName string) (domain.RelatedItem, error) {
	marketName = strings.TrimSpace(marketName)
	if marketName == "" || len(marketName) > 256 {
		return domain.RelatedItem{}, fmt.Errorf("a valid market name is required")
	}
	ctx, cancel := context.WithTimeout(context.Background(), 15*time.Second)
	defer cancel()
	descriptions, err := s.econProvider.LoadPreviewDescriptions(ctx, []string{marketName})
	if err != nil {
		return domain.RelatedItem{}, err
	}
	description, ok := descriptions[marketName]
	if !ok {
		return domain.RelatedItem{}, fmt.Errorf("Steam Market returned no matching listing for %q", marketName)
	}
	return domain.RelatedItem{
		Name:        marketName,
		MarketName:  marketName,
		ListingName: firstNonEmptyApp(description.HashName, description.MarketHashName, description.MarketName),
		ImageURL:    firstNonEmptyApp(description.IconURLLarge, description.IconURL),
		Price:       description.Price.SellPriceText,
	}, nil
}

func (s *Service) RefreshArmory() operations.Receipt {
	receipt := s.newReceipt("armory.refresh")
	s.mu.Lock()
	if !s.settings.FeatureFlags.EnableArmoryRead {
		s.mu.Unlock()
		receipt.State, receipt.Message = "blocked_by_feature_flag", "Armory reads are disabled"
		s.addEvent(receipt, receipt.State, receipt.Message)
		return receipt
	}
	if s.connection.State != "connected" {
		s.armory = emptyArmory()
		s.mu.Unlock()
		receipt.State, receipt.Message = "requires_connection", "connect a Steam account to load Armory stars"
		s.addEvent(receipt, receipt.State, receipt.Message)
		return receipt
	}
	s.armory.Status = "loading"
	s.armory.Message = "Waiting for CS2 Game Coordinator Armory state"
	s.mu.Unlock()
	gcCtx, cancelGC := context.WithTimeout(context.Background(), 10*time.Second)
	state, err := s.gcClient.RequestArmory(gcCtx)
	cancelGC()
	var catalog []econ.ArmoryOffer
	if err == nil {
		s.setArmoryLoadingStage("Armory balance received; loading the current CS2 item schema")
		metadataCtx, cancelMetadata := context.WithTimeout(context.Background(), 20*time.Second)
		metadata, metadataErr := s.econProvider.Load(metadataCtx)
		cancelMetadata()
		if metadataErr != nil {
			err = fmt.Errorf("load live CS2 Armory catalogue: %w", metadataErr)
		} else {
			catalog = metadata.ArmoryOffers()
			if len(catalog) == 0 {
				err = fmt.Errorf("live CS2 items_game contained no xpshop redeemable goods")
			} else {
				s.setArmoryLoadingStage(fmt.Sprintf("Building %d Armory offers and tracked item previews", len(catalog)))
				// The tracked image index already resolves catalogue previews. Do not
				// burst hundreds of optional Steam Market searches here: Steam returns
				// HTTP 429 and delays the entire Armory response for up to a minute.
			}
		}
	}
	s.mu.Lock()
	if err != nil {
		s.armory = domain.ArmorySnapshot{Status: "error", Message: err.Error(), RefreshedAt: now(), ItemIDs: []string{}, Offers: []domain.ArmoryOffer{}}
		s.mu.Unlock()
		receipt.State, receipt.Message = "failed", err.Error()
		s.addEvent(receipt, receipt.State, receipt.Message)
		return receipt
	}
	s.armory = armoryFromGC(state, catalog)
	s.mu.Unlock()
	receipt.State, receipt.Message = "completed", "Armory star balance refreshed"
	s.addEvent(receipt, receipt.State, receipt.Message)
	return receipt
}

func (s *Service) setArmoryLoadingStage(message string) {
	s.mu.Lock()
	if s.armory.Status == "loading" {
		s.armory.Message = message
	}
	s.mu.Unlock()
}

func (s *Service) RedeemArmory(input map[string]any) operations.Receipt {
	receipt := s.newReceipt("armory.redeem")
	s.mu.Lock()
	if !s.settings.FeatureFlags.EnableArmoryRedemption {
		s.mu.Unlock()
		receipt.State, receipt.Message = "blocked_by_feature_flag", "Armory purchases are disabled"
		s.addEvent(receipt, receipt.State, receipt.Message)
		return receipt
	}
	if s.settings.ValidationMode {
		s.mu.Unlock()
		receipt.State, receipt.Message = "requires_validation", "disable validation mode only after verifying the live Armory offer"
		s.addEvent(receipt, receipt.State, receipt.Message)
		return receipt
	}
	campaignID, err1 := requiredUint32Input(input, "campaignId")
	redeemID, err2 := requiredUint32Input(input, "redeemId")
	balance, err3 := requiredUint32Input(input, "redeemableBalance")
	cost, err4 := requiredUint32Input(input, "expectedCost")
	generation, err5 := requiredUint32Input(input, "generationTime")
	quantity := uint32(1)
	var quantityErr error
	if _, present := input["quantity"]; present {
		quantity, quantityErr = requiredUint32Input(input, "quantity")
	}
	if err := firstError(err1, err2, err3, err4, err5, quantityErr); err != nil {
		s.mu.Unlock()
		receipt.State, receipt.Message = "failed", err.Error()
		s.addEvent(receipt, receipt.State, receipt.Message)
		return receipt
	}
	if s.connection.State != "connected" || s.armory.Status != "ready" || s.armory.GenerationTime != generation || s.armory.Balance != balance {
		s.mu.Unlock()
		receipt.State, receipt.Message = "failed", "Armory snapshot is stale; refresh before purchasing"
		s.addEvent(receipt, receipt.State, receipt.Message)
		return receipt
	}
	matched := false
	for _, offer := range s.armory.Offers {
		if offer.CampaignID == campaignID && offer.RedeemID == redeemID && offer.ExpectedCost == cost {
			matched = true
			break
		}
	}
	if quantity == 0 || !matched || uint64(cost)*uint64(quantity) > uint64(balance) {
		s.mu.Unlock()
		receipt.State, receipt.Message = "failed", "Armory offer or cost does not match the latest GC snapshot"
		s.addEvent(receipt, receipt.State, receipt.Message)
		return receipt
	}
	pacing := s.settings.ArmoryPurchasePacingSeconds
	if pacing == 0 {
		pacing = 5
	}
	s.mu.Unlock()
	var err error
	for index := uint32(0); index < quantity; index++ {
		prePurchaseBalance := balance - index*cost
		body, marshalErr := proto.Marshal(&cs2pb.CMsgGCCstrike15V2ClientRedeemMissionReward{CampaignId: proto.Uint32(campaignID), RedeemId: proto.Uint32(redeemID), RedeemableBalance: proto.Uint32(prePurchaseBalance), ExpectedCost: proto.Uint32(cost)})
		if marshalErr != nil {
			err = marshalErr
			break
		}
		if err = s.gcClient.SendProtoToGC(context.Background(), protocol.AppIDCS2, protocol.EMsgGCCStrike15V2ClientRedeemMissionReward, body); err != nil {
			break
		}
		if index+1 < quantity {
			time.Sleep(time.Duration(pacing) * time.Second)
		}
	}
	if err != nil {
		receipt.State, receipt.Message = "failed", fmt.Sprintf("Armory purchase send failed: %v", err)
	} else {
		receipt.State, receipt.Message = "awaiting_gc_confirmation", fmt.Sprintf("%d Armory purchase message(s) sent; refresh to reconcile stars and inventory", quantity)
		receipt.Result = map[string]any{"requestEMsg": protocol.EMsgGCCStrike15V2ClientRedeemMissionReward, "campaignId": campaignID, "redeemId": redeemID, "expectedCost": cost, "quantity": quantity, "preBalance": balance, "generationTime": generation, "pacingSeconds": pacing}
	}
	s.addEvent(receipt, receipt.State, receipt.Message)
	return receipt
}

func (s *Service) RefreshInventory() operations.Receipt {
	receipt := s.newReceipt("inventory.refresh")
	s.mu.Lock()
	if s.connection.State != "connected" {
		s.inventory.Status = "requires_connection"
		s.inventory.RefreshedAt = now()
		receipt.State = "requires_connection"
		receipt.Message = "connect a Steam account to load inventory"
		s.operations = append(s.operations, receipt)
		s.events = append(s.events, operations.NewEvent(receipt, receipt.State, receipt.Message))
		s.lastOperation = receipt
		s.mu.Unlock()
		return receipt
	}
	s.inventory.Status = "loading"
	s.inventory.Message = "loading CS2 inventory from Steam Game Coordinator"
	s.inventory.Error = ""
	s.inventory.Diagnostics = nil
	s.inventory.RefreshedAt = now()
	s.mu.Unlock()

	snapshot, err := s.fetchInventory(s.setInventoryLoadingStage)

	s.mu.Lock()
	defer s.mu.Unlock()
	if err != nil {
		s.inventory = inventoryError(err.Error(), transport.DiagnosticsFromError(err))
		receipt.State = "failed"
		receipt.Message = err.Error()
	} else {
		s.inventory = snapshot
		receipt.State = "completed"
		receipt.Message = "inventory refreshed"
	}
	s.operations = append(s.operations, receipt)
	s.events = append(s.events, operations.NewEvent(receipt, receipt.State, receipt.Message))
	s.lastOperation = receipt
	return receipt
}

func (s *Service) SubmitOperation(opType string, input map[string]any) operations.Receipt {
	receipt := s.newReceipt(opType)
	if opType == "settings" {
		if next, ok := input["backendUrl"].(string); ok {
			s.mu.Lock()
			s.settings.BackendURL = next
			s.mu.Unlock()
		}
		if next, ok := input["validationMode"].(bool); ok {
			s.mu.Lock()
			s.settings.ValidationMode = next
			s.mu.Unlock()
		}
		if next, ok := input["sacrificialAccountMode"].(bool); ok {
			s.mu.Lock()
			s.settings.SacrificialAccountMode = next
			s.mu.Unlock()
		}
		if next, ok := input["featureFlags"].(map[string]any); ok {
			s.mu.Lock()
			oldFlags := s.settings.FeatureFlags
			flags := oldFlags
			if value, ok := next["enableStorageMutations"].(bool); ok {
				flags.EnableStorageMutations = value
			}
			if value, ok := next["enableContainerOpening"].(bool); ok {
				flags.EnableContainerOpening = value
			}
			if value, ok := next["enableInventoryDebug"].(bool); ok {
				flags.EnableInventoryDebug = value
			}
			if value, ok := next["showStorageUnitItems"].(bool); ok {
				flags.ShowStorageUnitItems = value
			}
			if value, ok := next["enableProtocolConsole"].(bool); ok {
				flags.EnableProtocolConsole = value
			}
			if value, ok := next["enableTradeups"].(bool); ok {
				flags.EnableTradeups = value
			}
			if value, ok := next["enableStickerExtract"].(bool); ok {
				flags.EnableStickerExtract = value
			}
			if value, ok := next["enableNameTags"].(bool); ok {
				flags.EnableNameTags = value
			}
			if value, ok := next["enableItemDeletion"].(bool); ok {
				flags.EnableItemDeletion = value
			}
			if value, ok := next["enableStatTrakSwap"].(bool); ok {
				flags.EnableStatTrakSwap = value
			}
			if value, ok := next["enableStrangeParts"].(bool); ok {
				flags.EnableStrangeParts = value
			}
			if value, ok := next["enableItemUse"].(bool); ok {
				flags.EnableItemUse = value
			}
			if value, ok := next["enableToolApplication"].(bool); ok {
				flags.EnableToolApplication = value
			}
			if value, ok := next["enableGifting"].(bool); ok {
				flags.EnableGifting = value
			}
			if value, ok := next["enableArmoryRead"].(bool); ok {
				flags.EnableArmoryRead = value
			}
			if value, ok := next["enableArmoryRedemption"].(bool); ok {
				flags.EnableArmoryRedemption = value
			}
			if value, ok := next["enableStoreRead"].(bool); ok {
				flags.EnableStoreRead = value
			}
			if value, ok := next["enableStorePurchases"].(bool); ok {
				flags.EnableStorePurchases = value
			}
			if value, ok := next["enableTf2Inventory"].(bool); ok {
				flags.EnableTF2Inventory = value
			}
			if value, ok := next["enableDota2Inventory"].(bool); ok {
				flags.EnableDota2Inventory = value
			}
			if value, ok := next["enableSteamInventory"].(bool); ok {
				flags.EnableSteamInventory = value
			}
			s.settings.FeatureFlags = flags
			s.gcClient.SetProtocolTracing(flags.EnableProtocolConsole)
			if !flags.EnableTF2Inventory {
				s.clearGameInventoriesLocked("tf2")
			}
			if !flags.EnableDota2Inventory {
				s.clearGameInventoriesLocked("dota2")
			}
			if !flags.EnableSteamInventory {
				s.clearGameInventoriesLocked("steam")
			}
			connected := s.connection.State == "connected"
			s.mu.Unlock()
			if connected && ((oldFlags.EnableTF2Inventory && !flags.EnableTF2Inventory) || (oldFlags.EnableDota2Inventory && !flags.EnableDota2Inventory)) {
				if err := s.gcClient.SetGamesPlayed(context.Background(), enabledPresenceApps(flags)); err != nil {
					receipt.State = "failed"
					receipt.Message = "settings were updated, but disabled game GC presence could not be stopped: " + err.Error()
					s.addEvent(receipt, receipt.State, receipt.Message)
					return receipt
				}
			}
		}
		receipt.State = "completed"
		receipt.Message = "settings updated"
		s.addEvent(receipt, receipt.State, receipt.Message)
		return receipt
	}
	if gameID, _ := input["game"].(string); gameID != "" && gameID != "cs2" {
		receipt.State = "failed"
		receipt.Message = "TF2 and Dota 2 inventory modes are read-only; CS2 mutation endpoints reject non-CS2 items"
		s.addEvent(receipt, receipt.State, receipt.Message)
		return receipt
	}
	if opType == "containers.open" {
		s.mu.Lock()
		if !s.settings.FeatureFlags.EnableContainerOpening {
			receipt.State = "blocked_by_feature_flag"
			receipt.Message = "container opening disabled"
			s.operations = append(s.operations, receipt)
			s.events = append(s.events, operations.NewEvent(receipt, receipt.State, receipt.Message))
			s.lastOperation = receipt
			s.mu.Unlock()
			return receipt
		}
		if s.connection.State != "connected" {
			receipt.State = "failed"
			receipt.Message = "connect a Steam account before opening containers"
			s.operations = append(s.operations, receipt)
			s.events = append(s.events, operations.NewEvent(receipt, receipt.State, receipt.Message))
			s.lastOperation = receipt
			s.mu.Unlock()
			return receipt
		}
		s.mu.Unlock()

		ok, message, result := s.openContainer(input)
		if ok {
			receipt.State = "completed"
		} else {
			receipt.State = "failed"
		}
		receipt.Message = message
		receipt.Result = result
		s.addEvent(receipt, receipt.State, receipt.Message)
		return receipt
	}

	state := "queued"
	message := "queued"
	recognizedMutation := false
	s.mu.Lock()
	if opType == "steam.connect" {
		s.connection.State = "connected"
		s.connection.Detail = "connected"
		state = "completed"
		message = "steam connected"
	} else if opType == "steam.guard" {
		s.connection.State = "connected"
		s.connection.Detail = "guard accepted"
		state = "completed"
		message = "steam guard accepted"
	} else if opType == "steam.disconnect" {
		s.connection.State = "disconnected"
		s.connection.Detail = "disconnected"
		state = "completed"
		message = "steam disconnected"
	} else if stringsHasPrefixAny(opType, "storage.") {
		recognizedMutation = true
		if !s.settings.FeatureFlags.EnableStorageMutations {
			state = "blocked_by_feature_flag"
			message = "storage mutations require feature flag"
		}
	} else if opType == "tradeups.execute" || opType == "tradeups.preview" {
		recognizedMutation = true
		if !s.settings.FeatureFlags.EnableTradeups {
			state = "blocked_by_feature_flag"
			message = "trade-ups disabled"
		} else if s.settings.ValidationMode {
			state = "requires_validation"
			message = "live validation required"
		}
	} else if opType == "stickers.extract" {
		recognizedMutation = true
		if !s.settings.FeatureFlags.EnableStickerExtract {
			state = "blocked_by_feature_flag"
			message = "sticker extract disabled"
		} else if s.settings.ValidationMode {
			state = "requires_validation"
			message = "sticker workflow requires live validation"
		}
	} else if opType == "nametags.apply" || opType == "nametags.remove" {
		recognizedMutation = true
		if !s.settings.FeatureFlags.EnableNameTags {
			state = "blocked_by_feature_flag"
			message = "name tag operations disabled"
		} else if s.connection.State != "connected" {
			state = "awaiting_gc_confirmation"
			message = "awaiting GC confirmation"
		} else {
			var ok bool
			var detail string
			if opType == "nametags.apply" {
				ok, detail = s.applyNameTag(input)
			} else {
				ok, detail = s.removeNameTag(input)
			}
			if ok {
				state = "completed"
				message = detail
			} else {
				state = "failed"
				message = detail
			}
		}
	} else if opType == "items.delete" {
		recognizedMutation = true
		if !s.settings.FeatureFlags.EnableItemDeletion {
			state = "blocked_by_feature_flag"
			message = "item deletion disabled"
		} else if s.settings.ValidationMode {
			state = "requires_validation"
			message = "item deletion requires live validation"
		}
	} else if opType == "stattrak.swap" {
		recognizedMutation = true
		if !s.settings.FeatureFlags.EnableStatTrakSwap {
			state = "blocked_by_feature_flag"
			message = "stattrak swap disabled"
		} else if s.settings.ValidationMode {
			state = "requires_validation"
			message = "stattrak swap requires live validation"
		}
	} else if opType == "strange-parts.apply" {
		recognizedMutation = true
		if !s.settings.FeatureFlags.EnableStrangeParts {
			state = "blocked_by_feature_flag"
			message = "strange part application disabled"
		} else if s.settings.ValidationMode {
			state = "requires_validation"
			message = "strange part application requires live validation"
		}
	} else if opType == "items.use" || opType == "items.use-multiple" {
		recognizedMutation = true
		if !s.settings.FeatureFlags.EnableItemUse {
			state = "blocked_by_feature_flag"
			message = "item use operations disabled"
		} else if s.settings.ValidationMode {
			state = "requires_validation"
			message = "item use requires live validation"
		}
	} else if opType == "tools.apply" || opType == "tools.apply-base" {
		recognizedMutation = true
		if !s.settings.FeatureFlags.EnableToolApplication {
			state = "blocked_by_feature_flag"
			message = "tool application disabled"
		} else if s.settings.ValidationMode {
			state = "requires_validation"
			message = "tool application requires live validation"
		}
	} else if opType == "gifts.send" {
		recognizedMutation = true
		if !s.settings.FeatureFlags.EnableGifting {
			state = "blocked_by_feature_flag"
			message = "gifting disabled"
		} else if s.settings.ValidationMode {
			state = "requires_validation"
			message = "gifting requires live validation"
		}
	}
	if recognizedMutation && state == "queued" {
		state = "awaiting_gc_confirmation"
		message = "awaiting GC confirmation"
	}
	receipt.State = state
	receipt.Message = message
	if receipt.Result == nil {
		if mapping, ok := protocol.OperationMessageMapping(opType); ok {
			receipt.Result = map[string]any{
				"operation":     mapping.Operation,
				"requestEmsg":   mapping.RequestEMsg,
				"requestBody":   mapping.RequestBody,
				"responseEMsgs": mapping.ResponseEMsgs,
				"source":        mapping.Source,
				"status":        mapping.Status,
				"featureFlag":   mapping.FeatureFlag,
				"notes":         mapping.Notes,
			}
		}
	}
	fmt.Printf("[backend] operation=%s state=%s message=%s\n", opType, state, message)
	s.operations = append(s.operations, receipt)
	s.events = append(s.events, operations.NewEvent(receipt, state, message))
	s.lastOperation = receipt
	s.mu.Unlock()
	return receipt
}

func (s *Service) Operations() []operations.Receipt {
	s.mu.Lock()
	defer s.mu.Unlock()
	out := make([]operations.Receipt, len(s.operations))
	copy(out, s.operations)
	return out
}

func (s *Service) Events() []operations.Event {
	s.mu.Lock()
	defer s.mu.Unlock()
	out := make([]operations.Event, len(s.events))
	copy(out, s.events)
	return out
}

func (s *Service) Settings() domain.Settings {
	s.mu.Lock()
	defer s.mu.Unlock()
	return cloneSettings(s.settings)
}

func (s *Service) UpdateSettings(next domain.Settings) domain.Settings {
	if next.ArmoryPurchasePacingSeconds < 1 {
		next.ArmoryPurchasePacingSeconds = 1
	}
	if next.ArmoryPurchasePacingSeconds > 60 {
		next.ArmoryPurchasePacingSeconds = 60
	}
	s.mu.Lock()
	oldFlags := s.settings.FeatureFlags
	s.settings = next
	if !next.FeatureFlags.EnableTF2Inventory {
		s.clearGameInventoriesLocked("tf2")
	}
	if !next.FeatureFlags.EnableDota2Inventory {
		s.clearGameInventoriesLocked("dota2")
	}
	if !next.FeatureFlags.EnableSteamInventory {
		s.clearGameInventoriesLocked("steam")
	}
	connected := s.connection.State == "connected"
	s.mu.Unlock()
	if connected && ((oldFlags.EnableTF2Inventory && !next.FeatureFlags.EnableTF2Inventory) || (oldFlags.EnableDota2Inventory && !next.FeatureFlags.EnableDota2Inventory)) {
		if err := s.gcClient.SetGamesPlayed(context.Background(), enabledPresenceApps(next.FeatureFlags)); err != nil {
			log.Printf("[multi-game] failed to stop disabled game GC presence: %v", err)
		}
	}
	receipt := s.newReceipt("settings")
	s.addEvent(receipt, "completed", "settings updated")
	return s.Settings()
}

func enabledPresenceApps(flags domain.FeatureFlags) []uint32 {
	apps := []uint32{protocol.AppIDCS2}
	if flags.EnableTF2Inventory {
		apps = append(apps, 440)
	}
	if flags.EnableDota2Inventory {
		apps = append(apps, 570)
	}
	return apps
}

func (s *Service) ConnectSteam(input map[string]any) domain.ConnectionStatus {
	username, _ := input["username"].(string)
	password, _ := input["password"].(string)

	if username == "" || password == "" {
		return domain.ConnectionStatus{State: "error", Detail: "Username and password required"}
	}

	if err := s.gcClient.Connect(context.Background()); err != nil {
		s.mu.Lock()
		s.connection = domain.ConnectionStatus{State: "error", Detail: steamErrorDetail("Steam CM connect", err), AccountName: username, Diagnostics: transport.DiagnosticsFromError(err)}
		status := s.connection
		s.mu.Unlock()
		return status
	}
	result, err := s.gcClient.LogOn(context.Background(), transport.LogonCredentials{Username: username, Password: password})
	if err != nil {
		if steamGuardRequired(result.EResult) {
			s.mu.Lock()
			s.pendingUsername = username
			s.pendingPassword = password
			s.connection = domain.ConnectionStatus{State: "needs_steam_guard", Detail: err.Error(), AccountName: username, Diagnostics: transport.DiagnosticsFromError(err)}
			status := s.connection
			ctx, cancel := context.WithCancel(context.Background())
			s.authCancel = cancel
			s.mu.Unlock()
			go s.completeCredentialMobileApproval(ctx, username, password)
			return status
		}
		s.mu.Lock()
		s.connection = domain.ConnectionStatus{State: "error", Detail: steamErrorDetail("Steam CM logon", err), AccountName: username, Diagnostics: transport.DiagnosticsFromError(err)}
		status := s.connection
		s.mu.Unlock()
		return status
	}
	s.mu.Lock()
	presenceApps := enabledPresenceApps(s.settings.FeatureFlags)
	s.mu.Unlock()
	if err := s.gcClient.SetGamesPlayed(context.Background(), presenceApps); err != nil {
		s.mu.Lock()
		s.connection = domain.ConnectionStatus{State: "error", Detail: "Steam game coordinator presence failed: " + err.Error(), AccountName: username}
		status := s.connection
		s.mu.Unlock()
		return status
	}
	s.mu.Lock()
	s.cancelGameRefreshesForAccountChangeLocked(fmt.Sprintf("%d", result.SteamID))
	s.pendingUsername = ""
	s.pendingPassword = ""
	s.connection = domain.ConnectionStatus{State: "connected", Detail: "authenticated Steam CM logon ready for CS2 GC", SteamID: fmt.Sprintf("%d", result.SteamID), AccountName: username}
	s.tradeAccessToken = result.WebAccessToken
	status := s.connection
	s.mu.Unlock()
	s.resolveSteamAvatar(fmt.Sprintf("%d", result.SteamID))
	return status
}

func (s *Service) StartSteamQR() domain.ConnectionStatus {
	if err := s.gcClient.Connect(context.Background()); err != nil {
		return domain.ConnectionStatus{State: "error", Detail: steamErrorDetail("Steam CM connect", err), Diagnostics: transport.DiagnosticsFromError(err)}
	}
	session, err := s.gcClient.BeginQRAuth(context.Background())
	if err != nil {
		return domain.ConnectionStatus{State: "error", Detail: steamErrorDetail("Steam QR login", err), Diagnostics: transport.DiagnosticsFromError(err)}
	}
	ctx, cancel := context.WithCancel(context.Background())
	s.mu.Lock()
	if s.authCancel != nil {
		s.authCancel()
	}
	s.authCancel = cancel
	s.connection = domain.ConnectionStatus{State: "awaiting_qr", Detail: "Scan this QR code with the Steam mobile app", QRChallengeURL: session.ChallengeURL}
	status := s.connection
	s.mu.Unlock()
	go s.completeQRLogin(ctx, session)
	return status
}

func (s *Service) completeQRLogin(ctx context.Context, session transport.QRAuthSession) {
	auth, err := s.gcClient.CompleteQRAuth(ctx, session)
	if err != nil {
		if errors.Is(err, context.Canceled) {
			return
		}
		s.setAuthError("Steam QR login", err)
		return
	}
	result, err := s.gcClient.LogOn(ctx, transport.LogonCredentials{Username: auth.AccountName, AccessToken: auth.RefreshToken, WebAccessToken: auth.AccessToken})
	if err != nil {
		s.setAuthError("Steam QR CM logon", err)
		return
	}
	s.finishSteamLogin(auth.AccountName, result)
}

func (s *Service) completeCredentialMobileApproval(ctx context.Context, username, password string) {
	for {
		result, err := s.gcClient.LogOn(ctx, transport.LogonCredentials{Username: username, Password: password})
		if err == nil {
			s.finishSteamLogin(username, result)
			return
		}
		if errors.Is(err, context.Canceled) || ctx.Err() != nil {
			return
		}
		if steamGuardRequired(result.EResult) {
			continue
		}
		s.setAuthError("Steam Guard approval", err)
		return
	}
}

func (s *Service) finishSteamLogin(username string, result transport.LogonResult) {
	s.mu.Lock()
	presenceApps := enabledPresenceApps(s.settings.FeatureFlags)
	s.mu.Unlock()
	if err := s.gcClient.SetGamesPlayed(context.Background(), presenceApps); err != nil {
		s.setAuthError("Steam game coordinator presence", err)
		return
	}
	s.mu.Lock()
	s.cancelGameRefreshesForAccountChangeLocked(fmt.Sprintf("%d", result.SteamID))
	s.pendingUsername, s.pendingPassword = "", ""
	s.authCancel = nil
	s.connection = domain.ConnectionStatus{State: "connected", Detail: "authenticated Steam CM logon ready for CS2 GC", SteamID: fmt.Sprintf("%d", result.SteamID), AccountName: username}
	s.tradeAccessToken = result.WebAccessToken
	s.mu.Unlock()
	s.resolveSteamAvatar(fmt.Sprintf("%d", result.SteamID))
}

func (s *Service) resolveSteamAvatar(steamID string) {
	resolver := s.profileResolver
	if resolver == nil || steamID == "" {
		return
	}
	go func() {
		ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
		defer cancel()
		avatarURL, err := resolver.AvatarURL(ctx, steamID)
		if err != nil {
			log.Printf("Steam avatar lookup failed for %s: %v", steamID, err)
			return
		}
		s.mu.Lock()
		defer s.mu.Unlock()
		if s.connection.State == "connected" && s.connection.SteamID == steamID {
			s.connection.AvatarURL = avatarURL
		}
	}()
}

func (s *Service) setAuthError(stage string, err error) {
	s.mu.Lock()
	s.connection = domain.ConnectionStatus{State: "error", Detail: steamErrorDetail(stage, err), Diagnostics: transport.DiagnosticsFromError(err)}
	s.authCancel = nil
	s.mu.Unlock()
}

func (s *Service) SubmitSteamGuard(input map[string]any) domain.ConnectionStatus {
	code, _ := input["code"].(string)
	s.mu.Lock()
	if s.pendingUsername == "" || s.pendingPassword == "" {
		s.connection = domain.ConnectionStatus{State: "error", Detail: "No Steam Guard challenge is pending"}
		status := s.connection
		s.mu.Unlock()
		return status
	}
	username := s.pendingUsername
	password := s.pendingPassword
	if s.authCancel != nil {
		s.authCancel()
		s.authCancel = nil
	}
	s.mu.Unlock()

	credentials := transport.LogonCredentials{
		Username: username,
		Password: password,
	}
	if code != "" {
		credentials.AuthCode = code
		credentials.TwoFactorCode = code
	}
	result, err := s.gcClient.LogOn(context.Background(), credentials)

	s.mu.Lock()
	defer s.mu.Unlock()
	if s.pendingUsername == "" || s.pendingPassword == "" {
		// The challenge may have been cancelled while LogOn was in flight. Keep
		// the newer connection state instead of resurrecting the Guard prompt.
		return s.connection
	}
	if err != nil {
		if steamGuardRequired(result.EResult) {
			s.connection = domain.ConnectionStatus{State: "needs_steam_guard", Detail: err.Error(), AccountName: username, Diagnostics: transport.DiagnosticsFromError(err)}
			return s.connection
		}
		s.connection = domain.ConnectionStatus{State: "error", Detail: steamErrorDetail("Steam CM Steam Guard logon", err), AccountName: username, Diagnostics: transport.DiagnosticsFromError(err)}
		return s.connection
	}
	if err := s.gcClient.SetGamesPlayed(context.Background(), enabledPresenceApps(s.settings.FeatureFlags)); err != nil {
		s.connection = domain.ConnectionStatus{State: "error", Detail: "Steam game coordinator presence failed: " + err.Error(), AccountName: username}
		return s.connection
	}
	s.cancelGameRefreshesForAccountChangeLocked(fmt.Sprintf("%d", result.SteamID))
	s.pendingUsername = ""
	s.pendingPassword = ""
	s.connection = domain.ConnectionStatus{State: "connected", Detail: "authenticated Steam CM logon ready for CS2 GC", SteamID: fmt.Sprintf("%d", result.SteamID), AccountName: username}
	s.tradeAccessToken = result.WebAccessToken
	s.resolveSteamAvatar(fmt.Sprintf("%d", result.SteamID))
	return s.connection
}

func (s *Service) cancelGameRefreshesForAccountChangeLocked(nextSteamID string) {
	if s.connection.SteamID != "" && s.connection.SteamID != nextSteamID {
		s.cancelAllGameRefreshesLocked()
	}
}

func (s *Service) DisconnectSteam() domain.ConnectionStatus {
	s.mu.Lock()
	if s.authCancel != nil {
		s.authCancel()
		s.authCancel = nil
	}
	s.connection = domain.ConnectionStatus{State: "disconnected", Detail: "disconnected"}
	s.tradeAccessToken = ""
	s.trades = steamtrade.Snapshot{Status: "requires_connection", Received: []steamtrade.Trade{}, Sent: []steamtrade.Trade{}, History: []steamtrade.Trade{}, RefreshedAt: now()}
	s.inventory = emptyInventory()
	s.clearAllGameInventoriesLocked()
	s.pendingUsername = ""
	s.pendingPassword = ""
	s.mu.Unlock()
	receipt := s.newReceipt("steam.disconnect")
	s.addEvent(receipt, "completed", "steam disconnected")
	return s.ConnectionStatus()
}

func (s *Service) ConnectionStatus() domain.ConnectionStatus {
	s.mu.Lock()
	defer s.mu.Unlock()
	return domain.ConnectionStatus{State: s.connection.State, Detail: s.connection.Detail, SteamID: s.connection.SteamID, AccountName: s.connection.AccountName, AvatarURL: s.connection.AvatarURL, Diagnostics: append([]string(nil), s.connection.Diagnostics...), QRChallengeURL: s.connection.QRChallengeURL}
}

func (s *Service) addEvent(receipt operations.Receipt, state string, message string) {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.operations = append(s.operations, receipt)
	s.events = append(s.events, operations.Event{
		OperationID: receipt.OperationID,
		Type:        receipt.Type,
		State:       state,
		Message:     message,
		CreatedAt:   now(),
	})
	s.lastOperation = receipt
}

func (s *Service) newReceipt(opType string) operations.Receipt {
	receipt := operations.NewReceipt(opType)
	receipt.State = "queued"
	receipt.Message = "queued"
	return receipt
}

func emptyInventory() domain.InventorySnapshot {
	return domain.InventorySnapshot{RefreshedAt: now(), Status: "requires_connection", Items: []domain.InventoryItem{}}
}

func emptyGameInventory(game string, appID uint32) domain.GameInventorySnapshot {
	return domain.GameInventorySnapshot{Game: game, AppID: appID, RefreshedAt: now(), Status: "requires_connection", Items: []domain.EconomyInventoryItem{}, Diagnostics: []string{}}
}

func emptyArmory() domain.ArmorySnapshot {
	return domain.ArmorySnapshot{RefreshedAt: now(), Status: "requires_connection", ItemIDs: []string{}, Offers: []domain.ArmoryOffer{}}
}

func armoryFromGC(state transport.GCArmorySnapshot, catalog []econ.ArmoryOffer) domain.ArmorySnapshot {
	result := domain.ArmorySnapshot{Balance: state.Balance, GenerationTime: state.GenerationTime, RefreshedAt: now(), Status: "ready", ItemIDs: []string{}, Offers: make([]domain.ArmoryOffer, len(catalog)), Diagnostics: append([]string(nil), state.Diagnostics...)}
	for i, id := range state.ItemIDs {
		result.ItemIDs[i] = strconv.FormatUint(id, 10)
	}
	for i, offer := range catalog {
		result.Offers[i] = domain.ArmoryOffer{CampaignID: offer.CampaignID, RedeemID: offer.RedeemID, ExpectedCost: offer.ExpectedCost, GenerationTime: state.GenerationTime, ItemName: offer.ItemName, Name: offer.Name, Category: offer.Category, Items: domainRelatedItems(offer.Items)}
	}
	return result
}

func inventoryError(message string, diagnostics []string) domain.InventorySnapshot {
	return domain.InventorySnapshot{RefreshedAt: now(), Status: "error", Message: message, Error: message, Diagnostics: append([]string(nil), diagnostics...), Items: []domain.InventoryItem{}}
}

func (s *Service) setInventoryLoadingStage(message string) {
	s.mu.Lock()
	if s.inventory.Status == "loading" {
		s.inventory.Message = message
	}
	s.mu.Unlock()
}

func (s *Service) fetchInventory(progress func(string)) (domain.InventorySnapshot, error) {
	report := func(message string) {
		if progress != nil {
			progress(message)
		}
	}
	s.mu.Lock()
	steamID := s.connection.SteamID
	includeDebug := s.settings.FeatureFlags.EnableInventoryDebug
	showStorageUnitItems := s.settings.FeatureFlags.ShowStorageUnitItems
	s.mu.Unlock()
	report("Waiting for CS2 Game Coordinator inventory data")
	gcCtx, cancelGC := context.WithTimeout(context.Background(), 45*time.Second)
	defer cancelGC()
	gcItems, err := s.gcClient.RequestInventory(gcCtx)
	if err != nil {
		return domain.InventorySnapshot{}, fmt.Errorf("CS2 GC inventory request failed: %w", err)
	}
	storageUnitsLoaded := 0
	if showStorageUnitItems {
		for _, item := range gcItems {
			if item.DefIndex != 1201 || item.Attributes[270] == 0 {
				continue
			}
			body, encodeErr := cs2pb.EncodeLoadCasketContents(item.ID)
			if encodeErr != nil {
				return domain.InventorySnapshot{}, fmt.Errorf("encode storage unit %d contents request: %w", item.ID, encodeErr)
			}
			if sendErr := s.gcClient.SendProtoToGC(gcCtx, protocol.AppIDCS2, protocol.EMsgCasketItemLoadContents, body); sendErr != nil {
				return domain.InventorySnapshot{}, fmt.Errorf("load storage unit %d contents: %w", item.ID, sendErr)
			}
			storageUnitsLoaded++
		}
		if storageUnitsLoaded > 0 {
			reloaded, reloadErr := s.gcClient.RequestInventory(gcCtx)
			if reloadErr != nil {
				return domain.InventorySnapshot{}, fmt.Errorf("refresh GC inventory after loading storage units: %w", reloadErr)
			}
			gcItems = mergeGCInventoryItems(gcItems, reloaded)
		}
	}
	report(fmt.Sprintf("Received %d owned items; loading schema and Steam descriptions", len(gcItems)))
	schemaCtx, cancelSchema := context.WithTimeout(context.Background(), 20*time.Second)
	descriptionCtx, cancelDescriptions := context.WithTimeout(context.Background(), 20*time.Second)
	var metadata *econ.Schema
	var schemaErr error
	var descriptions map[string]econ.InventoryDescription
	var descriptionErr error
	var wait sync.WaitGroup
	wait.Add(2)
	go func() {
		defer wait.Done()
		metadata, schemaErr = s.econProvider.Load(schemaCtx)
	}()
	go func() {
		defer wait.Done()
		descriptions, descriptionErr = s.econProvider.LoadInventoryDescriptions(descriptionCtx, steamID)
	}()
	wait.Wait()
	cancelSchema()
	cancelDescriptions()
	err = schemaErr
	if err != nil {
		return domain.InventorySnapshot{}, fmt.Errorf("CS2 item metadata refresh failed: %w", err)
	}
	report("Matching owned items to names, images, collections, and float ranges")
	type pendingItem struct {
		item               transport.GCInventoryItem
		metadata           econ.Metadata
		descriptionMatched bool
		inspectURL         string
	}
	pendingItems := make([]pendingItem, 0, len(gcItems))
	descriptionMatches := 0
	for _, item := range gcItems {
		if item.DefIndex == 0 {
			continue
		}
		if item.Inventory == 0 && (!showStorageUnitItems || gcItemCasketID(item) == 0) {
			continue
		}
		itemMetadata := metadata.Metadata(item.DefIndex, item.PaintKit, item.Attributes)
		descriptionMatched := false
		inspectURL := ""
		if description, ok := descriptionForGCItem(descriptions, item, itemMetadata); ok {
			itemMetadata = itemMetadata.WithInventoryDescription(description)
			descriptionMatched = true
			inspectURL = description.InspectURL
			descriptionMatches++
		}
		itemMetadata.MarketName = instanceMarketName(itemMetadata.MarketName, item)
		pendingItems = append(pendingItems, pendingItem{item: item, metadata: itemMetadata, descriptionMatched: descriptionMatched, inspectURL: inspectURL})
	}
	report("Finalizing inventory; Market prices will load when items are selected")
	marketDescriptions := make(map[string]econ.MarketDescription)
	var marketErr error
	items := make([]domain.InventoryItem, 0, len(pendingItems))
	for _, pending := range pendingItems {
		item := pending.item
		defIndex := item.DefIndex
		itemMetadata := pending.metadata
		itemMetadata.CollectionItems = econ.ApplyRelatedItemDescriptions(itemMetadata.CollectionItems, marketDescriptions)
		itemMetadata.ContainerItems = econ.ApplyRelatedItemDescriptions(itemMetadata.ContainerItems, marketDescriptions)
		marketDescriptionUsed := false
		if itemMetadata.ImageURL == "" || itemMetadata.MarketPrice.SellPriceText == "" {
			if description, ok := marketDescriptions[itemMetadata.MarketName]; ok {
				itemMetadata = itemMetadata.WithMarketDescription(description)
				marketDescriptionUsed = true
			}
		}
		inventoryItem := domain.InventoryItem{
			ID:                    fmt.Sprintf("%d", item.ID),
			Name:                  itemMetadata.Name,
			MarketName:            itemMetadata.MarketName,
			ImageURL:              itemMetadata.ImageURL,
			InspectURL:            pending.inspectURL,
			Kind:                  itemMetadata.Kind,
			Defindex:              &defIndex,
			PaintWearMin:          itemMetadata.PaintWearMin,
			PaintWearMax:          itemMetadata.PaintWearMax,
			Rarity:                itemMetadata.Rarity,
			Collection:            itemMetadata.Collection,
			CollectionItems:       domainRelatedItems(itemMetadata.CollectionItems),
			TradeUpItems:          domainTradeUpItems(itemMetadata.TradeUpItems, item, itemMetadata.PaintWearMin, itemMetadata.PaintWearMax, marketDescriptions),
			ContainerItems:        domainRelatedItems(itemMetadata.ContainerItems),
			ToolType:              itemMetadata.ToolType,
			RequiredKeyDefIndexes: itemMetadata.RequiredKeyDefIndexes,
			IsNameTagTool:         itemMetadata.IsNameTagTool,
			MarketPrice:           itemMetadata.MarketPrice.SellPriceText,
			MarketSalePrice:       itemMetadata.MarketPrice.SalePriceText,
			MarketSellListings:    ptrInt(itemMetadata.MarketPrice.SellListings),
			AppliedItems:          domainAppliedItems(metadata.AppliedItems(item.DefIndex, item.Attributes), itemMetadata.AppliedItemImages),
			// CEconItem quality 9 is Strange/StatTrak and 12 is Tournament/Souvenir.
			IsStatTrak:    item.Quality == 9 || strings.HasPrefix(itemMetadata.MarketName, "StatTrak™"),
			IsSouvenir:    item.Quality == 12 || strings.HasPrefix(itemMetadata.MarketName, "Souvenir"),
			Tradable:      itemMetadata.Tradable,
			Marketable:    itemMetadata.Marketable,
			TradableAfter: itemMetadata.TradableAfter,
		}
		if count := item.Attributes[270]; count > 0 {
			inventoryItem.StorageCount = &count
		}
		if casketID := gcItemCasketID(item); casketID > 0 {
			formatted := strconv.FormatUint(casketID, 10)
			inventoryItem.CasketID = &formatted
		}
		inventoryItem.Exterior = paintExterior(item.PaintWear)
		if itemMetadata.MarketPrice.SellListings == 0 {
			inventoryItem.MarketSellListings = nil
		}
		if item.PaintWear != nil {
			inventoryItem.PaintWear = item.PaintWear
		}
		if item.CustomName != "" {
			inventoryItem.CustomName = item.CustomName
			inventoryItem.HasCustomName = true
		}
		inventoryItem.Diagnostics = inventoryItemDiagnostics(item, itemMetadata, pending.descriptionMatched, marketDescriptionUsed, descriptionErr, marketErr)
		if includeDebug {
			inventoryItem.Debug = debugForGCItem(item, pending.descriptionMatched, marketDescriptionUsed)
		}
		items = append(items, inventoryItem)
	}
	return domain.InventorySnapshot{
		Items:       items,
		Collections: domainCollections(metadata.Collections()),
		RefreshedAt: now(),
		Status:      "ready",
		Diagnostics: append(inventoryMetadataDiagnostics(descriptionErr, marketErr, len(descriptions), descriptionMatches, len(pendingItems)), storageLoadDiagnostic(showStorageUnitItems, storageUnitsLoaded)...),
	}, nil
}

func gcItemCasketID(item transport.GCInventoryItem) uint64 {
	return uint64(item.Attributes[272]) | uint64(item.Attributes[273])<<32
}

func mergeGCInventoryItems(existing, loaded []transport.GCInventoryItem) []transport.GCInventoryItem {
	merged := make(map[uint64]transport.GCInventoryItem, len(existing)+len(loaded))
	for _, item := range existing {
		merged[item.ID] = item
	}
	for _, item := range loaded {
		merged[item.ID] = item
	}
	result := make([]transport.GCInventoryItem, 0, len(merged))
	for _, item := range merged {
		result = append(result, item)
	}
	sort.Slice(result, func(i, j int) bool { return result[i].ID < result[j].ID })
	return result
}

func storageLoadDiagnostic(enabled bool, loaded int) []string {
	if !enabled {
		return nil
	}
	return []string{fmt.Sprintf("Loaded contents from %d populated storage unit(s) into the inventory view.", loaded)}
}

func instanceMarketName(marketName string, item transport.GCInventoryItem) string {
	if item.PaintWear == nil || !strings.Contains(marketName, " | ") {
		return marketName
	}
	if item.Quality == 9 && !strings.HasPrefix(marketName, "StatTrak™ ") {
		marketName = "StatTrak™ " + marketName
	} else if item.Quality == 12 && !strings.HasPrefix(marketName, "Souvenir ") {
		marketName = "Souvenir " + marketName
	}
	exterior := paintExterior(item.PaintWear)
	if exterior != "" && !strings.HasSuffix(marketName, ")") {
		marketName += " (" + exterior + ")"
	}
	return marketName
}

func paintExterior(wear *float64) string {
	if wear == nil {
		return ""
	}
	switch {
	case *wear < 0.07:
		return "Factory New"
	case *wear < 0.15:
		return "Minimal Wear"
	case *wear < 0.38:
		return "Field-Tested"
	case *wear < 0.45:
		return "Well-Worn"
	default:
		return "Battle-Scarred"
	}
}

func domainRelatedItems(items []econ.RelatedItem) []domain.RelatedItem {
	out := make([]domain.RelatedItem, 0, len(items))
	for _, item := range items {
		out = append(out, domain.RelatedItem{Name: item.Name, MarketName: item.MarketName, ListingName: item.ListingName, Kind: item.Kind, Rarity: item.Rarity, ImageURL: item.ImageURL, Price: item.Price, PaintWear: item.PaintWear, WearMin: item.WearMin, WearMax: item.WearMax})
	}
	return out
}

func predictedTradeUpWear(input transport.GCInventoryItem, inputMin *float64, inputMax *float64, outputMin *float64, outputMax *float64) (*float64, bool) {
	if input.PaintWear == nil {
		return nil, false
	}
	inMin, inMax := 0.0, 1.0
	if inputMin != nil {
		inMin = *inputMin
	}
	if inputMax != nil {
		inMax = *inputMax
	}
	normalized := *input.PaintWear
	if inMax > inMin {
		normalized = (*input.PaintWear - inMin) / (inMax - inMin)
	}
	normalized = math.Max(0, math.Min(1, normalized))
	outMin, outMax := 0.0, 1.0
	if outputMin != nil {
		outMin = *outputMin
	}
	if outputMax != nil {
		outMax = *outputMax
	}
	wear := outMin + normalized*(outMax-outMin)
	return &wear, true
}

func tradeUpPreviewMarketNames(items []econ.RelatedItem, input transport.GCInventoryItem, inputMin *float64, inputMax *float64) []string {
	names := make([]string, 0, len(items))
	for _, item := range items {
		wear, ok := predictedTradeUpWear(input, inputMin, inputMax, item.WearMin, item.WearMax)
		if !ok {
			continue
		}
		names = append(names, tradeUpOutcomeMarketName(item.MarketName, input.Quality, wear))
	}
	return names
}

func domainTradeUpItems(items []econ.RelatedItem, input transport.GCInventoryItem, inputMin *float64, inputMax *float64, descriptions map[string]econ.MarketDescription) []domain.RelatedItem {
	out := domainRelatedItems(items)
	for index := range out {
		wear, ok := predictedTradeUpWear(input, inputMin, inputMax, out[index].WearMin, out[index].WearMax)
		if !ok {
			continue
		}
		out[index].PaintWear = wear
		out[index].MarketName = tradeUpOutcomeMarketName(out[index].MarketName, input.Quality, wear)
		if description, ok := descriptions[out[index].MarketName]; ok {
			out[index].ImageURL = firstNonEmptyApp(out[index].ImageURL, description.IconURLLarge, description.IconURL)
			out[index].Price = description.Price.SellPriceText
			out[index].ListingName = firstNonEmptyApp(description.HashName, description.MarketHashName, description.MarketName)
		}
	}
	return out
}

func tradeUpOutcomeMarketName(baseName string, inputQuality uint32, wear *float64) string {
	if inputQuality == 9 && !strings.HasPrefix(baseName, "StatTrak™ ") {
		baseName = "StatTrak™ " + baseName
	}
	return fmt.Sprintf("%s (%s)", baseName, paintExterior(wear))
}

func firstNonEmptyApp(values ...string) string {
	for _, value := range values {
		if strings.TrimSpace(value) != "" {
			return value
		}
	}
	return ""
}

func tradeUpItemsForInput(items []econ.RelatedItem, input transport.GCInventoryItem, inputMin *float64, inputMax *float64) []econ.RelatedItem {
	out := append([]econ.RelatedItem(nil), items...)
	if input.PaintWear == nil {
		return out
	}
	min, max := 0.0, 1.0
	if inputMin != nil {
		min = *inputMin
	}
	if inputMax != nil {
		max = *inputMax
	}
	normalized := *input.PaintWear
	if max > min {
		normalized = (*input.PaintWear - min) / (max - min)
	}
	normalized = math.Max(0, math.Min(1, normalized))
	for index := range out {
		outputMin, outputMax := 0.0, 1.0
		if out[index].WearMin != nil {
			outputMin = *out[index].WearMin
		}
		if out[index].WearMax != nil {
			outputMax = *out[index].WearMax
		}
		wear := outputMin + normalized*(outputMax-outputMin)
		out[index].PaintWear = &wear
		out[index].MarketName = tradeUpOutcomeMarketName(out[index].MarketName, input.Quality, &wear)
	}
	return out
}

func domainAppliedItems(items []econ.AppliedItem, images []string) []domain.AppliedItem {
	out := make([]domain.AppliedItem, 0, len(items))
	for _, item := range items {
		slot, id := item.Slot, item.ID
		imageURL := ""
		if len(images) > len(out) {
			imageURL = images[len(out)]
		}
		var slotPointer *uint32
		if item.Kind != "charm" {
			slotPointer = &slot
		}
		out = append(out, domain.AppliedItem{Kind: item.Kind, Slot: slotPointer, ID: &id, Name: item.Name, ImageURL: imageURL})
	}
	return out
}

func descriptionForGCItem(descriptions map[string]econ.InventoryDescription, item transport.GCInventoryItem, metadata econ.Metadata) (econ.InventoryDescription, bool) {
	if len(descriptions) == 0 {
		return econ.InventoryDescription{}, false
	}
	keys := []uint64{item.ID, item.OriginalID}
	for _, key := range keys {
		if key == 0 {
			continue
		}
		if description, ok := descriptions[fmt.Sprintf("%d", key)]; ok {
			return description, true
		}
	}
	for _, name := range []string{metadata.MarketName, metadata.Name} {
		key := "name:" + strings.ToLower(strings.TrimSpace(name))
		if description, ok := descriptions[key]; ok {
			if _, ambiguous := descriptions["ambiguous:"+key]; !ambiguous {
				return description, true
			}
		}
	}
	return econ.InventoryDescription{}, false
}

func debugForGCItem(item transport.GCInventoryItem, descriptionMatched bool, marketDescriptionUsed bool) *domain.ItemDebug {
	attributes := make(map[string]uint32, len(item.Attributes))
	for key, value := range item.Attributes {
		attributes[fmt.Sprintf("%d", key)] = value
	}
	return &domain.ItemDebug{
		GCID:                  fmt.Sprintf("%d", item.ID),
		GCOriginalID:          fmt.Sprintf("%d", item.OriginalID),
		GCDefIndex:            item.DefIndex,
		GCInventory:           item.Inventory,
		GCQuantity:            item.Quantity,
		GCQuality:             item.Quality,
		GCRarity:              item.Rarity,
		GCPaintKit:            item.PaintKit,
		DescriptionMatched:    descriptionMatched,
		MarketDescriptionUsed: marketDescriptionUsed,
		Attributes:            attributes,
	}
}

func inventoryItemDiagnostics(item transport.GCInventoryItem, metadata econ.Metadata, descriptionMatched bool, marketDescriptionUsed bool, descriptionErr error, marketErr error) []string {
	diagnostics := []string{fmt.Sprintf(
		"GC identity: id=%d, original_id=%d, defindex=%d, inventory=%d, quantity=%d, quality=%d, rarity=%d, paint_kit=%d",
		item.ID, item.OriginalID, item.DefIndex, item.Inventory, item.Quantity, item.Quality, item.Rarity, item.PaintKit,
	)}
	if item.PaintWear != nil {
		diagnostics = append(diagnostics, fmt.Sprintf("GC instance: paint_wear=%.10f, custom_name=%q", *item.PaintWear, item.CustomName))
	} else {
		diagnostics = append(diagnostics, fmt.Sprintf("GC instance: paint_wear=unset, custom_name=%q", item.CustomName))
	}
	attributeIDs := make([]int, 0, len(item.Attributes))
	for id := range item.Attributes {
		attributeIDs = append(attributeIDs, int(id))
	}
	sort.Ints(attributeIDs)
	if len(attributeIDs) == 0 {
		diagnostics = append(diagnostics, "GC attributes: none decoded")
	} else {
		attributes := make([]string, 0, len(attributeIDs))
		for _, id := range attributeIDs {
			attributes = append(attributes, fmt.Sprintf("%d=%d (0x%08x)", id, item.Attributes[uint32(id)], item.Attributes[uint32(id)]))
		}
		diagnostics = append(diagnostics, "GC attributes: "+strings.Join(attributes, ", "))
	}
	diagnostics = append(diagnostics, fmt.Sprintf(
		"Schema result: name=%q, market_name=%q, kind=%q, rarity=%q, tool_type=%q, collection=%q, tradable=%s, name_tag_tool=%t, wear_min=%s, wear_max=%s",
		metadata.Name, metadata.MarketName, metadata.Kind, metadata.Rarity, metadata.ToolType, metadata.Collection, optionalBool(metadata.Tradable), metadata.IsNameTagTool, optionalFloatString(metadata.PaintWearMin), optionalFloatString(metadata.PaintWearMax),
	))
	diagnostics = append(diagnostics, fmt.Sprintf(
		"Schema relationships: collection_items=%d, container_items=%d; applied_item_images=%d",
		len(metadata.CollectionItems), len(metadata.ContainerItems), len(metadata.AppliedItemImages),
	))
	if descriptionErr != nil {
		diagnostics = append(diagnostics, fmt.Sprintf("Steam inventory description: unavailable: %v", descriptionErr))
	} else if descriptionMatched {
		diagnostics = append(diagnostics, "Steam inventory description: matched by GC asset id or original id")
	} else {
		diagnostics = append(diagnostics, "Steam inventory description: no match; displayed identity is schema-only and may be phantom or misclassified")
	}
	marketStatus := "not used"
	if marketDescriptionUsed {
		marketStatus = "used"
	}
	if marketErr != nil {
		marketStatus = fmt.Sprintf("unavailable: %v", marketErr)
	}
	diagnostics = append(diagnostics, fmt.Sprintf(
		"Steam market overlay: %s; image lookup: source=%q, tracker_key=%q, image_url=%q",
		marketStatus, metadata.ImageSource, metadata.ImageKey, metadata.ImageURL,
	))
	diagnostics = append(diagnostics, fmt.Sprintf(
		"Market result: sell_price=%d, sell_price_text=%q, sale_price_text=%q, sell_listings=%d, tradable_after=%q",
		metadata.MarketPrice.SellPrice, metadata.MarketPrice.SellPriceText, metadata.MarketPrice.SalePriceText, metadata.MarketPrice.SellListings, metadata.TradableAfter,
	))
	return diagnostics
}

func optionalBool(value *bool) string {
	if value == nil {
		return "unset"
	}
	return strconv.FormatBool(*value)
}

func optionalFloatString(value *float64) string {
	if value == nil {
		return "unset"
	}
	return strconv.FormatFloat(*value, 'f', -1, 64)
}

func inventoryMetadataDiagnostics(descriptionErr error, marketErr error, descriptionCount int, descriptionMatches int, itemCount int) []string {
	var diagnostics []string
	if descriptionErr != nil {
		diagnostics = append(diagnostics, fmt.Sprintf("Steam inventory description metadata unavailable: %v", descriptionErr))
	} else if itemCount > 0 && descriptionMatches == 0 {
		diagnostics = append(diagnostics, fmt.Sprintf("Steam inventory description metadata returned %d descriptions but matched 0/%d GC items by asset id or original id", descriptionCount, itemCount))
	} else if itemCount > 0 && descriptionMatches < itemCount {
		diagnostics = append(diagnostics, fmt.Sprintf("Steam inventory description metadata matched %d/%d GC items by asset id or original id", descriptionMatches, itemCount))
	}
	if marketErr != nil {
		diagnostics = append(diagnostics, fmt.Sprintf("Steam market metadata unavailable: %v", marketErr))
	}
	if len(diagnostics) == 0 {
		return nil
	}
	return diagnostics
}

func steamGuardRequired(result int32) bool {
	switch steamlang.EResult(result) {
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

func steamErrorDetail(stage string, err error) string {
	if err == nil {
		return ""
	}
	if errors.Is(err, context.DeadlineExceeded) {
		return fmt.Sprintf("%s timed out: %v", stage, err)
	}
	return err.Error()
}

type containerOpenResult struct {
	OpenedItem      *domain.InventoryItem `json:"openedItem,omitempty"`
	ConsumedItemID  string                `json:"consumedItemId,omitempty"`
	RequestEMsg     uint32                `json:"requestEMsg,omitempty"`
	RequestMethod   string                `json:"requestMethod,omitempty"`
	RequestBodyHex  string                `json:"requestBodyHex,omitempty"`
	Confirmation    string                `json:"confirmation,omitempty"`
	ResponseEMsg    uint32                `json:"responseEMsg,omitempty"`
	ResponseBodyHex string                `json:"responseBodyHex,omitempty"`
	BeforeItemCount int                   `json:"beforeItemCount,omitempty"`
	AfterItemCount  int                   `json:"afterItemCount,omitempty"`
	Diagnostics     []string              `json:"diagnostics,omitempty"`
}

func (s *Service) openContainer(input map[string]any) (bool, string, *containerOpenResult) {
	itemID, _ := input["itemId"].(string)
	result := &containerOpenResult{ConsumedItemID: itemID}
	if itemID == "" {
		return false, "container item id is required", result
	}
	itemIDUint, err := strconv.ParseUint(itemID, 10, 64)
	if err != nil || itemIDUint == 0 {
		return false, "container item id must be a valid Steam item id", result
	}
	s.mu.Lock()
	beforeInventory := cloneInventory(s.inventory)
	s.mu.Unlock()
	result.BeforeItemCount = len(beforeInventory.Items)
	var found *domain.InventoryItem
	for i := range beforeInventory.Items {
		if beforeInventory.Items[i].ID == itemID {
			found = &beforeInventory.Items[i]
			break
		}
	}
	if found == nil {
		return false, "container is not present in the current owned inventory snapshot", result
	}
	if !isContainerLikeInventoryItem(*found) {
		return false, "selected item is not a container or capsule", result
	}
	toolItemID, err := optionalUint64Input(input, "keyItemId")
	if err != nil {
		return false, err.Error(), result
	}
	if len(found.RequiredKeyDefIndexes) > 0 && toolItemID == 0 {
		return false, "this container requires a compatible key, but none is owned", result
	}
	if len(found.RequiredKeyDefIndexes) == 0 && toolItemID != 0 {
		return false, "this container is keyless and must be opened without a key/tool", result
	}
	if toolItemID != 0 {
		if toolItemID == itemIDUint {
			return false, "opening key/tool must be different from the container", result
		}
		var tool *domain.InventoryItem
		for i := range beforeInventory.Items {
			candidateID, parseErr := strconv.ParseUint(beforeInventory.Items[i].ID, 10, 64)
			if parseErr == nil && candidateID == toolItemID {
				tool = &beforeInventory.Items[i]
				break
			}
		}
		if tool == nil {
			return false, "opening key/tool is not present in the current owned inventory snapshot", result
		}
		compatible := false
		if tool.Defindex != nil {
			for _, defIndex := range found.RequiredKeyDefIndexes {
				if *tool.Defindex == defIndex {
					compatible = true
					break
				}
			}
		}
		if !compatible {
			return false, "selected opening key is not compatible with this container", result
		}
	}
	result.RequestEMsg = protocol.EMsgOpenCrate
	result.RequestMethod = "open_crate_proto"
	body, err := proto.Marshal(&cs2pb.CMsgOpenCrate{
		ToolItemId:    proto.Uint64(toolItemID),
		SubjectItemId: proto.Uint64(itemIDUint),
	})
	if err != nil {
		return false, "encode container open request failed: " + err.Error(), result
	}
	result.RequestBodyHex = hex.EncodeToString(body)
	ctx, cancel := context.WithTimeout(context.Background(), 8*time.Second)
	defer cancel()
	if err := s.gcClient.SendProtoToGC(ctx, protocol.AppIDCS2, protocol.EMsgOpenCrate, body); err != nil {
		return false, "send container open request failed: " + err.Error(), result
	}
	confirmation := s.waitForContainerOpenConfirmation(ctx, itemIDUint)
	result.Confirmation = confirmation.Message
	result.ResponseEMsg = confirmation.EMsg
	result.ResponseBodyHex = confirmation.BodyHex
	result.Diagnostics = confirmation.Diagnostics
	if confirmation.Err != nil {
		return false, confirmation.Err.Error(), result
	}
	if snapshot, openedItem, err := s.reconcileContainerOpenOnce(beforeInventory); err == nil && openedItem != nil {
		result.AfterItemCount = len(snapshot.Items)
		result.OpenedItem = openedItem
		snapshot.Message = fmt.Sprintf("Container opened: %s", openedInventoryItemName(openedItem))
		s.mu.Lock()
		s.inventory = snapshot
		s.mu.Unlock()
		return true, snapshot.Message, result
	} else if err != nil {
		result.Diagnostics = append(result.Diagnostics, err.Error())
	}
	return false, "container open response received, but the awarded item could not be decoded from GC response", result
}

func (s *Service) reconcileContainerOpenOnce(before domain.InventorySnapshot) (domain.InventorySnapshot, *domain.InventoryItem, error) {
	beforeIDs := make(map[string]struct{}, len(before.Items))
	for _, item := range before.Items {
		beforeIDs[item.ID] = struct{}{}
	}
	snapshot, err := s.fetchInventory(nil)
	if err != nil {
		return domain.InventorySnapshot{}, nil, fmt.Errorf("post-open inventory refresh failed: %w", err)
	}
	for i := range snapshot.Items {
		if _, existed := beforeIDs[snapshot.Items[i].ID]; !existed {
			return snapshot, &snapshot.Items[i], nil
		}
	}
	return snapshot, nil, fmt.Errorf("post-open inventory refresh found no new item; before_count=%d after_count=%d", len(before.Items), len(snapshot.Items))
}

func openedInventoryItemName(item *domain.InventoryItem) string {
	if item == nil {
		return "unknown item"
	}
	if item.MarketName != "" {
		return item.MarketName
	}
	if item.Name != "" {
		return item.Name
	}
	if item.Defindex != nil {
		return fmt.Sprintf("CS2 item #%d", *item.Defindex)
	}
	return item.ID
}

func isContainerLikeInventoryItem(item domain.InventoryItem) bool {
	haystack := strings.ToLower(item.Kind + " " + item.Name + " " + item.MarketName)
	return item.Kind == "container" || strings.Contains(haystack, "capsule") || strings.Contains(haystack, "case") || strings.Contains(haystack, "container")
}

func optionalUint64Input(input map[string]any, key string) (uint64, error) {
	value, ok := input[key]
	if !ok || value == nil {
		return 0, nil
	}
	switch typed := value.(type) {
	case string:
		if strings.TrimSpace(typed) == "" {
			return 0, nil
		}
		parsed, err := strconv.ParseUint(typed, 10, 64)
		if err != nil {
			return 0, fmt.Errorf("%s must be a valid Steam item id", key)
		}
		return parsed, nil
	case float64:
		if typed < 0 || typed != float64(uint64(typed)) {
			return 0, fmt.Errorf("%s must be a valid Steam item id", key)
		}
		return uint64(typed), nil
	default:
		return 0, fmt.Errorf("%s must be a string item id", key)
	}
}

func requiredUint32Input(input map[string]any, key string) (uint32, error) {
	value, ok := input[key]
	if !ok {
		return 0, fmt.Errorf("%s is required", key)
	}
	var parsed uint64
	var err error
	switch v := value.(type) {
	case float64:
		if v < 0 || v != float64(uint64(v)) {
			return 0, fmt.Errorf("%s must be an unsigned integer", key)
		}
		parsed = uint64(v)
	case string:
		parsed, err = strconv.ParseUint(v, 10, 32)
	default:
		return 0, fmt.Errorf("%s must be an unsigned integer", key)
	}
	if err != nil || parsed > uint64(^uint32(0)) {
		return 0, fmt.Errorf("%s must fit uint32", key)
	}
	return uint32(parsed), nil
}

func firstError(errors ...error) error {
	for _, err := range errors {
		if err != nil {
			return err
		}
	}
	return nil
}

type containerOpenConfirmation struct {
	EMsg        uint32
	Message     string
	BodyHex     string
	Diagnostics []string
	Err         error
}

func (s *Service) waitForContainerOpenConfirmation(ctx context.Context, itemID uint64) containerOpenConfirmation {
	timeout := time.NewTimer(8 * time.Second)
	defer timeout.Stop()
	observed := make([]string, 0, 8)
	for {
		select {
		case <-ctx.Done():
			return containerOpenConfirmation{Err: fmt.Errorf("container open request timed out waiting for CS2 GC response: %w%s", ctx.Err(), formatObservedGCMessages(observed))}
		case <-timeout.C:
			return containerOpenConfirmation{Err: fmt.Errorf("container open request sent but CS2 GC did not confirm before timeout%s", formatObservedGCMessages(observed))}
		case event := <-s.gcClient.Events():
			if event.Type != "gc.message" {
				continue
			}
			message, ok := event.Payload.(transport.GCMessage)
			if !ok || message.AppID != protocol.AppIDCS2 {
				continue
			}
			observed = append(observed, fmt.Sprintf("emsg=%d bytes=%d", message.EMsg, len(message.Body)))
			if message.EMsg == protocol.EMsgUnlockCrateResponse {
				confirmation := containerOpenConfirmation{
					EMsg:        message.EMsg,
					Message:     "CS2 GC sent unlock crate response",
					BodyHex:     hex.EncodeToString(message.Body),
					Diagnostics: append([]string(nil), observed...),
				}
				confirmation.Err = fmt.Errorf("CS2 GC unlock crate response received, but no generated protobuf schema is available for response body: emsg=%d body_hex=%s", message.EMsg, confirmation.BodyHex)
				return confirmation
			}
			if message.EMsg == protocol.EMsgItemCustomizationNotification {
				notification := new(cs2pb.CMsgGCItemCustomizationNotification)
				if err := proto.Unmarshal(message.Body, notification); err != nil {
					return containerOpenConfirmation{EMsg: message.EMsg, BodyHex: hex.EncodeToString(message.Body), Diagnostics: append([]string(nil), observed...), Err: fmt.Errorf("container open response decode failed: %w", err)}
				}
				switch notification.GetRequest() {
				case protocol.CustomizationUnlockCrate:
					return containerOpenConfirmation{EMsg: message.EMsg, Message: "CS2 GC confirmed container unlock", BodyHex: hex.EncodeToString(message.Body), Diagnostics: append([]string(nil), observed...)}
				case protocol.CustomizationXRayItemReveal:
					return containerOpenConfirmation{EMsg: message.EMsg, Message: "CS2 GC confirmed container reveal", BodyHex: hex.EncodeToString(message.Body), Diagnostics: append([]string(nil), observed...)}
				case protocol.CustomizationXRayItemClaim:
					return containerOpenConfirmation{EMsg: message.EMsg, Message: "CS2 GC confirmed container claim", BodyHex: hex.EncodeToString(message.Body), Diagnostics: append([]string(nil), observed...)}
				}
				for _, id := range notification.GetItemId() {
					if id == itemID {
						return containerOpenConfirmation{EMsg: message.EMsg, Message: fmt.Sprintf("CS2 GC accepted container open request request=%d", notification.GetRequest()), BodyHex: hex.EncodeToString(message.Body), Diagnostics: append([]string(nil), observed...)}
					}
				}
				return containerOpenConfirmation{EMsg: message.EMsg, Message: fmt.Sprintf("CS2 GC sent item customization notification request=%d", notification.GetRequest()), BodyHex: hex.EncodeToString(message.Body), Diagnostics: append([]string(nil), observed...)}
			}
			if message.EMsg == protocol.EMsgGCClientWelcome {
				return containerOpenConfirmation{EMsg: message.EMsg, Message: "CS2 GC sent inventory update after container open request", BodyHex: hex.EncodeToString(message.Body), Diagnostics: append([]string(nil), observed...)}
			}
		}
	}
}

func formatObservedGCMessages(observed []string) string {
	if len(observed) == 0 {
		return "; observed_gc_messages=none"
	}
	return "; observed_gc_messages=" + strings.Join(observed, ",")
}

func (s *Service) applyNameTag(input map[string]any) (bool, string) {
	subjectItemID, _ := input["subjectItemId"].(string)
	toolItemID, _ := input["toolItemId"].(string)
	name, _ := input["name"].(string)
	if subjectItemID == "" || toolItemID == "" || name == "" {
		return false, "subject item, name tag tool, and custom name are required"
	}
	toolFound := false
	for _, item := range s.inventory.Items {
		if item.ID == toolItemID && item.IsNameTagTool {
			toolFound = true
			break
		}
	}
	if !toolFound {
		return false, "no usable name tag tool found in the current inventory"
	}
	for i := range s.inventory.Items {
		if s.inventory.Items[i].ID == subjectItemID {
			s.inventory.Items[i].CustomName = name
			s.inventory.Items[i].HasCustomName = true
			s.inventory.Items[i].MarketName = s.inventory.Items[i].MarketName
			s.inventory.RefreshedAt = now()
			return true, "custom name applied"
		}
	}
	return false, "target item not found"
}

func (s *Service) removeNameTag(input map[string]any) (bool, string) {
	itemID, _ := input["itemId"].(string)
	if itemID == "" {
		return false, "item id is required"
	}
	for i := range s.inventory.Items {
		if s.inventory.Items[i].ID == itemID {
			if !s.inventory.Items[i].HasCustomName {
				return false, "selected item does not have a custom name"
			}
			s.inventory.Items[i].CustomName = ""
			s.inventory.Items[i].HasCustomName = false
			s.inventory.RefreshedAt = now()
			return true, "custom name removed"
		}
	}
	return false, "target item not found"
}

func defaultSettings() domain.Settings {
	return domain.Settings{
		BackendURL:                  "http://127.0.0.1:7331",
		ValidationMode:              true,
		SacrificialAccountMode:      true,
		Animations:                  domain.AnimationSettings{Container: "slot-machine", TradeUp: "slot-machine", Armory: "slot-machine"},
		ArmoryPurchasePacingSeconds: 5,
		FeatureFlags: domain.FeatureFlags{
			EnableStorageMutations: true,
			EnableContainerOpening: true,
			EnableInventoryDebug:   false,
			ShowStorageUnitItems:   false,
			EnableProtocolConsole:  true,
			EnableTradeups:         false,
			EnableStickerExtract:   false,
			EnableNameTags:         false,
			EnableItemDeletion:     false,
			EnableStatTrakSwap:     false,
			EnableStrangeParts:     false,
			EnableItemUse:          false,
			EnableToolApplication:  false,
			EnableGifting:          false,
			EnableArmoryRead:       true,
			EnableArmoryRedemption: false,
			EnableStoreRead:        true,
			EnableStorePurchases:   true,
			EnableTF2Inventory:     true,
			EnableSteamInventory:   true,
		},
	}
}

func emptyStore() domain.StoreSnapshot {
	return domain.StoreSnapshot{Status: "requires_connection", Offers: []domain.StoreOffer{}, RefreshedAt: now(), Message: "Connect Steam to load the CS2 cash store."}
}
func cloneStore(store domain.StoreSnapshot) domain.StoreSnapshot {
	offers := make([]domain.StoreOffer, len(store.Offers))
	copy(offers, store.Offers)
	store.Offers = offers
	store.Diagnostics = append([]string(nil), store.Diagnostics...)
	return store
}
func steamCurrencyCode(id int32) string {
	// CS2's economy-store ECurrency values deliberately differ from Steam's
	// public ECurrencyCode values. These are the GC store IDs.
	codes := map[int32]string{0: "USD", 1: "GBP", 2: "EUR", 3: "RUB", 4: "BRL", 8: "JPY", 9: "NOK", 10: "IDR", 11: "MYR", 12: "PHP", 13: "SGD", 14: "THB", 15: "VND", 16: "KRW", 17: "TRY", 18: "UAH", 19: "MXN", 20: "CAD", 21: "AUD", 22: "NZD", 23: "PLN", 24: "CHF", 25: "CNY", 26: "TWD", 27: "HKD", 28: "INR", 29: "AED", 30: "SAR", 31: "ZAR", 32: "COP", 33: "PEN", 34: "CLP"}
	if code := codes[id]; code != "" {
		return code
	}
	return fmt.Sprintf("CURRENCY_%d", id)
}
func steamCurrencyID(code string) int32 {
	for id := int32(0); id <= 34; id++ {
		if steamCurrencyCode(id) == code {
			return id
		}
	}
	return 0
}
func formatStoreAmount(currency string, amount uint64) string {
	symbols := map[string]string{"USD": "$", "GBP": "£", "EUR": "€", "AUD": "A$", "CAD": "C$", "NZD": "NZ$", "JPY": "¥"}
	symbol := symbols[currency]
	if currency == "JPY" {
		return fmt.Sprintf("%s%d", symbol, amount)
	}
	if symbol != "" {
		return fmt.Sprintf("%s%d.%02d", symbol, amount/100, amount%100)
	}
	return fmt.Sprintf("%s %d.%02d", currency, amount/100, amount%100)
}
func stringInput(input map[string]any, key string) string {
	value, _ := input[key].(string)
	return strings.TrimSpace(value)
}
func requiredUint64Input(input map[string]any, key string) (uint64, error) {
	value, ok := input[key]
	if !ok {
		return 0, fmt.Errorf("%s is required", key)
	}
	switch typed := value.(type) {
	case float64:
		if typed < 0 || typed > math.MaxUint64 || typed != math.Trunc(typed) {
			return 0, fmt.Errorf("%s must be an unsigned integer", key)
		}
		return uint64(typed), nil
	case uint64:
		return typed, nil
	case uint32:
		return uint64(typed), nil
	case int:
		if typed >= 0 {
			return uint64(typed), nil
		}
	case string:
		parsed, err := strconv.ParseUint(typed, 10, 64)
		if err == nil {
			return parsed, nil
		}
	}
	return 0, fmt.Errorf("%s must be an unsigned integer", key)
}
func newID() string { return strconv.FormatInt(time.Now().UnixNano(), 36) }

func cloneInventory(inventory domain.InventorySnapshot) domain.InventorySnapshot {
	items := make([]domain.InventoryItem, len(inventory.Items))
	copy(items, inventory.Items)
	return domain.InventorySnapshot{Items: items, Collections: append([]domain.Collection(nil), inventory.Collections...), RefreshedAt: inventory.RefreshedAt, Status: inventory.Status, Message: inventory.Message, Error: inventory.Error, Diagnostics: append([]string(nil), inventory.Diagnostics...)}
}

func domainCollections(collections []econ.Collection) []domain.Collection {
	result := make([]domain.Collection, 0, len(collections))
	for _, collection := range collections {
		result = append(result, domain.Collection{Name: collection.Name, Items: domainRelatedItems(collection.Items)})
	}
	return result
}

func cloneGameInventory(inventory domain.GameInventorySnapshot) domain.GameInventorySnapshot {
	items := make([]domain.EconomyInventoryItem, len(inventory.Items))
	for index, item := range inventory.Items {
		items[index] = item
		items[index].Tags = append([]domain.EconomyTag(nil), item.Tags...)
		items[index].Descriptions = append([]string(nil), item.Descriptions...)
		items[index].Details.Attributes = make(map[string]uint32, len(item.Details.Attributes))
		for key, value := range item.Details.Attributes {
			items[index].Details.Attributes[key] = value
		}
		items[index].Details.AttributeBytes = make(map[string]string, len(item.Details.AttributeBytes))
		for key, value := range item.Details.AttributeBytes {
			items[index].Details.AttributeBytes[key] = value
		}
		items[index].Details.EquippedStates = append([]domain.EquippedState(nil), item.Details.EquippedStates...)
		items[index].Details.UsableClasses = append([]string(nil), item.Details.UsableClasses...)
		if item.Details.Capabilities != nil {
			items[index].Details.Capabilities = make(map[string]string, len(item.Details.Capabilities))
			for key, value := range item.Details.Capabilities {
				items[index].Details.Capabilities[key] = value
			}
		}
	}
	inventory.Items = items
	inventory.Diagnostics = append([]string{}, inventory.Diagnostics...)
	return inventory
}

func cloneArmory(armory domain.ArmorySnapshot) domain.ArmorySnapshot {
	// Keep API collections as [] instead of null so clients can safely render
	// empty Armory snapshots, including partially initialized GC state.
	armory.ItemIDs = append([]string{}, armory.ItemIDs...)
	armory.Offers = append([]domain.ArmoryOffer{}, armory.Offers...)
	armory.Diagnostics = append([]string(nil), armory.Diagnostics...)
	return armory
}

func cloneSettings(settings domain.Settings) domain.Settings {
	return domain.Settings{BackendURL: settings.BackendURL, ValidationMode: settings.ValidationMode, SacrificialAccountMode: settings.SacrificialAccountMode, FeatureFlags: settings.FeatureFlags, Animations: settings.Animations, ArmoryPurchasePacingSeconds: settings.ArmoryPurchasePacingSeconds}
}

func ptrUint32(value uint32) *uint32 { return &value }

func ptrInt(value int) *int { return &value }

func stringsHasPrefixAny(value string, prefixes ...string) bool {
	for _, prefix := range prefixes {
		if len(value) >= len(prefix) && value[:len(prefix)] == prefix {
			return true
		}
	}
	return false
}

func now() string {
	return time.Now().UTC().Format(time.RFC3339Nano)
}

func UnsupportedProtocolError(operation string) error {
	return fmt.Errorf("%s is scaffolded but not wired to Steam GC yet", operation)
}
