package app

import (
	"context"
	"fmt"
	"strconv"
	"strings"
	"sync"
	"time"

	"cs-inv-edit/backend/internal/domain"
	"cs-inv-edit/backend/internal/econ"
	cs2pb "cs-inv-edit/backend/internal/proto/gametracking"
	"cs-inv-edit/backend/internal/protocol"
	"cs-inv-edit/backend/internal/transport"
)

func emptyInventory() domain.InventorySnapshot {
	return domain.InventorySnapshot{RefreshedAt: now(), Status: domain.SnapshotStatusRequiresConnection, Items: []domain.InventoryItem{}}
}

func emptyGameInventory(game string, appID uint32) domain.GameInventorySnapshot {
	return domain.GameInventorySnapshot{Game: game, AppID: appID, RefreshedAt: now(), Status: domain.SnapshotStatusRequiresConnection, Items: []domain.EconomyInventoryItem{}, Diagnostics: []string{}}
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
	return domain.InventorySnapshot{RefreshedAt: now(), Status: domain.SnapshotStatusError, Message: message, Error: message, Diagnostics: append([]string(nil), diagnostics...), Items: []domain.InventoryItem{}}
}

func (s *Service) setInventoryLoadingStage(message string) {
	s.mu.Lock()
	if s.inventory.Status == domain.SnapshotStatusLoading {
		s.inventory.Message = message
	}
	s.mu.Unlock()
}

