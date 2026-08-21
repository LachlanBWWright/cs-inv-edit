package app

import (
	"fmt"
	"math"
	"sort"
	"strconv"
	"strings"

	"cs-inv-edit/backend/internal/domain"
	"cs-inv-edit/backend/internal/econ"
	"cs-inv-edit/backend/internal/transport"

	"github.com/Lucino772/envelop/pkg/steam/steamlang"
)

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
		if item.Kind != domain.ItemKindCharm {
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
