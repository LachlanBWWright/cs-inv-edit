package app

import (
	"context"
	"encoding/base64"
	"fmt"
	"strconv"
	"strings"
	"time"

	"cs-inv-edit/backend/internal/domain"
	"cs-inv-edit/backend/internal/operations"
	"cs-inv-edit/backend/internal/proto/tf2tracking"
	"cs-inv-edit/backend/internal/protocol"
	"cs-inv-edit/backend/internal/transport"
)

func (s *Service) submitTF2Operation(receipt operations.Receipt, operation string, input map[string]any) operations.Receipt {
	operationType := operations.Type(operation)
	mapping, known := protocol.TF2OperationMapping(operation)
	if !known {
		return s.finishTF2Operation(receipt, "failed", "unknown TF2 operation", nil)
	}
	if game, _ := input["game"].(string); game != "" && game != "tf2" {
		return s.finishTF2Operation(receipt, "failed", "TF2 operation payload must declare game=tf2", nil)
	}
	s.mu.Lock()
	flags := s.settings.FeatureFlags
	validationMode := s.settings.ValidationMode
	connected := steamConnected(s.connection)
	steamID := s.connection.SteamID
	storeCurrencyID := s.storeCurrencyID
	enabled := tf2OperationEnabled(flags, mapping.FeatureFlag)
	s.mu.Unlock()
	result := map[string]any{"game": "tf2", "requestEMsg": mapping.EMsg, "protobuf": mapping.Protobuf, "featureFlag": mapping.FeatureFlag, "protocolVerified": mapping.Verified}
	if !flags.EnableTF2Inventory {
		return s.finishTF2Operation(receipt, "blocked_by_feature_flag", "TF2 inventory is disabled", result)
	}
	if !enabled {
		return s.finishTF2Operation(receipt, "blocked_by_feature_flag", mapping.FeatureFlag+" is disabled", result)
	}
	if !mapping.Verified {
		result["captureRequired"] = true
		return s.finishTF2Operation(receipt, "blocked_by_feature_flag", mapping.Reason, result)
	}
	if validationMode && tf2OperationIsPermanent(operation) {
		confirmed, _ := input["confirmed"].(bool)
		if !confirmed {
			return s.finishTF2Operation(receipt, "requires_validation", "confirm the exact permanent TF2 item mutation before sending", result)
		}
	}
	if !connected || steamID == "" {
		return s.finishTF2Operation(receipt, "requires_connection", "connect a Steam account before performing TF2 operations", result)
	}
	if operationType == operations.TypeTF2DecalApply {
		return s.applyTF2Decal(receipt, input, result)
	}
	operationInput := input
	if operationType == operations.TypeTF2MarketRefresh {
		operationInput = cloneInput(input)
		if _, supplied := operationInput["currency"]; !supplied && storeCurrencyID > 0 {
			operationInput["currency"] = uint32(storeCurrencyID)
		}
	}
	body, itemIDs, err := encodeTF2Operation(operation, operationInput)
	if err != nil {
		return s.finishTF2Operation(receipt, "failed", err.Error(), result)
	}
	if err := s.validateTF2OwnedItems(steamID, itemIDs); err != nil {
		return s.finishTF2Operation(receipt, "failed", err.Error(), result)
	}
	if err := s.validateTF2Compatibility(steamID, operation, input); err != nil {
		return s.finishTF2Operation(receipt, "failed", err.Error(), result)
	}
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()
	if err := s.gcClient.SendProtoToGC(ctx, protocol.AppIDTF2, mapping.EMsg, body); err != nil {
		return s.finishTF2Operation(receipt, "failed", "TF2 GC send failed: "+err.Error(), result)
	}
	result["requestBodyBytes"] = len(body)
	result["itemIds"] = uint64Strings(itemIDs)
	for _, key := range []string{"classId", "presetId", "slotId", "itemId", "targetItemId", "sourceItemId", "destinationItemId", "scoreType"} {
		if value, ok := input[key]; ok {
			result[key] = value
		}
	}
	return s.finishTF2Operation(receipt, "awaiting_gc_confirmation", "TF2 request sent; awaiting authoritative SOCache reconciliation", result)
}