func (s *Service) fetchInventory(parent context.Context, progress func(string)) (domain.InventorySnapshot, error) {
	if parent == nil {
		parent = context.Background()
	}
	report := func(message string) {
		if progress != nil {
			progress(message)
		}
	}
	s.mu.Lock()
	steamID := s.connection.SteamID
	includeDebug := s.settings.FeatureFlags.EnableInventoryDebug
	showStorageUnitItems := s.settings.FeatureFlags.ShowStorageUnitItems
	requestedStorageUnits := make(map[uint64]bool, len(s.loadedStorageUnits))
	for id := range s.loadedStorageUnits {
		requestedStorageUnits[id] = true
	}
	s.mu.Unlock()
	report("Waiting for CS2 Game Coordinator inventory data")
	gcCtx, cancelGC := context.WithTimeout(parent, 45*time.Second)
	defer cancelGC()
	gcItems, err := s.gcClient.RequestInventory(gcCtx)
	if err != nil {
		return domain.InventorySnapshot{}, fmt.Errorf("CS2 GC inventory request failed: %w", err)
	}
	s.markGCSessionReady(protocol.AppIDCS2)
	storageUnitsLoaded := 0
	if showStorageUnitItems || len(requestedStorageUnits) > 0 {
		for _, item := range gcItems {
			if item.DefIndex != 1201 || item.Attributes[270] == 0 || (!showStorageUnitItems && !requestedStorageUnits[item.ID]) {
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
	schemaCtx, cancelSchema := context.WithTimeout(parent, 20*time.Second)
	descriptionCtx, cancelDescriptions := context.WithTimeout(parent, 20*time.Second)
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
	activeTerminalIDs := activeTerminalItemIDs(metadata, gcItems)
	report("Matching owned items to names, images, collections, and float ranges")
	type pendingItem struct {
		item               transport.GCInventoryItem
		metadata           econ.Metadata
		descriptionMatched bool
		inspectURL         string
	}
	pendingItems := make([]pendingItem, 0, len(gcItems))
	activeTerminalIDSet := make(map[uint64]bool, len(activeTerminalIDs))
	for _, terminalID := range activeTerminalIDs {
		activeTerminalIDSet[terminalID] = true
	}
	descriptionMatches := 0
	for _, item := range gcItems {
		if item.DefIndex == 0 {
			continue
		}
		itemMetadata := metadata.MetadataForQuality(item.DefIndex, item.PaintKit, item.Attributes, item.Quality)
		casketID := gcItemCasketID(item)
		if item.Inventory == 0 && !isTerminalGCItem(item, itemMetadata) && !activeTerminalIDSet[casketID] && (casketID == 0 || (!showStorageUnitItems && !requestedStorageUnits[casketID])) {
			continue
		}
		descriptionMatched := false
		inspectURL := ""
		if description, ok := descriptionForGCItem(descriptions, item, itemMetadata); ok {
			itemMetadata = itemMetadata.WithInventoryDescription(description)
			descriptionMatched = true
			inspectURL = description.InspectURL
			descriptionMatches++
		}
		itemMetadata.MarketName = instanceMarketName(itemMetadata.MarketName, item)
		if isXRayScannerLoadedCase(item, itemMetadata) {
			continue
		}
		pendingItems = append(pendingItems, pendingItem{item: item, metadata: itemMetadata, descriptionMatched: descriptionMatched, inspectURL: inspectURL})
	}
	report("Finalizing inventory; Market prices will load when items are selected")
	marketDescriptions := make(map[string]econ.MarketDescription)
	var marketErr error
	items := make([]domain.InventoryItem, 0, len(pendingItems))
	terminalOffers := make(map[uint64][]domain.TerminalOffer)
	terminalOfferDiagnostics := make(map[uint64][]string)
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
			PaintWear:             item.PaintWear,
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
			IsTerminal:            isTerminalGCItem(item, itemMetadata),
			IsActiveTerminal:      isActiveTerminalGCItem(item, itemMetadata),
			AppliedItems:          domainAppliedItems(metadata.AppliedItems(item.DefIndex, item.Attributes), itemMetadata.AppliedItemImages),
			// CEconItem quality 9 is Strange/StatTrak and 12 is Tournament/Souvenir.
			IsStatTrak:    item.Quality == 9 || strings.HasPrefix(itemMetadata.MarketName, "StatTrak™"),
			IsSouvenir:    item.Quality == 12 || strings.HasPrefix(itemMetadata.MarketName, "Souvenir"),
			Tradable:      itemMetadata.Tradable,
			Marketable:    itemMetadata.Marketable,
			TradableAfter: itemMetadata.TradableAfter,
		}
		storageEligible, storageReason := storageEligibility(item, inventoryItem)
		inventoryItem.StorageEligible = &storageEligible
		inventoryItem.StorageIneligibleReason = storageReason
		if terminalID := gcItemCasketID(item); activeTerminalIDSet[terminalID] {
			terminalOffers[terminalID] = append(terminalOffers[terminalID], domain.TerminalOffer{
				FauxItemID:    strconv.FormatUint(item.ID, 10),
				PurchasePrice: item.Attributes[316],
				Item: domain.RelatedItem{
					Defindex:   item.DefIndex,
					PaintKit:   item.PaintKit,
					Name:       inventoryItem.Name,
					MarketName: inventoryItem.MarketName,
					Kind:       inventoryItem.Kind,
					Rarity:     inventoryItem.Rarity,
					ImageURL:   inventoryItem.ImageURL,
					PaintWear:  item.PaintWear,
					WearMin:    inventoryItem.PaintWearMin,
					WearMax:    inventoryItem.PaintWearMax,
				},
			})
			terminalOfferDiagnostics[terminalID] = append(terminalOfferDiagnostics[terminalID], terminalOfferDiagnostic(item, itemMetadata))
			continue
		}
		if isActiveTerminalGCItem(item, itemMetadata) {
			inventoryItem.Name = activeTerminalName(inventoryItem.Name)
			inventoryItem.MarketName = activeTerminalName(inventoryItem.MarketName)
			inventoryItem.Marketable = boolPointer(false)
			inventoryItem.Tradable = boolPointer(false)
			if pointsRemaining, present := item.Attributes[169]; present {
				inventoryItem.TerminalPointsRemaining = &pointsRemaining
			}
		}
		if count := item.Attributes[270]; count > 0 {
			inventoryItem.StorageCount = &count
		}
		inventoryItem.GraffitiCharges = gcItemGraffitiCharges(item, itemMetadata.ToolType)
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
		if isActiveTerminalGCItem(item, itemMetadata) {
			inventoryItem.Diagnostics = append(inventoryItem.Diagnostics, activeTerminalStateDiagnostics(item)...)
			for _, offer := range item.VolatileOffers {
				related, decoded := relatedItemForFauxID(offer.FauxItemID, inventoryItem.ContainerItems)
				inventoryItem.Diagnostics = append(inventoryItem.Diagnostics, fmt.Sprintf(
					"Terminal volatile-offer SO: faux_itemid=%d (0x%016x), generation_time=%d, decoded_schema_item=%t, decoded_defindex=%d, decoded_paint_kit=%d",
					offer.FauxItemID, offer.FauxItemID, offer.GenerationTime, decoded, related.Defindex, related.PaintKit,
				))
			}
		}
		if includeDebug {
			inventoryItem.Debug = debugForGCItem(item, pending.descriptionMatched, marketDescriptionUsed)
		}
		items = append(items, inventoryItem)
	}
	s.mu.Lock()
	existingOffers := make(map[string][]domain.TerminalOffer)
	for _, item := range s.inventory.Items {
		if len(item.TerminalOffers) > 0 {
			existingOffers[item.ID] = item.TerminalOffers
		}
	}
	s.mu.Unlock()

	for index := range items {
		if terminalID, parseErr := strconv.ParseUint(items[index].ID, 10, 64); parseErr == nil {
			if len(terminalOffers[terminalID]) > 0 {
				items[index].TerminalOffers = append([]domain.TerminalOffer(nil), terminalOffers[terminalID]...)
			} else if saved, ok := existingOffers[items[index].ID]; ok && len(saved) > 0 {
				items[index].TerminalOffers = append([]domain.TerminalOffer(nil), saved...)
			}
			if isTerminalInventoryItem(items[index]) {
				items[index].Diagnostics = append(items[index].Diagnostics,
					fmt.Sprintf("Terminal offer recovery: on-demand selection sends EMsg %d (CMsgCasketItem) with casket_item_id=%d and item_item_id=%d; this matches InventoryAPI.PerformItemCasketTransaction(0, terminal_id, terminal_id) on the CS2-current k_EMsgGCVolatileItemLoadContents route; the GC receiver remains active for CS2's five-second terminal-offer wait window", protocol.EMsgVolatileItemLoadContents, terminalID, terminalID),
					fmt.Sprintf("Terminal offer recovery result: decoded_current_offers=%d, terminal_points_remaining=%s", len(items[index].TerminalOffers), optionalUint32String(items[index].TerminalPointsRemaining)),
				)
				if offerDiagnostics := terminalOfferDiagnostics[terminalID]; len(offerDiagnostics) > 0 {
					items[index].Diagnostics = append(items[index].Diagnostics, offerDiagnostics...)
				} else if len(items[index].TerminalOffers) == 0 {
					items[index].Diagnostics = append(items[index].Diagnostics, "Terminal current offer: neither a CSOVolatileItemOffer shared object (SO type 20) nor a GC economy-item fallback with casket attributes #272/#273 was decoded after EMsg 2536")
				}
			}
		}
	}
	return domain.InventorySnapshot{
		Items:       items,
		Collections: domainCollections(metadata.Collections()),
		RefreshedAt: now(),
		Status:      "ready",
		Diagnostics: append(inventoryMetadataDiagnostics(descriptionErr, marketErr, len(descriptions), descriptionMatches, len(pendingItems)), storageLoadDiagnostic(showStorageUnitItems, storageUnitsLoaded)...),
	}, nil
}
