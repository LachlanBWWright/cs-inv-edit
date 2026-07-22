package app

import (
	"context"
	"fmt"
	"time"

	"cs-inv-edit/backend/internal/domain"
	"cs-inv-edit/backend/internal/operations"
	multigamepb "cs-inv-edit/backend/internal/proto/generated/multigamepb"
	"cs-inv-edit/backend/internal/protocol"
	"google.golang.org/protobuf/proto"
)

func (s *Service) submitTF2Operation(receipt operations.Receipt, operation string, input map[string]any) operations.Receipt {
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
	connected := s.connection.State == "connected"
	steamID := s.connection.SteamID
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
	body, itemIDs, err := encodeTF2Operation(operation, input)
	if err != nil {
		return s.finishTF2Operation(receipt, "failed", err.Error(), result)
	}
	if err := s.validateTF2OwnedItems(steamID, itemIDs); err != nil {
		return s.finishTF2Operation(receipt, "failed", err.Error(), result)
	}
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()
	if err := s.gcClient.SendProtoToGC(ctx, protocol.AppIDTF2, mapping.EMsg, body); err != nil {
		return s.finishTF2Operation(receipt, "failed", "TF2 GC send failed: "+err.Error(), result)
	}
	result["requestBodyBytes"] = len(body)
	result["itemIds"] = uint64Strings(itemIDs)
	return s.finishTF2Operation(receipt, "awaiting_gc_confirmation", "TF2 request sent; awaiting authoritative SOCache reconciliation", result)
}

func tf2OperationIsPermanent(operation string) bool {
	switch operation {
	case "tf2.items.use", "tf2.tools.strange-part", "tf2.tools.strange-restriction", "tf2.tools.strange-transfer", "tf2.crafting.craft", "tf2.containers.open":
		return true
	default:
		return false
	}
}

func tf2OperationEnabled(flags domain.FeatureFlags, featureFlag string) bool {
	switch featureFlag {
	case "enableTf2Loadouts":
		return flags.EnableTF2Loadouts
	case "enableTf2ItemUse":
		return flags.EnableTF2ItemUse
	case "enableTf2Tools":
		return flags.EnableTF2Tools
	case "enableTf2Crafting":
		return flags.EnableTF2Crafting
	case "enableTf2Unboxing":
		return flags.EnableTF2Unboxing
	case "enableTf2Customization":
		return flags.EnableTF2Customization
	default:
		return false
	}
}

func (s *Service) finishTF2Operation(receipt operations.Receipt, state string, message string, result map[string]any) operations.Receipt {
	receipt.State, receipt.Message, receipt.Result = state, message, result
	s.addEvent(receipt, state, message)
	return receipt
}