func tf2OperationIsPermanent(operation string) bool {
	switch operation {
	case "tf2.items.use", "tf2.tools.strange-part", "tf2.tools.strange-restriction", "tf2.tools.strange-transfer", "tf2.tools.strange-remove", "tf2.tools.strange-reset", "tf2.crafting.craft", "tf2.crafting.trade-up", "tf2.crafting.halloween-offering", "tf2.crafting.stat-clock", "tf2.containers.open", "tf2.customization.decal-apply":
		return true
	default:
		return false
	}
}

func (s *Service) applyTF2Decal(receipt operations.Receipt, input map[string]any, result map[string]any) operations.Receipt {
	toolID, err := requiredUint64Input(input, "toolItemId")
	if err != nil {
		return s.finishTF2Operation(receipt, operations.StateFailed, err.Error(), result)
	}
	subjectID, err := requiredUint64Input(input, "subjectItemId")
	if err != nil {
		return s.finishTF2Operation(receipt, operations.StateFailed, err.Error(), result)
	}
	encoded, ok := input["pngBase64"].(string)
	if !ok || encoded == "" {
		return s.finishTF2Operation(receipt, operations.StateFailed, "pngBase64 is required", result)
	}
	pngBytes, err := base64.StdEncoding.DecodeString(encoded)
	if err != nil {
		return s.finishTF2Operation(receipt, operations.StateFailed, "pngBase64 is invalid: "+err.Error(), result)
	}
	s.mu.Lock()
	_, accountCtx, sessionErr := s.currentGCSessionKeyLocked(protocol.AppIDTF2)
	s.mu.Unlock()
	if sessionErr != nil {
		return s.finishTF2Operation(receipt, operations.StateRequiresConnection, "connect a Steam account before applying a TF2 decal", result)
	}
	ctx, cancel := context.WithTimeout(accountCtx, 75*time.Second)
	defer cancel()
	decal, err := s.gcClient.ApplyTF2Decal(ctx, transport.TF2DecalRequest{ToolItemID: toolID, SubjectItemID: subjectID, PNG: pngBytes})
	if err != nil {
		return s.finishTF2Operation(receipt, operations.StateFailed, "TF2 decal application failed: "+err.Error(), result)
	}
	result["toolItemId"] = fmt.Sprintf("%d", toolID)
	result["subjectItemId"] = fmt.Sprintf("%d", subjectID)
	result["ugcId"] = fmt.Sprintf("%d", decal.UGCID)
	result["responseIndex"] = decal.ResponseIndex
	result["responseCode"] = decal.ResponseCode
	result["inventoryConfirmed"] = decal.InventoryConfirmed
	result["diagnostics"] = decal.Diagnostics
	if decal.InventoryConfirmed {
		return s.finishTF2Operation(receipt, operations.StateCompleted, "TF2 decal applied and confirmed by authoritative inventory", result)
	}
	return s.finishTF2Operation(receipt, operations.StateReconcilingInventory, "TF2 accepted the decal request; authoritative inventory confirmation is still pending", result)
}

func tf2OperationEnabled(flags domain.FeatureFlags, featureFlag string) bool {
	switch featureFlag {
	case "enableTf2Inventory":
		return flags.EnableTF2Inventory
	case "enableTf2Loadouts":
		return flags.EnableTF2Loadouts
	case "enableTf2ItemUse":
		return flags.EnableTF2ItemUse
	case "enableTf2Tools":
		return flags.EnableTF2Tools
	case "enableTf2Crafting":
		return flags.EnableTF2Crafting
	case "enableTf2Tradeups":
		return flags.EnableTF2Tradeups
	case "enableTf2Unboxing":
		return flags.EnableTF2Unboxing
	case "enableTf2Customization":
		return flags.EnableTF2Customization
	default:
		return false
	}
}

func (s *Service) finishTF2Operation(receipt operations.Receipt, state operations.State, message string, result map[string]any) operations.Receipt {
	receipt.State, receipt.Message, receipt.Result = state, message, result
	s.addEvent(receipt, state, message)
	return receipt
}

func (s *Service) validateTF2OwnedItems(steamID string, itemIDs []uint64) error {
	s.mu.Lock()
	defer s.mu.Unlock()
	snapshot, ok := s.gameInventories[gameInventoryKey(steamID, "tf2")]
	if !ok || snapshot.Status != domain.SnapshotStatusReady {
		return fmt.Errorf("refresh the authoritative TF2 GC inventory before performing this operation")
	}
	owned := make(map[string]bool, len(snapshot.Items))
	for _, item := range snapshot.Items {
		owned[item.AssetID] = true
	}
	for _, itemID := range itemIDs {
		if itemID == 0 || !owned[fmt.Sprintf("%d", itemID)] {
			return fmt.Errorf("TF2 item %d is not present in the current GC-owned inventory", itemID)
		}
	}
	return nil
}

