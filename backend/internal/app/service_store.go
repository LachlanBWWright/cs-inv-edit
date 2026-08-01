package app

import (
	"context"
	"errors"
	"fmt"
	"log"
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
	if s.connection.State == domain.ConnectionStateConnected && s.store.Status == "requires_connection" {
		store := cloneStore(s.store)
		store.Message = "Steam is connected. Refresh the Store to load the current GC price sheet."
		if !s.settings.FeatureFlags.EnableFullCS2Store {
			store.Offers = couponStoreOffers(store.Offers)
		}
		return store
	}
	store := cloneStore(s.store)
	if !s.settings.FeatureFlags.EnableFullCS2Store {
		store.Offers = couponStoreOffers(store.Offers)
		if store.Status == "ready" {
			store.Message = "Showing coupon items available through Steam's browser checkout. Enable Full CS2 Store to show experimental GC checkout offers."
		}
	}
	return store
}

func couponStoreOffers(offers []domain.StoreOffer) []domain.StoreOffer {
	filtered := make([]domain.StoreOffer, 0, len(offers))
	for _, offer := range offers {
		if offer.Coupon {
			filtered = append(filtered, offer)
		}
	}
	return filtered
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
	if s.connection.State != domain.ConnectionStateConnected {
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
		offers = append(offers, domain.StoreOffer{ID: source.ID, ItemLink: source.ItemLink, DefIndex: defIndex, Name: meta.Name, ImageURL: imageURL, Category: firstNonEmptyApp(source.Category, meta.Kind), Rarity: meta.Rarity, Currency: currency, AmountMinor: amount, FormattedPrice: formatStoreAmount(currency, amount), SaleAmountMinor: saleAmount, PurchaseType: source.PurchaseType, Coupon: schema.IsCoupon(defIndex), Items: domainRelatedItems(meta.ContainerItems), FormattedSalePrice: func() string {
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
	offerID := stringInput(input, "offerId")
	s.mu.Lock()
	if !s.settings.FeatureFlags.EnableStorePurchases {
		s.mu.Unlock()
		return failed("CS2 cash-store purchases are disabled")
	}
	if s.connection.State != domain.ConnectionStateConnected {
		s.mu.Unlock()
		log.Printf("[InitializeStorePurchase] FAILED: Steam connection is not active (state=%q)", s.connection.State)
		return failed("connect a Steam account before purchasing")
	}
	quantity64, qerr := requiredUint64Input(input, "quantity")
	version64, verr := requiredUint64Input(input, "expectedPriceSheetVersion")
	expected, aerr := requiredUint64Input(input, "expectedAmountMinor")
	if err := firstError(qerr, verr, aerr); err != nil || quantity64 == 0 || quantity64 > 20 {
		s.mu.Unlock()
		log.Printf("[InitializeStorePurchase] FAILED: invalid purchase quantity=%d (err=%v)", quantity64, err)
		return failed("invalid store purchase quantity; CS2 supports between 1 and 20 items per purchase")
	}

	var offer *domain.StoreOffer
	log.Printf("[InitializeStorePurchase] INITIATING purchase offerID=%q quantity=%d expectedVersion=%d expectedAmount=%d storeStatus=%q storeCountry=%q storeCurrencyID=%d",
		offerID, quantity64, version64, expected, s.store.Status, s.storeCountry, s.storeCurrencyID)

	purchaseCurrency := s.storeCurrencyID
	purchaseCountry := strings.TrimSpace(s.storeCountry)
	if s.store.Status != "ready" || purchaseCountry == "" || purchaseCurrency == 0 {
		s.mu.Unlock()
		log.Printf("[InitializeStorePurchase] CS2 store is not ready (status=%q, country=%q, currency=%d), attempting on-demand RequestStore from GC...", s.store.Status, purchaseCountry, purchaseCurrency)
		refreshCtx, refreshCancel := context.WithTimeout(context.Background(), 15*time.Second)
		if err := s.ensureGCSession(refreshCtx, protocol.AppIDCS2); err == nil {
			if storeData, err := s.gcClient.RequestStore(refreshCtx, 0, 0); err == nil {
				s.mu.Lock()
				s.storeCurrencyID = storeData.Currency
				s.storeCountry = storeData.Country
				if s.store.Status != "ready" {
					s.store.Status = "ready"
					s.store.Currency = steamCurrencyCode(storeData.Currency)
					s.store.PriceSheetVersion = storeData.PriceSheetVersion
				}
				purchaseCurrency = s.storeCurrencyID
				purchaseCountry = strings.TrimSpace(s.storeCountry)
				log.Printf("[InitializeStorePurchase] On-demand RequestStore SUCCESS: currency=%d (%s) country=%q priceSheetVersion=%d",
					storeData.Currency, steamCurrencyCode(storeData.Currency), storeData.Country, storeData.PriceSheetVersion)
				s.mu.Unlock()
			} else {
				log.Printf("[InitializeStorePurchase] On-demand RequestStore ERROR: %v", err)
			}
		} else {
			log.Printf("[InitializeStorePurchase] ensureGCSession for RequestStore ERROR: %v", err)
		}
		refreshCancel()
		s.mu.Lock()
	}

	terminalID := uint64(0)
	terminalPurchaseDiagnostic := ""
	if strings.HasPrefix(offerID, "terminal:") {
		terminalID, _ = strconv.ParseUint(strings.TrimPrefix(offerID, "terminal:"), 10, 64)
		expectedOfferItemID := strings.TrimSpace(stringInput(input, "expectedTerminalOfferItemId"))
		if quantity64 != 1 || terminalID == 0 {
			s.mu.Unlock()
			log.Printf("[InitializeStorePurchase] FAILED: terminal purchases require one valid active terminal (quantity=%d, terminalID=%d)", quantity64, terminalID)
			return failed("terminal purchases require one valid active terminal")
		}
		for itemIndex := range s.inventory.Items {
			item := &s.inventory.Items[itemIndex]
			if item.ID != strconv.FormatUint(terminalID, 10) || !isTerminalInventoryItem(*item) || len(item.TerminalOffers) == 0 || item.Defindex == nil {
				continue
			}
			current := item.TerminalOffers[0]
			if expectedOfferItemID == "" || current.FauxItemID != expectedOfferItemID {
				s.mu.Unlock()
				log.Printf("[InitializeStorePurchase] FAILED: terminal offer changed before confirmation (expectedOfferItemID=%q currentOfferItemID=%q)", expectedOfferItemID, current.FauxItemID)
				return failed("the terminal offer changed before purchase; review the current offer and confirm it again")
			}
			if current.PurchasePrice == 0 {
				s.mu.Unlock()
				log.Printf("[InitializeStorePurchase] FAILED: terminal offer price is 0")
				return failed("the terminal offer price is invalid")
			}
			actualPrice := uint64(current.PurchasePrice)
			if expected != actualPrice {
				log.Printf("[InitializeStorePurchase] NOTICE: expected price (%d) != actual terminal offer price (%d), using actual price %d", expected, actualPrice, actualPrice)
			}
			offerCurrency := steamCurrencyCode(s.storeCurrencyID)
			if offerCurrency == "" {
				offerCurrency = "AUD"
			}
			terminalDefIndex := *item.Defindex
			offerDefIndex := terminalDefIndex
			purchaseType := uint32(0)
			for _, catOffer := range s.store.Offers {
				if catOffer.DefIndex == offerDefIndex || catOffer.DefIndex == current.Item.Defindex {
					purchaseType = catOffer.PurchaseType
					log.Printf("[InitializeStorePurchase] Found price sheet catalog offer match: itemLink=%q defIndex=%d purchaseType=%d requiresSupplemental=%v",
						catOffer.ItemLink, catOffer.DefIndex, catOffer.PurchaseType, catOffer.RequiresSupplementalData)
					break
				}
			}
			offer = &domain.StoreOffer{
				ID:           offerID,
				DefIndex:     offerDefIndex,
				Name:         current.Item.MarketName,
				Currency:     offerCurrency,
				AmountMinor:  actualPrice,
				PurchaseType: purchaseType,
				Purchasable:  true,
			}
			volatileOfferItemID := encodedVolatileOfferItemID(current.Item.Defindex, current.Item.PaintKit)
			terminalPurchaseDiagnostic = fmt.Sprintf(
				"Terminal purchase source: terminal_item_id=%d terminal_defindex=%d recovered_offer_item_id=%s volatile_offer_item_id=%d offer_generation_time=%d embedded_purchase_price=%d offered_item_defindex=%d offered_paint_kit=%d",
				terminalID, terminalDefIndex, current.FauxItemID, volatileOfferItemID, current.GenerationTime, current.PurchasePrice, current.Item.Defindex, current.Item.PaintKit,
			)
			for _, diagnostic := range item.Diagnostics {
				if strings.HasPrefix(diagnostic, "Terminal state attributes:") {
					terminalPurchaseDiagnostic += "; " + diagnostic
					break
				}
			}
			log.Printf("[InitializeStorePurchase] Resolved terminal offer: terminalID=%d containerDefIndex=%d offerDefIndex=%d purchaseType=%d name=%q price=%d currency=%s",
				terminalID, terminalDefIndex, current.Item.Defindex, offer.PurchaseType, offer.Name, offer.AmountMinor, offer.Currency)
			break
		}
	} else {
		for i := range s.store.Offers {
			if s.store.Offers[i].ID == offerID {
				offer = &s.store.Offers[i]
				break
			}
		}
	}
	if offer == nil || !offer.Purchasable {
		s.mu.Unlock()
		log.Printf("[InitializeStorePurchase] FAILED: store offer is unavailable or unsupported (offerID=%q)", offerID)
		return failed("store offer is unavailable or unsupported")
	}
	fullStoreEnabled := s.settings.FeatureFlags.EnableFullCS2Store
	if !fullStoreEnabled && !offer.Coupon {
		s.mu.Unlock()
		return failed("this offer requires the experimental Full CS2 Store feature")
	}
	amount := offer.AmountMinor
	if offer.SaleAmountMinor != nil {
		amount = *offer.SaleAmountMinor
	}
	if terminalID == 0 && (uint32(version64) != s.store.PriceSheetVersion || expected != amount) {
		s.mu.Unlock()
		log.Printf("[InitializeStorePurchase] FAILED: price sheet version or amount mismatch (version64=%d, currentVersion=%d, expected=%d, amount=%d)", version64, s.store.PriceSheetVersion, expected, amount)
		return failed("The CS2 store price changed. Refresh the store and review the updated price before continuing.")
	}
	if amount == 0 || quantity64 > math.MaxUint64/amount {
		s.mu.Unlock()
		log.Printf("[InitializeStorePurchase] FAILED: purchase total invalid (amount=%d, quantity=%d)", amount, quantity64)
		return failed("store purchase total is too large")
	}
	if purchaseCountry == "" {
		log.Printf("[InitializeStorePurchase] WARNING: purchaseCountry is empty, defaulting to 'US'")
		purchaseCountry = "US"
	}
	if offer.Currency == "" {
		if cur := steamCurrencyCode(purchaseCurrency); cur != "" {
			offer.Currency = cur
		}
	}
	log.Printf("[InitializeStorePurchase] Validated purchase parameters: country=%q currency=%d (%s) offerCurrency=%s itemDefID=%d amount=%d",
		purchaseCountry, purchaseCurrency, steamCurrencyCode(purchaseCurrency), offer.Currency, offer.DefIndex, amount)

	sessionID := newID()
	session := domain.PurchaseSession{ID: sessionID, Status: "initializing", OfferID: offer.ID, DefIndex: offer.DefIndex, Name: offer.Name, Quantity: uint32(quantity64), Currency: offer.Currency, AmountMinor: amount * quantity64, FormattedAmount: formatStoreAmount(offer.Currency, amount*quantity64), CreatedAt: created, ExpiresAt: time.Now().Add(15 * time.Minute).UTC().Format(time.RFC3339), Message: "Initializing purchase with Steam"}
	// Current CS2Interface captures show that native StoreAPI omits purchase_type
	// but explicitly emits supplemental_data, using zero for an ordinary bare
	// defindex and the parenthesized asset ID for supplemental purchases.
	purchaseRequest := transport.StorePurchaseRequest{
		// Current CS2 captures explicitly send an empty country in purchase init;
		// the authoritative wallet country is used to select/validate the store
		// catalogue, while the numeric GC currency identifies the checkout wallet.
		Country: "", CountryPresent: true,
		Language: 0, LanguagePresent: true,
		Currency: purchaseCurrency, ItemDefID: offer.DefIndex,
		Quantity: uint32(quantity64), Cost: amount * quantity64,
		SupplementalData: terminalID,
	}
	s.purchaseSessions[sessionID] = session
	s.mu.Unlock()
	if offer.Coupon && !fullStoreEnabled {
		checkoutURL := steamCouponBuyItemURL(offer.DefIndex, uint32(quantity64))
		session.Status = "awaiting_user"
		session.Message = "Steam coupon checkout link ready. Review and complete the purchase on Steam."
		session.CheckoutURL = checkoutURL
		session.Diagnostics = []string{fmt.Sprintf("COUPON checkout route=Steam BuyItem appid=730 item_def_id=%d quantity=%d", offer.DefIndex, quantity64)}
		s.mu.Lock()
		s.purchaseSessions[sessionID] = session
		s.mu.Unlock()
		return session
	}
	ctx, cancel := context.WithTimeout(context.Background(), 45*time.Second)
	var result transport.StorePurchaseTransportResult
	probeDiagnostics := make([]string, 0)
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
		log.Printf("[InitializeStorePurchase] Transport FAILED: sessionID=%s error=%v", sessionID, err)
		session.Status, session.Message = "failed", err.Error()
		session.Diagnostics = transport.DiagnosticsFromError(err)
		if len(probeDiagnostics) > 0 {
			session.Diagnostics = append(probeDiagnostics, session.Diagnostics...)
		}
		if terminalPurchaseDiagnostic != "" {
			session.Diagnostics = append([]string{terminalPurchaseDiagnostic}, session.Diagnostics...)
		}
		var rejected transport.StorePurchaseRejectedError
		if errors.As(err, &rejected) {
			resultCode := rejected.Result
			session.ErrorCode = rejected.Code()
			session.ErrorResult = &resultCode
			session.Diagnostics = append([]string{fmt.Sprintf("CS2 EPurchaseResult %d decoded as %s", resultCode, rejected.Code())}, session.Diagnostics...)
		}
	} else {
		log.Printf("[InitializeStorePurchase] Transport SUCCESS: sessionID=%s checkoutURL=%q txnID=%d orderID=%d itemIDs=%v",
			sessionID, result.CheckoutURL, result.TransactionID, result.OrderID, result.ItemIDs)
		session.Status, session.Message, session.TransactionID, session.OrderID, session.CheckoutURL = "awaiting_user", "Steam confirmation link ready. Review and authorize the transaction on Steam.", strconv.FormatUint(result.TransactionID, 10), strconv.FormatUint(result.OrderID, 10), result.CheckoutURL
		session.Diagnostics = append(append([]string(nil), probeDiagnostics...), result.Diagnostics...)
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
	session.Status, session.Message = "finalizing", "Finalizing the authorized purchase with CS2"
	s.purchaseSessions[id] = session
	expected := append([]uint64(nil), s.purchaseItemIDs[id]...)
	appID := s.purchaseAppIDs[id]
	if appID == 0 {
		appID = protocol.AppIDCS2
	}
	s.mu.Unlock()
	orderID, parseErr := strconv.ParseUint(session.OrderID, 10, 64)
	if parseErr != nil || orderID == 0 {
		s.mu.Lock()
		session = s.purchaseSessions[id]
		session.Status, session.Message = "failed", "Purchase session has no valid GC order ID."
		s.purchaseSessions[id] = session
		s.mu.Unlock()
		return session
	}
	finalizeCtx, cancelFinalize := context.WithTimeout(context.Background(), 12*time.Second)
	finalizedItemIDs, finalizeErr := s.gcClient.FinalizeGameStorePurchase(finalizeCtx, appID, orderID)
	cancelFinalize()
	if finalizeErr != nil {
		s.mu.Lock()
		session = s.purchaseSessions[id]
		session.Status, session.Message = "awaiting_user", "Steam has not authorized this purchase yet. Approve checkout, then retry finalization."
		session.Diagnostics = append(session.Diagnostics, finalizeErr.Error())
		s.purchaseSessions[id] = session
		s.mu.Unlock()
		return session
	}
	if len(finalizedItemIDs) > 0 {
		expected = finalizedItemIDs
		s.mu.Lock()
		s.purchaseItemIDs[id] = append([]uint64(nil), finalizedItemIDs...)
		s.mu.Unlock()
	}
	if appID == tf2AppID {
		receipt := s.RefreshGameInventory("tf2")
		s.mu.Lock()
		defer s.mu.Unlock()
		session = s.purchaseSessions[id]
		if receipt.State == operations.StateCompleted {
			session.Status, session.Message = "completed", "TF2 purchase finalized and inventory refreshed from the Game Coordinator."
		} else {
			session.Status, session.Message = "awaiting_user", "TF2 inventory refresh could not confirm the purchase yet."
		}
		s.purchaseSessions[id] = session
		return session
	}
	receipt := s.RefreshInventory()
	s.mu.Lock()
	defer s.mu.Unlock()
	session = s.purchaseSessions[id]
	if receipt.State != operations.StateCompleted {
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

func steamCouponBuyItemURL(defIndex, quantity uint32) string {
	return fmt.Sprintf("https://store.steampowered.com/buyitem/730/%d/%d", defIndex, quantity)
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
