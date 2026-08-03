package app

import (
	"context"
	"fmt"
	"math"
	"strconv"
	"strings"
	"time"

	"cs-inv-edit/backend/internal/domain"
	"cs-inv-edit/backend/internal/econ"
	"cs-inv-edit/backend/internal/operations"
	"cs-inv-edit/backend/internal/transport"
)

const tf2AppID uint32 = 440

func (s *Service) TF2Store() domain.StoreSnapshot {
	s.mu.Lock()
	defer s.mu.Unlock()
	if !s.settings.FeatureFlags.EnableTF2Store {
		return domain.StoreSnapshot{Status: "error", Offers: []domain.StoreOffer{}, RefreshedAt: now(), Message: "TF2 store reads are disabled in Settings."}
	}
	store := cloneStore(s.tf2Store)
	if s.connection.State == domain.ConnectionStateConnected && store.Status == domain.StoreStatusRequiresConnection {
		store.Message = "Steam is connected. Refresh the Store to load the current TF2 GC price sheet."
	}
	return store
}

func (s *Service) RefreshTF2Store() operations.Receipt {
	receipt := s.newReceipt("tf2.store.refresh")
	s.mu.Lock()
	if !s.settings.FeatureFlags.EnableTF2Store {
		s.mu.Unlock()
		return s.finishTF2StoreRefresh(receipt, "blocked_by_feature_flag", "TF2 store reads are disabled")
	}
	if s.connection.State != domain.ConnectionStateConnected {
		s.tf2Store = emptyTF2Store()
		s.mu.Unlock()
		return s.finishTF2StoreRefresh(receipt, "requires_connection", "connect Steam to load the TF2 Mann Co. Store")
	}
	version := s.tf2Store.PriceSheetVersion
	s.tf2Store.Status, s.tf2Store.Message = "loading", "Waiting for the TF2 Game Coordinator price sheet"
	s.mu.Unlock()

	ctx, cancel := context.WithTimeout(context.Background(), 45*time.Second)
	err := s.ensureGCSession(ctx, tf2AppID)
	if err == nil {
		data, requestErr := s.gcClient.RequestGameStore(ctx, tf2AppID, version, 0)
		err = requestErr
		if err == nil {
			if len(data.PriceSheet) == 0 && version != 0 {
				s.mu.Lock()
				s.tf2Store.Status, s.tf2Store.Message, s.tf2Store.RefreshedAt = "ready", "", now()
				s.tf2StoreCountry, s.tf2StoreCurrencyID = data.Country, data.Currency
				s.tf2Store.Diagnostics = append(s.tf2Store.Diagnostics, "TF2 GC reported the current price-sheet version unchanged; retained the existing catalogue.")
				s.mu.Unlock()
			} else {
				err = s.buildTF2Store(ctx, data)
			}
		}
	}
	cancel()
	if err != nil {
		s.mu.Lock()
		s.tf2Store = domain.StoreSnapshot{Status: "error", Offers: []domain.StoreOffer{}, RefreshedAt: now(), Message: err.Error()}
		s.mu.Unlock()
		return s.finishTF2StoreRefresh(receipt, "failed", err.Error())
	}
	return s.finishTF2StoreRefresh(receipt, "completed", "TF2 Mann Co. Store catalogue refreshed")
}