func (s *Service) validateTF2Compatibility(steamID, operation string, input map[string]any) error {
	operationType := operations.Type(operation)
	if operation == "tf2.crafting.craft" {
		return s.validateTF2StandardRecipe(steamID, input)
	}
	if operation == "tf2.crafting.trade-up" {
		return s.validateTF2TradeUpIngredients(steamID, input)
	}
	if operation == "tf2.crafting.stat-clock" {
		return s.validateTF2StatClockIngredients(steamID, input)
	}
	if operation == "tf2.crafting.halloween-offering" {
		return s.validateTF2HalloweenOffering(steamID, input)
	}
	if operationType != operations.TypeTF2StrangePart && operationType != operations.TypeTF2StrangeRestriction && operationType != operations.TypeTF2StrangeTransfer && operationType != operations.TypeTF2StrangeRemove && operationType != operations.TypeTF2StrangeReset {
		return nil
	}
	s.mu.Lock()
	snapshot := s.gameInventories[gameInventoryKey(steamID, "tf2")]
	s.mu.Unlock()
	items := make(map[string]domain.EconomyInventoryItem, len(snapshot.Items))
	for _, item := range snapshot.Items {
		items[item.AssetID] = item
	}
	targetKey := "targetItemId"
	if operationType == operations.TypeTF2StrangeTransfer {
		targetKey = "sourceItemId"
	} else if operationType == operations.TypeTF2StrangeRemove || operationType == operations.TypeTF2StrangeReset {
		targetKey = "itemId"
	}
	target := items[stringInput(input, targetKey)]
	if quality := target.Details.SchemaQuality; quality != "" && !strings.EqualFold(quality, "strange") {
		return fmt.Errorf("%s must target a Strange-quality item", operation)
	}
	if operationType == operations.TypeTF2StrangeTransfer {
		destination := items[stringInput(input, "destinationItemId")]
		if quality := destination.Details.SchemaQuality; quality != "" && !strings.EqualFold(quality, "strange") {
			return fmt.Errorf("Strange count transfer destination must be Strange quality")
		}
		if target.DefinitionID != nil && destination.DefinitionID != nil && *target.DefinitionID != *destination.DefinitionID && target.Details.ItemClass != destination.Details.ItemClass {
			return fmt.Errorf("Strange count transfer destination is not schema-compatible with the source")
		}
	}
	if operationType == operations.TypeTF2StrangePart || operationType == operations.TypeTF2StrangeRestriction || operationType == operations.TypeTF2StrangeTransfer {
		tool := items[stringInput(input, "toolItemId")]
		descriptor := strings.TrimSpace(strings.ToLower(tool.Name + " " + tool.Details.ToolType + " " + tool.Details.ItemClass))
		if descriptor != "" {
			expected := "strange"
			if operationType == operations.TypeTF2StrangePart {
				expected = "strange part"
			} else if operationType == operations.TypeTF2StrangeRestriction {
				expected = "restriction"
			} else if operationType == operations.TypeTF2StrangeTransfer {
				expected = "transfer"
			}
			if !strings.Contains(descriptor, expected) {
				return fmt.Errorf("selected owned tool is not compatible with %s", operation)
			}
		}
	}
	return nil
}

func (s *Service) validateTF2HalloweenOffering(steamID string, input map[string]any) error {
	toolID, err := requiredUint64Input(input, "toolItemId")
	if err != nil {
		return err
	}
	itemIDs, err := requiredTF2ItemIDsAtLeast(input, 1)
	if err != nil {
		return err
	}
	s.mu.Lock()
	snapshot := s.gameInventories[gameInventoryKey(steamID, "tf2")]
	s.mu.Unlock()
	items := make(map[string]domain.EconomyInventoryItem, len(snapshot.Items))
	for _, item := range snapshot.Items {
		items[item.AssetID] = item
	}
	tool, found := items[strconv.FormatUint(toolID, 10)]
	if !found {
		return fmt.Errorf("Halloween Offering tool %d is not present in the current inventory", toolID)
	}
	descriptor := strings.ToLower(tool.Name + " " + tool.MarketName + " " + tool.Details.ToolType)
	if !strings.Contains(descriptor, "halloween") && !strings.Contains(descriptor, "offering") {
		return fmt.Errorf("selected tool is not a Halloween Offering")
	}
	for _, itemID := range itemIDs {
		if itemID == toolID {
			return fmt.Errorf("Halloween Offering tool cannot also be an offered item")
		}
		if _, found := items[strconv.FormatUint(itemID, 10)]; !found {
			return fmt.Errorf("offered item %d is not present in the current inventory", itemID)
		}
	}
	return nil
}