func (s *Service) validateTF2OwnedItems(steamID string, itemIDs []uint64) error {
	s.mu.Lock()
	defer s.mu.Unlock()
	snapshot, ok := s.gameInventories[gameInventoryKey(steamID, "tf2")]
	if !ok || snapshot.Status != "ready" {
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

func encodeTF2Operation(operation string, input map[string]any) ([]byte, []uint64, error) {
	switch operation {
	case "tf2.loadout.equip":
		return encodeTF2Equip(input)
	case "tf2.backpack.sort":
		sortType, err := optionalUint32Input(input, "sortType")
		if err != nil {
			return nil, nil, err
		}
		body, err := proto.Marshal(&multigamepb.CMsgSortItems{SortType: proto.Uint32(sortType)})
		return body, nil, err
	case "tf2.items.use":
		itemID, err := requiredUint64Input(input, "itemId")
		if err != nil {
			return nil, nil, err
		}
		body, err := proto.Marshal(&multigamepb.CMsgUseItem{ItemId: proto.Uint64(itemID)})
		return body, []uint64{itemID}, err
	case "tf2.tools.strange-part":
		return encodeTF2TwoItemTool(input, "toolItemId", "targetItemId", func(toolID, targetID uint64) proto.Message {
			return &multigamepb.CMsgApplyStrangePart{StrangePartItemId: proto.Uint64(toolID), ItemItemId: proto.Uint64(targetID)}
		})
	case "tf2.tools.strange-restriction":
		return encodeTF2StrangeRestriction(input)
	case "tf2.tools.strange-transfer":
		return encodeTF2StrangeTransfer(input)
	default:
		return nil, nil, fmt.Errorf("TF2 operation %q has no verified encoder", operation)
	}
}

func encodeTF2Equip(input map[string]any) ([]byte, []uint64, error) {
	itemID, err := requiredUint64Input(input, "itemId")
	if err != nil {
		return nil, nil, err
	}
	classID, err := optionalUint32Input(input, "classId")
	if err != nil {
		return nil, nil, err
	}
	slotID, err := optionalUint32Input(input, "slotId")
	if err != nil {
		return nil, nil, err
	}
	body, err := proto.Marshal(&multigamepb.CMsgAdjustItemEquippedState{ItemId: proto.Uint64(itemID), NewClass: proto.Uint32(classID), NewSlot: proto.Uint32(slotID)})
	return body, []uint64{itemID}, err
}

func encodeTF2TwoItemTool(input map[string]any, toolKey string, targetKey string, message func(uint64, uint64) proto.Message) ([]byte, []uint64, error) {
	toolID, err := requiredUint64Input(input, toolKey)
	if err != nil {
		return nil, nil, err
	}
	targetID, err := requiredUint64Input(input, targetKey)
	if err != nil {
		return nil, nil, err
	}
	if toolID == targetID {
		return nil, nil, fmt.Errorf("tool and target item IDs must be distinct")
	}
	body, err := proto.Marshal(message(toolID, targetID))
	return body, []uint64{toolID, targetID}, err
}

func encodeTF2StrangeRestriction(input map[string]any) ([]byte, []uint64, error) {
	index, err := optionalUint32Input(input, "attributeIndex")
	if err != nil {
		return nil, nil, err
	}
	return encodeTF2TwoItemTool(input, "toolItemId", "targetItemId", func(toolID, targetID uint64) proto.Message {
		return &multigamepb.CMsgApplyStrangeRestriction{StrangePartItemId: proto.Uint64(toolID), ItemItemId: proto.Uint64(targetID), StrangeAttrIndex: proto.Uint32(index)}
	})
}

func encodeTF2StrangeTransfer(input map[string]any) ([]byte, []uint64, error) {
	toolID, err := requiredUint64Input(input, "toolItemId")
	if err != nil {
		return nil, nil, err
	}
	sourceID, err := requiredUint64Input(input, "sourceItemId")
	if err != nil {
		return nil, nil, err
	}
	destinationID, err := requiredUint64Input(input, "destinationItemId")
	if err != nil {
		return nil, nil, err
	}
	if toolID == sourceID || toolID == destinationID || sourceID == destinationID {
		return nil, nil, fmt.Errorf("tool, source, and destination item IDs must be distinct")
	}
	body, err := proto.Marshal(&multigamepb.CMsgApplyStrangeCountTransfer{ToolItemId: proto.Uint64(toolID), ItemSrcItemId: proto.Uint64(sourceID), ItemDestItemId: proto.Uint64(destinationID)})
	return body, []uint64{toolID, sourceID, destinationID}, err
}

func optionalUint32Input(input map[string]any, key string) (uint32, error) {
	value, ok := input[key]
	if !ok {
		return 0, nil
	}
	parsed, err := requiredUint64Input(map[string]any{key: value}, key)
	if err != nil || parsed > uint64(^uint32(0)) {
		return 0, fmt.Errorf("%s must be a uint32", key)
	}
	return uint32(parsed), nil
}

func uint64Strings(values []uint64) []string {
	out := make([]string, len(values))
	for index, value := range values {
		out[index] = fmt.Sprintf("%d", value)
	}
	return out
}