func (s *Service) buildTF2Store(ctx context.Context, data transport.GCStoreData) error {
	catalog, err := econ.ParseStorePriceSheet(data.PriceSheet)
	if err != nil {
		return err
	}
	definitions, revision, err := s.multiProvider.TF2Definitions(ctx)
	if err != nil {
		return fmt.Errorf("load live TF2 item schema: %w", err)
	}
	currency := steamCurrencyCode(data.Currency)
	diagnostics := []string{fmt.Sprintf("Authoritative TF2 GC price sheet joined to %s (%d definitions)", revision, len(definitions))}
	if strings.HasPrefix(currency, "CURRENCY_") {
		currency = "USD"
		diagnostics = append(diagnostics, "The TF2 GC did not return a recognized account currency; displaying USD prices.")
	}
	diagnostics = append(diagnostics, "Offer images are omitted unless exact live Steam description icon tokens are available; items_game image keys are not converted into URLs.")
	imageNames := make([]string, 0, len(catalog.Offers))
	seenImageName := make(map[string]bool)
	for _, source := range catalog.Offers {
		definition, found := tf2DefinitionByInternalName(definitions, source.ItemLink)
		if found && definition.Name != "" && !seenImageName[definition.Name] {
			seenImageName[definition.Name] = true
			imageNames = append(imageNames, definition.Name)
		}
	}
	images, imageErr := s.multiProvider.TF2StoreImages(ctx, imageNames)
	if imageErr != nil {
		diagnostics = append(diagnostics, "Some exact TF2 Steam description images were unavailable: "+imageErr.Error())
	}
	offers := make([]domain.StoreOffer, 0, len(catalog.Offers))
	for _, source := range catalog.Offers {
		definition, found := tf2DefinitionByInternalName(definitions, source.ItemLink)
		if !found {
			diagnostics = append(diagnostics, fmt.Sprintf("TF2 store item_link %q was not found in live items_game", source.ItemLink))
			continue
		}
		amount, priced := tf2StorePrice(source, currency, data.Currency)
		if !priced {
			diagnostics = append(diagnostics, fmt.Sprintf("TF2 store offer %q has no %s price", source.ItemLink, currency))
			continue
		}
		var saleAmount *uint64
		if sale, onSale := source.SalePrices[currency]; onSale && sale < amount {
			saleCopy := sale
			saleAmount = &saleCopy
		}
		items := make([]domain.RelatedItem, 0, len(definition.ContainerItems))
		for _, item := range definition.ContainerItems {
			items = append(items, domain.RelatedItem{Defindex: item.DefIndex, Name: item.Name, Rarity: item.Rarity, ImageURL: item.ImageURL})
		}
		imageURL := ""
		if image, found := images[definition.Name]; found {
			imageURL = firstNonEmptyApp(image.IconURLLarge, image.IconURL)
		}
		offers = append(offers, domain.StoreOffer{
			ID: source.ID, ItemLink: source.ItemLink, DefIndex: definition.DefIndex,
			Name: definition.Name, Description: definition.Description, ImageURL: imageURL,
			Category: tf2StoreCategory(definition, source.Category), Rarity: definition.Rarity,
			Currency: currency, AmountMinor: amount, FormattedPrice: formatStoreAmount(currency, amount),
			SaleAmountMinor: saleAmount, FormattedSalePrice: formattedSalePrice(currency, saleAmount),
			PurchaseType: source.PurchaseType, RequiresSupplementalData: source.SupplementalDataRequired,
			Purchasable: !source.SupplementalDataRequired, UnsupportedReason: func() string {
				if source.SupplementalDataRequired {
					return "This TF2 offer requires unsupported supplemental purchase data."
				}
				return ""
			}(), Items: items,
		})
	}
	if len(offers) == 0 {
		return fmt.Errorf("the TF2 GC price sheet contained %d entries, but none matched live TF2 metadata and %s prices", len(catalog.Offers), currency)
	}
	s.mu.Lock()
	s.tf2Store = domain.StoreSnapshot{Status: "ready", PriceSheetVersion: data.PriceSheetVersion, Currency: currency, Offers: offers, RefreshedAt: now(), Diagnostics: diagnostics}
	s.tf2StoreCountry, s.tf2StoreCurrencyID = data.Country, data.Currency
	s.mu.Unlock()
	return nil
}

func tf2StorePrice(source econ.StoreCatalogOffer, currency string, currencyID int32) (uint64, bool) {
	if amount, found := source.Prices[currency]; found {
		return amount, true
	}
	if amount, found := source.Prices[strconv.FormatInt(int64(currencyID), 10)]; found {
		return amount, true
	}
	if source.LocalPrice != nil {
		return *source.LocalPrice, true
	}
	if currency == "USD" {
		amount, found := source.Prices["BASE_USD"]
		return amount, found
	}
	return 0, false
}