func (s *Service) validateTF2StandardRecipe(steamID string, input map[string]any) error {
	recipe, err := requiredTF2Recipe(input)
	if err != nil {
		return err
	}
	ids, err := requiredTF2ItemIDs(input, tf2StandardRecipeCounts[recipe])
	if err != nil {
		return err
	}
	s.mu.Lock()
	snapshot := s.gameInventories[gameInventoryKey(steamID, "tf2")]
	s.mu.Unlock()
	items := make([]domain.EconomyInventoryItem, 0, len(ids))
	byID := make(map[string]domain.EconomyInventoryItem, len(snapshot.Items))
	for _, item := range snapshot.Items {
		byID[item.AssetID] = item
	}
	for _, id := range ids {
		items = append(items, byID[fmt.Sprintf("%d", id)])
	}
	isWeapon := func(item domain.EconomyInventoryItem) bool { return item.Details.CraftMaterialType == "weapon" }
	isRefined := func(item domain.EconomyInventoryItem) bool { return item.Name == "Refined Metal" }
	isClassToken := func(item domain.EconomyInventoryItem) bool { return item.Details.ItemClass == "class_token" }
	isSlotToken := func(item domain.EconomyInventoryItem) bool { return item.Details.ItemClass == "slot_token" }
	count := func(predicate func(domain.EconomyInventoryItem) bool) int {
		result := 0
		for _, item := range items {
			if predicate(item) {
				result++
			}
		}
		return result
	}
	switch recipe {
	case 3, 7:
		if count(isWeapon) != len(items) || !sameTF2UsableClass(items) {
			return fmt.Errorf("TF2 recipe %d requires weapons usable by the same class", recipe)
		}
	case 4:
		if count(func(item domain.EconomyInventoryItem) bool { return item.Name == "Scrap Metal" }) != len(items) {
			return fmt.Errorf("TF2 recipe 4 requires Scrap Metal")
		}
	case 5:
		if count(func(item domain.EconomyInventoryItem) bool { return item.Name == "Reclaimed Metal" }) != len(items) {
			return fmt.Errorf("TF2 recipe 5 requires Reclaimed Metal")
		}
	case 6:
		if count(isRefined) != len(items) {
			return fmt.Errorf("TF2 recipe 6 requires Refined Metal")
		}
	case 8:
		if count(isWeapon) != len(items) || !sameTF2EquipSlot(items) {
			return fmt.Errorf("TF2 recipe 8 requires weapons from the same slot")
		}
	case 9:
		if count(func(item domain.EconomyInventoryItem) bool { return item.Details.CraftMaterialType == "hat" }) != len(items) {
			return fmt.Errorf("TF2 recipe 9 requires craftable headgear")
		}
	case 10:
		if count(isRefined) != 4 || count(isClassToken) != 1 {
			return fmt.Errorf("TF2 recipe 10 requires four Refined Metal and one Class Token")
		}
	case 11:
		if count(isRefined) != 3 || count(isClassToken) != 1 || count(isSlotToken) != 1 {
			return fmt.Errorf("TF2 recipe 11 requires three Refined Metal, one Class Token, and one Slot Token")
		}
	case 13:
		if count(isWeapon) != 1 || count(isClassToken) != 1 {
			return fmt.Errorf("TF2 recipe 13 requires one weapon and one Class Token")
		}
	case 14:
		if count(isWeapon) != 1 || count(isSlotToken) != 1 {
			return fmt.Errorf("TF2 recipe 14 requires one weapon and one Slot Token")
		}
	case 15:
		if count(func(item domain.EconomyInventoryItem) bool { return isClassToken(item) || isSlotToken(item) }) != len(items) {
			return fmt.Errorf("TF2 recipe 15 requires three Class or Slot Tokens")
		}
	}
	return nil
}

