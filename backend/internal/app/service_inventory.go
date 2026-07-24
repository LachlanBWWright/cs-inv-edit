package app

import (
	"context"
	"fmt"
	"math"
	"sort"
	"strconv"
	"strings"
	"sync"
	"time"

	"cs-inv-edit/backend/internal/domain"
	"cs-inv-edit/backend/internal/econ"
	cs2pb "cs-inv-edit/backend/internal/proto/generated"
	"cs-inv-edit/backend/internal/protocol"
	"cs-inv-edit/backend/internal/transport"

	"github.com/Lucino772/envelop/pkg/steam/steamlang"
)

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
		itemMetadata := metadata.Metadata(item.DefIndex, item.PaintKit, item.Attributes)
		casketID := gcItemCasketID(item)
		if item.Inventory == 0 && !isTerminalMetadata(itemMetadata) && !activeTerminalIDSet[casketID] && (casketID == 0 || (!showStorageUnitItems && !requestedStorageUnits[casketID])) {
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
		if terminalID := gcItemCasketID(item); activeTerminalIDSet[terminalID] {
			terminalOffers[terminalID] = append(terminalOffers[terminalID], domain.TerminalOffer{
				FauxItemID:    strconv.FormatUint(item.ID, 10),
				PurchasePrice: item.Attributes[316],
				Item: domain.RelatedItem{
					Name:       inventoryItem.Name,
					MarketName: inventoryItem.MarketName,
					Kind:       inventoryItem.Kind,
					Rarity:     inventoryItem.Rarity,
					ImageURL:   inventoryItem.ImageURL,
					PaintWear:  inventoryItem.PaintWear,
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
			for _, offer := range item.VolatileOffers {
				related, _ := relatedItemForFauxID(offer.FauxItemID, inventoryItem.ContainerItems)
				inventoryItem.TerminalOffers = append(inventoryItem.TerminalOffers, domain.TerminalOffer{
					FauxItemID:     strconv.FormatUint(offer.FauxItemID, 10),
					GenerationTime: offer.GenerationTime,
					Item:           related,
				})
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
	for index := range items {
		if terminalID, parseErr := strconv.ParseUint(items[index].ID, 10, 64); parseErr == nil {
			if len(terminalOffers[terminalID]) > 0 {
				items[index].TerminalOffers = append([]domain.TerminalOffer(nil), terminalOffers[terminalID]...)
			}
			if isTerminalInventoryItem(items[index]) && strings.HasPrefix(strings.ToLower(items[index].Name), "active ") {
				items[index].Diagnostics = append(items[index].Diagnostics,
					fmt.Sprintf("Terminal offer recovery: on-demand selection sends EMsg %d (CMsgCasketItem) with casket_item_id=%d and item_item_id=%d; this matches InventoryAPI.PerformItemCasketTransaction(0, terminal_id, terminal_id) on the CS2-current k_EMsgGCVolatileItemLoadContents route; the GC receiver remains active for CS2's five-second terminal-offer wait window", protocol.EMsgVolatileItemLoadContents, terminalID, terminalID),
					fmt.Sprintf("Terminal offer recovery result: decoded_current_offers=%d, terminal_points_remaining=%s", len(items[index].TerminalOffers), optionalUint32String(items[index].TerminalPointsRemaining)),
				)
				if offerDiagnostics := terminalOfferDiagnostics[terminalID]; len(offerDiagnostics) > 0 {
					items[index].Diagnostics = append(items[index].Diagnostics, offerDiagnostics...)
				} else {
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

func relatedItemForFauxID(fauxItemID uint64, candidates []domain.RelatedItem) (domain.RelatedItem, bool) {
	type identity struct {
		defindex uint32
		paintKit uint32
	}
	identities := []identity{
		{defindex: uint32(fauxItemID & 0xffff), paintKit: uint32((fauxItemID >> 16) & 0xffff)},
		{defindex: uint32((fauxItemID >> 16) & 0xffff), paintKit: uint32(fauxItemID & 0xffff)},
		{defindex: uint32(fauxItemID), paintKit: uint32(fauxItemID >> 32)},
		{defindex: uint32(fauxItemID >> 32), paintKit: uint32(fauxItemID)},
	}
	for _, identity := range identities {
		for _, candidate := range candidates {
			if candidate.Defindex == identity.defindex && candidate.PaintKit == identity.paintKit {
				return candidate, true
			}
		}
	}
	return domain.RelatedItem{Name: fmt.Sprintf("Volatile terminal offer %d", fauxItemID)}, false
}

func activeTerminalStateDiagnostics(item transport.GCInventoryItem) []string {
	points, pointsPresent := item.Attributes[169]
	expiration, expirationPresent := item.Attributes[183]
	volatileKind, volatilePresent := item.Attributes[315]
	expirationText := "unset"
	if expirationPresent {
		expirationText = time.Unix(int64(expiration), 0).UTC().Format(time.RFC3339)
	}
	return []string{
		fmt.Sprintf(
			"Terminal classification: active=true because schema identity contains terminal, inventory=%d (0x%08x; active-terminal/X-Ray special position=%d), quantity=%d, quality=%d; schema display name is intentionally overridden from sealed to active",
			item.Inventory, item.Inventory, xRayScannerLoadedCaseInventoryPosition, item.Quantity, item.Quality,
		),
		fmt.Sprintf(
			"Terminal state attributes: quest_points_remaining(#169)=%s, expiration_date(#183)=%s [raw=%s], volatile_container(#315)=%s; instance_attribute_count=%d, byte_attributes={%s}",
			optionalAttributeUint32(points, pointsPresent), expirationText, optionalAttributeUint32(expiration, expirationPresent), optionalAttributeUint32(volatileKind, volatilePresent), len(item.Attributes), rawByteAttributeSummary(item.AttributeBytes),
		),
		fmt.Sprintf(
			"Terminal protocol routing: resume/current-offer=EMsg %d CMsgCasketItem(casket=terminal,item=terminal); next/reject=EMsg %d CMsgOpenCrate(tool=terminal,subject=terminal,points_remaining=#169); purchase=Steam store init(item_def_id=%d,supplemental_data=%d,cost=offer_attribute_316)",
			protocol.EMsgVolatileItemLoadContents, protocol.EMsgOpenCrate, item.DefIndex, item.ID,
		),
	}
}

func terminalOfferDiagnostic(item transport.GCInventoryItem, metadata econ.Metadata) string {
	return fmt.Sprintf(
		"Terminal current offer: item_id=%d, original_id=%d, defindex=%d, casket_id=%d, inventory=%d (0x%08x), quantity=%d, quality=%d, rarity=%d, paint_kit=%d, paint_wear=%s, name=%q, market_name=%q, kind=%q, schema_rarity=%q, purchase_price(#316)=%d, attributes={%s}, byte_attributes={%s}",
		item.ID, item.OriginalID, item.DefIndex, gcItemCasketID(item), item.Inventory, item.Inventory, item.Quantity, item.Quality, item.Rarity, item.PaintKit,
		optionalFloatString(item.PaintWear), metadata.Name, metadata.MarketName, metadata.Kind, metadata.Rarity, item.Attributes[316], rawAttributeSummary(item.Attributes), rawByteAttributeSummary(item.AttributeBytes),
	)
}

func rawAttributeSummary(attributes map[uint32]uint32) string {
	ids := make([]int, 0, len(attributes))
	for id := range attributes {
		ids = append(ids, int(id))
	}
	sort.Ints(ids)
	parts := make([]string, 0, len(ids))
	for _, id := range ids {
		value := attributes[uint32(id)]
		parts = append(parts, fmt.Sprintf("#%d=%d/0x%08x", id, value, value))
	}
	if len(parts) == 0 {
		return "none"
	}
	return strings.Join(parts, ",")
}

func rawByteAttributeSummary(attributes map[uint32][]byte) string {
	ids := make([]int, 0, len(attributes))
	for id := range attributes {
		ids = append(ids, int(id))
	}
	sort.Ints(ids)
	parts := make([]string, 0, len(ids))
	for _, id := range ids {
		parts = append(parts, fmt.Sprintf("#%d=%x", id, attributes[uint32(id)]))
	}
	if len(parts) == 0 {
		return "none"
	}
	return strings.Join(parts, ",")
}

func optionalAttributeUint32(value uint32, present bool) string {
	if !present {
		return "unset"
	}
	return fmt.Sprintf("%d/0x%08x", value, value)
}

func optionalUint32String(value *uint32) string {
	if value == nil {
		return "unset"
	}
	return strconv.FormatUint(uint64(*value), 10)
}

func activeTerminalItemIDs(metadata *econ.Schema, items []transport.GCInventoryItem) []uint64 {
	result := make([]uint64, 0)
	for _, item := range items {
		itemMetadata := metadata.Metadata(item.DefIndex, item.PaintKit, item.Attributes)
		if isActiveTerminalGCItem(item, itemMetadata) {
			result = append(result, item.ID)
		}
	}
	return result
}

const xRayScannerLoadedCaseInventoryPosition uint32 = 0xc0000005

// The GC retains the consumed container used by the X-Ray Scanner as a
// zero-quantity economy object in a scanner-only inventory position. CS2's
// Panorama client exposes it through the separate "xraymachine" filter rather
// than the player's regular inventory.
func isXRayScannerLoadedCase(item transport.GCInventoryItem, metadata econ.Metadata) bool {
	return metadata.Kind == "container" &&
		!isTerminalMetadata(metadata) &&
		item.Quantity == 0 &&
		item.Inventory == xRayScannerLoadedCaseInventoryPosition
}

func isTerminalMetadata(metadata econ.Metadata) bool {
	return strings.Contains(strings.ToLower(metadata.Name+" "+metadata.MarketName), "terminal")
}

func isActiveTerminalGCItem(item transport.GCInventoryItem, metadata econ.Metadata) bool {
	return isTerminalMetadata(metadata) && item.Quantity == 0 && item.Inventory == xRayScannerLoadedCaseInventoryPosition
}

func activeTerminalName(name string) string {
	trimmed := strings.TrimSpace(name)
	if trimmed == "" || strings.HasPrefix(strings.ToLower(trimmed), "active ") {
		return trimmed
	}
	if strings.HasPrefix(strings.ToLower(trimmed), "sealed ") {
		trimmed = strings.TrimSpace(trimmed[len("sealed "):])
	}
	return "Active " + trimmed
}

func boolPointer(value bool) *bool {
	return &value
}

func gcItemCasketID(item transport.GCInventoryItem) uint64 {
	return uint64(item.Attributes[272]) | uint64(item.Attributes[273])<<32
}

func gcItemGraffitiCharges(item transport.GCInventoryItem, toolType string) *uint32 {
	if toolType != "spraypaint" {
		return nil
	}
	charges, present := item.Attributes[232]
	if !present {
		return nil
	}
	return &charges
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
		out = append(out, domain.RelatedItem{Defindex: item.DefIndex, PaintKit: item.PaintKit, Name: item.Name, MarketName: item.MarketName, ListingName: item.ListingName, Kind: item.Kind, Rarity: item.Rarity, ImageURL: item.ImageURL, Price: item.Price, PaintWear: item.PaintWear, WearMin: item.WearMin, WearMax: item.WearMax, Items: domainRelatedItems(item.Items)})
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
		imageURL := item.ImageURL
		if imageURL == "" && len(images) > len(out) {
			imageURL = images[len(out)]
		}
		var slotPointer *uint32
		if item.Kind != "charm" {
			slotPointer = &slot
		}
		out = append(out, domain.AppliedItem{Kind: item.Kind, Slot: slotPointer, ID: &id, Name: item.Name, ImageURL: imageURL, Wear: item.Wear})
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
		decodedByID := make(map[uint32]econ.DecodedEconAttribute, len(metadata.DecodedAttributes))
		for _, attribute := range metadata.DecodedAttributes {
			decodedByID[attribute.DefIndex] = attribute
		}
		for _, id := range attributeIDs {
			raw := item.Attributes[uint32(id)]
			if decoded, ok := decodedByID[uint32(id)]; ok {
				attributes = append(attributes, fmt.Sprintf("#%d %s: %s [raw=%d, 0x%08x]", id, decoded.Name, decoded.Value, raw, raw))
				continue
			}
			attributes = append(attributes, fmt.Sprintf("#%d unknown attribute: %d (0x%08x)", id, raw, raw))
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
