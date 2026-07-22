package app

import (
	"context"
	"errors"
	"fmt"
	"math"
	"strconv"
	"strings"
	"time"

	"cs-inv-edit/backend/internal/domain"
	"cs-inv-edit/backend/internal/econ"
	"cs-inv-edit/backend/internal/operations"
	"cs-inv-edit/backend/internal/protocol"
	"cs-inv-edit/backend/internal/transport"
)

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
	err := s.ensureGCSession(welcomeCtx, protocol.AppIDCS2)
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
	var result transport.StorePurchaseTransportResult
	err := s.ensureGCSession(ctx, protocol.AppIDCS2)
	if err == nil {
		result, err = s.gcClient.InitializeStorePurchase(ctx, purchaseRequest)
	} else {
		err = fmt.Errorf("CS2 GC session is not ready; store purchase was not sent: %w", err)
	}
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