func sameTF2UsableClass(items []domain.EconomyInventoryItem) bool {
	if len(items) == 0 || len(items[0].Details.UsableClasses) == 0 {
		return false
	}
	for _, candidate := range items[1:] {
		shared := false
		for _, firstClass := range items[0].Details.UsableClasses {
			for _, candidateClass := range candidate.Details.UsableClasses {
				if firstClass == candidateClass {
					shared = true
				}
			}
		}
		if !shared {
			return false
		}
	}
	return true
}

func sameTF2EquipSlot(items []domain.EconomyInventoryItem) bool {
	if len(items) == 0 || items[0].Details.EquipSlot == "" {
		return false
	}
	for _, item := range items[1:] {
		if item.Details.EquipSlot != items[0].Details.EquipSlot {
			return false
		}
	}
	return true
}

func (s *Service) validateTF2TradeUpIngredients(steamID string, input map[string]any) error {
	ids, err := requiredTF2ItemIDs(input, 10)
	if err != nil {
		return err
	}
	s.mu.Lock()
	snapshot := s.gameInventories[gameInventoryKey(steamID, "tf2")]
	s.mu.Unlock()
	items := make(map[string]domain.EconomyInventoryItem, len(snapshot.Items))
	for _, item := range snapshot.Items {
		items[item.AssetID] = item
	}
	first, found := items[fmt.Sprintf("%d", ids[0])]
	if !found {
		return fmt.Errorf("TF2 trade-up input %d is not present in the current inventory", ids[0])
	}
	for _, id := range ids {
		item, found := items[fmt.Sprintf("%d", id)]
		if !found || item.Details.Collection == "" || item.Details.Rarity == "" || len(item.Details.TradeUpItems) == 0 {
			return fmt.Errorf("all TF2 trade-up inputs must be eligible collection items")
		}
		if item.Quality != first.Quality || item.Details.Rarity != first.Details.Rarity {
			return fmt.Errorf("all TF2 trade-up inputs must have the same quality and grade")
		}
	}
	return nil
}

func (s *Service) validateTF2StatClockIngredients(
	steamID string,
	input map[string]any,
) error {
	ids, err := requiredTF2ItemIDs(input, 5)
	if err != nil {
		return err
	}
	s.mu.Lock()
	snapshot := s.gameInventories[gameInventoryKey(steamID, "tf2")]
	s.mu.Unlock()
	items := make(map[string]domain.EconomyInventoryItem, len(snapshot.Items))
	for _, item := range snapshot.Items {
		items[item.AssetID] = item
	}
	eligibleRarities := map[string]bool{
		"uncommon": true, "rare": true, "mythical": true,
		"legendary": true, "ancient": true, "freelance": true,
		"mercenary": true, "commando": true, "assassin": true, "elite": true,
	}
	for _, id := range ids {
		item := items[strconv.FormatUint(id, 10)]
		quality := strings.ToLower(firstNonEmptyApp(
			item.Quality,
			item.Details.SchemaQuality,
		))
		rarity := strings.ToLower(item.Details.Rarity)
		if quality != "strange" && !eligibleRarities[rarity] {
			return fmt.Errorf(
				"TF2 Stat Clock ingredients must be Strange or Freelance Grade or higher",
			)
		}
	}
	return nil
}