func (s *Service) InitializeTF2StorePurchase(input map[string]any) domain.PurchaseSession {
	created := now()
	failed := func(message string) domain.PurchaseSession {
		return domain.PurchaseSession{ID: newID(), Status: "failed", OfferID: stringInput(input, "offerId"), Quantity: 1, CreatedAt: created, Message: message}
	}
	quantity, quantityErr := requiredUint64Input(input, "quantity")
	version, versionErr := requiredUint64Input(input, "expectedPriceSheetVersion")
	expected, amountErr := requiredUint64Input(input, "expectedAmountMinor")
	if err := firstError(quantityErr, versionErr, amountErr); err != nil || quantity == 0 || quantity > 20 {
		return failed("invalid TF2 store purchase quantity")
	}
	s.mu.Lock()
	if !s.settings.FeatureFlags.EnableTF2Store {
		s.mu.Unlock()
		return failed("TF2 store purchases are disabled")
	}
	if s.connection.State != domain.ConnectionStateConnected {
		s.mu.Unlock()
		return failed("connect a Steam account before purchasing")
	}
	var offer *domain.StoreOffer
	for index := range s.tf2Store.Offers {
		if s.tf2Store.Offers[index].ID == stringInput(input, "offerId") {
			offer = &s.tf2Store.Offers[index]
			break
		}
	}
	if offer == nil || !offer.Purchasable {
		s.mu.Unlock()
		return failed("TF2 store offer is unavailable or unsupported")
	}
	amount := offer.AmountMinor
	if offer.SaleAmountMinor != nil {
		amount = *offer.SaleAmountMinor
	}
	if uint32(version) != s.tf2Store.PriceSheetVersion || expected != amount {
		s.mu.Unlock()
		return failed("The TF2 store price changed. Refresh the store and review the updated price.")
	}
	if amount == 0 || quantity > math.MaxUint64/amount {
		s.mu.Unlock()
		return failed("TF2 store purchase total is too large")
	}
	sessionID := newID()
	session := domain.PurchaseSession{
		ID: sessionID, Status: "initializing", OfferID: offer.ID, DefIndex: offer.DefIndex,
		Name: offer.Name, Quantity: uint32(quantity), Currency: offer.Currency,
		AmountMinor: amount * quantity, FormattedAmount: formatStoreAmount(offer.Currency, amount*quantity),
		CreatedAt: created, ExpiresAt: time.Now().Add(15 * time.Minute).UTC().Format(time.RFC3339),
		Message: "Initializing TF2 purchase with Steam",
	}
	request := transport.StorePurchaseRequest{
		AppID: tf2AppID, Country: s.tf2StoreCountry, CountryPresent: true,
		Language: 0, LanguagePresent: true, Currency: s.tf2StoreCurrencyID,
		ItemDefID: offer.DefIndex, Quantity: uint32(quantity), Cost: amount * quantity,
		PurchaseType: offer.PurchaseType, PurchaseTypePresent: offer.PurchaseType != 0,
		OmitSupplementalData: true,
	}
	s.purchaseSessions[sessionID], s.purchaseAppIDs[sessionID] = session, tf2AppID
	s.mu.Unlock()

	ctx, cancel := context.WithTimeout(context.Background(), 45*time.Second)
	result, err := s.gcClient.InitializeStorePurchase(ctx, request)
	cancel()
	s.mu.Lock()
	defer s.mu.Unlock()
	if err != nil {
		session.Status, session.Message = "failed", err.Error()
		session.Diagnostics = transport.DiagnosticsFromError(err)
	} else {
		session.Status, session.Message = "awaiting_user", "Steam confirmation link ready. Review and authorize the TF2 transaction on Steam."
		session.TransactionID = strconv.FormatUint(result.TransactionID, 10)
		session.OrderID = strconv.FormatUint(result.OrderID, 10)
		session.CheckoutURL, session.Diagnostics = result.CheckoutURL, result.Diagnostics
		s.purchaseItemIDs[sessionID] = append([]uint64(nil), result.ItemIDs...)
	}
	s.purchaseSessions[sessionID] = session
	return session
}

func formattedSalePrice(currency string, amount *uint64) string {
	if amount == nil {
		return ""
	}
	return formatStoreAmount(currency, *amount)
}

func (s *Service) finishTF2StoreRefresh(receipt operations.Receipt, state operations.State, message string) operations.Receipt {
	receipt.State, receipt.Message = state, message
	s.addEvent(receipt, state, message)
	return receipt
}

func tf2DefinitionByInternalName(definitions map[uint32]econ.TF2Definition, name string) (econ.TF2Definition, bool) {
	for _, definition := range definitions {
		if definition.InternalName == name {
			return definition, true
		}
	}
	return econ.TF2Definition{}, false
}

func tf2StoreCategory(definition econ.TF2Definition, sourceCategory string) string {
	if strings.TrimSpace(sourceCategory) != "" {
		return sourceCategory
	}
	return firstNonEmptyApp(definition.ItemKind, definition.Type)
}