func encodeTF2Operation(operation string, input map[string]any) ([]byte, []uint64, error) {
	switch operation {
	case "tf2.loadout.equip":
		return encodeTF2Equip(input)
	case "tf2.loadout.set-preset-item":
		return encodeTF2PresetItem(input)
	case "tf2.loadout.select-preset":
		return encodeTF2PresetSelection(input)
	case "tf2.backpack.sort":
		sortType, err := optionalUint32Input(input, "sortType")
		if err != nil {
			return nil, nil, err
		}
		body, err := tf2tracking.MarshalFields("CMsgSortItems", map[string]any{"sort_type": sortType})
		return body, nil, err
	case "tf2.crafting.craft":
		recipe, err := requiredTF2Recipe(input)
		if err != nil {
			return nil, nil, err
		}
		itemIDs, err := requiredTF2ItemIDs(input, tf2StandardRecipeCounts[recipe])
		if err != nil {
			return nil, nil, err
		}
		body, err := protocol.EncodeTF2CraftRequest(recipe, itemIDs)
		return body, itemIDs, err
	case "tf2.crafting.trade-up":
		itemIDs, err := requiredTF2ItemIDs(input, 10)
		if err != nil {
			return nil, nil, err
		}
		body, err := tf2tracking.MarshalFields("CMsgCraftCollectionUpgrade", map[string]any{"item_id": itemIDs})
		return body, itemIDs, err
	case "tf2.crafting.halloween-offering":
		toolID, err := requiredUint64Input(input, "toolItemId")
		if err != nil {
			return nil, nil, err
		}
		itemIDs, err := requiredTF2ItemIDsAtLeast(input, 1)
		if err != nil {
			return nil, nil, err
		}
		body, err := tf2tracking.MarshalFields("CMsgCraftHalloweenOffering", map[string]any{"tool_id": toolID, "item_id": itemIDs})
		return body, append([]uint64{toolID}, itemIDs...), err
	case "tf2.items.use":
		itemID, err := requiredUint64Input(input, "itemId")
		if err != nil {
			return nil, nil, err
		}
		body, err := tf2tracking.MarshalFields("CMsgUseItem", map[string]any{"item_id": itemID})
		return body, []uint64{itemID}, err
	case "tf2.tools.strange-part":
		return encodeTF2TwoItemTool(input, "toolItemId", "targetItemId", func(toolID, targetID uint64) ([]byte, error) {
			return tf2tracking.MarshalFields("CMsgApplyStrangePart", map[string]any{"strange_part_item_id": toolID, "item_item_id": targetID})
		})
	case "tf2.tools.strange-restriction":
		return encodeTF2StrangeRestriction(input)
	case "tf2.tools.strange-transfer":
		return encodeTF2StrangeTransfer(input)
	case "tf2.tools.strange-remove":
		return encodeTF2StrangeRemove(input)
	case "tf2.tools.strange-reset":
		return encodeTF2StrangeReset(input)
	case "tf2.matches.load":
		matchGroup, err := requiredInt32Input(input, "matchGroup")
		if err != nil {
			return nil, nil, err
		}
		body, err := tf2tracking.Marshal("CMsgGCMatchHistoryLoad", map[string]uint64{"match_group": uint64(matchGroup)})
		return body, nil, err
	case "tf2.matches.stats":
		body, err := tf2tracking.Marshal("CMsgGCRequestMatchMakerStats", map[string]uint64{})
		return body, nil, err
	case "tf2.inspect.resolve":
		return encodeTF2Inspect(input)
	case "tf2.market.refresh":
		currency, err := optionalUint32Input(input, "currency")
		if err != nil {
			return nil, nil, err
		}
		body, err := tf2tracking.Marshal("CMsgGCClientMarketDataRequest", map[string]uint64{"user_currency": uint64(currency)})
		return body, nil, err
	case "tf2.crafting.stat-clock":
		itemIDs, err := requiredTF2ItemIDs(input, 5)
		if err != nil {
			return nil, nil, err
		}
		body, err := tf2tracking.MarshalFields(
			"CMsgCraftCommonStatClock",
			map[string]any{"item_id": itemIDs},
		)
		return body, itemIDs, err
	default:
		return nil, nil, fmt.Errorf("TF2 operation %q has no verified encoder", operation)
	}
}

func requiredTF2ItemIDs(input map[string]any, required int) ([]uint64, error) {
	values, ok := input["itemIds"].([]any)
	if !ok || len(values) != required {
		return nil, fmt.Errorf("itemIds must contain exactly %d items", required)
	}
	items := make([]uint64, 0, len(values))
	seen := make(map[uint64]bool, len(values))
	for _, value := range values {
		id, err := requiredUint64Input(map[string]any{"itemId": value}, "itemId")
		if err != nil || id == 0 || seen[id] {
			return nil, fmt.Errorf("itemIds must contain unique valid Steam item ids")
		}
		seen[id] = true
		items = append(items, id)
	}
	return items, nil
}

func requiredTF2ItemIDsAtLeast(input map[string]any, minimum int) ([]uint64, error) {
	values, ok := input["itemIds"].([]any)
	if !ok || len(values) < minimum {
		return nil, fmt.Errorf("itemIds must contain at least %d items", minimum)
	}
	items := make([]uint64, 0, len(values))
	seen := make(map[uint64]bool, len(values))
	for _, value := range values {
		id, err := requiredUint64Input(map[string]any{"itemId": value}, "itemId")
		if err != nil || id == 0 || seen[id] {
			return nil, fmt.Errorf("itemIds must contain unique valid Steam item ids")
		}
		seen[id] = true
		items = append(items, id)
	}
	return items, nil
}

var tf2StandardRecipeCounts = map[int16]int{
	3: 2, 4: 3, 5: 3, 6: 3, 7: 3, 8: 3, 9: 2,
	10: 5, 11: 5, 13: 2, 14: 2, 15: 3,
}

func requiredTF2Recipe(input map[string]any) (int16, error) {
	value, ok := input["recipe"]
	if !ok {
		return 0, fmt.Errorf("recipe is required; wildcard TF2 recipes are not supported")
	}
	recipe, err := requiredUint64Input(map[string]any{"recipe": value}, "recipe")
	if err != nil || recipe > uint64(^uint16(0)>>1) || tf2StandardRecipeCounts[int16(recipe)] == 0 {
		return 0, fmt.Errorf("recipe %d is not a supported standard TF2 recipe", recipe)
	}
	return int16(recipe), nil
}

func encodeTF2PresetItem(input map[string]any) ([]byte, []uint64, error) {
	itemID, err := requiredUint64Input(input, "itemId")
	if err != nil {
		return nil, nil, err
	}
	classID, err := requiredUint32Input(input, "classId")
	if err != nil {
		return nil, nil, err
	}
	presetID, err := requiredUint32Input(input, "presetId")
	if err != nil {
		return nil, nil, err
	}
	slotID, err := requiredUint32Input(input, "slotId")
	if err != nil {
		return nil, nil, err
	}
	body, err := tf2tracking.Marshal("CMsgSetPresetItemPosition", map[string]uint64{"class_id": uint64(classID), "preset_id": uint64(presetID), "slot_id": uint64(slotID), "item_id": itemID})
	return body, []uint64{itemID}, err
}

func encodeTF2PresetSelection(input map[string]any) ([]byte, []uint64, error) {
	classID, err := requiredUint32Input(input, "classId")
	if err != nil {
		return nil, nil, err
	}
	presetID, err := requiredUint32Input(input, "presetId")
	if err != nil {
		return nil, nil, err
	}
	body, err := tf2tracking.Marshal("CMsgSelectPresetForClass", map[string]uint64{"class_id": uint64(classID), "preset_id": uint64(presetID)})
	return body, nil, err
}

func encodeTF2StrangeRemove(input map[string]any) ([]byte, []uint64, error) {
	itemID, err := requiredUint64Input(input, "itemId")
	if err != nil {
		return nil, nil, err
	}
	scoreType, err := requiredUint32Input(input, "scoreType")
	if err != nil {
		return nil, nil, err
	}
	body, err := tf2tracking.Marshal("CMsgGCRemoveStrangePart", map[string]uint64{"item_id": itemID, "strange_part_score_type": uint64(scoreType)})
	return body, []uint64{itemID}, err
}

func encodeTF2StrangeReset(input map[string]any) ([]byte, []uint64, error) {
	itemID, err := requiredUint64Input(input, "itemId")
	if err != nil {
		return nil, nil, err
	}
	body, err := tf2tracking.Marshal("CMsgGCResetStrangeScores", map[string]uint64{"item_id": itemID})
	return body, []uint64{itemID}, err
}

func encodeTF2Inspect(input map[string]any) ([]byte, []uint64, error) {
	if inspectURL, _ := input["inspectUrl"].(string); inspectURL != "" {
		params, err := parseTF2InspectURL(inspectURL)
		if err != nil {
			return nil, nil, err
		}
		input = params
	}
	s, err := optionalUint64Input(input, "paramS")
	if err != nil {
		return nil, nil, err
	}
	a, err := optionalUint64Input(input, "paramA")
	if err != nil {
		return nil, nil, err
	}
	d, err := optionalUint64Input(input, "paramD")
	if err != nil {
		return nil, nil, err
	}
	m, err := optionalUint64Input(input, "paramM")
	if err != nil {
		return nil, nil, err
	}
	if a == 0 || d == 0 || (s == 0 && m == 0) {
		return nil, nil, fmt.Errorf("TF2 inspect requires A and D plus either S or M")
	}
	body, err := tf2tracking.Marshal("CMsgGC_Client2GCEconPreviewDataBlockRequest", map[string]uint64{"param_s": s, "param_a": a, "param_d": d, "param_m": m})
	return body, nil, err
}
