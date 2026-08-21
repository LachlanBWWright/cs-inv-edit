package app

import (
	"fmt"
	"net/url"
	"regexp"
	"strconv"

	"cs-inv-edit/backend/internal/proto/tf2tracking"
)

var tf2InspectPatterns = []*regexp.Regexp{regexp.MustCompile(`(?i)\bS(\d+)A(\d+)D(\d+)`), regexp.MustCompile(`(?i)\bM(\d+)A(\d+)D(\d+)`)}

func parseTF2InspectURL(raw string) (map[string]any, error) {
	decoded, err := url.QueryUnescape(raw)
	if err != nil {
		return nil, fmt.Errorf("TF2 inspect action is malformed")
	}
	for index, pattern := range tf2InspectPatterns {
		match := pattern.FindStringSubmatch(decoded)
		if len(match) != 4 {
			continue
		}
		first, firstErr := strconv.ParseUint(match[1], 10, 64)
		asset, assetErr := strconv.ParseUint(match[2], 10, 64)
		definition, definitionErr := strconv.ParseUint(match[3], 10, 64)
		if firstErr != nil || assetErr != nil || definitionErr != nil {
			return nil, fmt.Errorf("TF2 inspect action contains invalid parameters")
		}
		params := map[string]any{"paramA": strconv.FormatUint(asset, 10), "paramD": strconv.FormatUint(definition, 10)}
		if index == 0 {
			params["paramS"] = strconv.FormatUint(first, 10)
		} else {
			params["paramM"] = strconv.FormatUint(first, 10)
		}
		return params, nil
	}
	return nil, fmt.Errorf("TF2 inspect action does not contain S/A/D or M/A/D parameters")
}

func cloneInput(source map[string]any) map[string]any {
	clone := make(map[string]any, len(source)+1)
	for key, value := range source {
		clone[key] = value
	}
	return clone
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
	body, err := tf2tracking.MarshalFields("CMsgAdjustItemEquippedState", map[string]any{"item_id": itemID, "new_class": classID, "new_slot": slotID})
	return body, []uint64{itemID}, err
}

func encodeTF2TwoItemTool(input map[string]any, toolKey, targetKey string, encode func(uint64, uint64) ([]byte, error)) ([]byte, []uint64, error) {
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
	body, err := encode(toolID, targetID)
	return body, []uint64{toolID, targetID}, err
}

func encodeTF2StrangeRestriction(input map[string]any) ([]byte, []uint64, error) {
	index, err := optionalUint32Input(input, "attributeIndex")
	if err != nil {
		return nil, nil, err
	}
	return encodeTF2TwoItemTool(input, "toolItemId", "targetItemId", func(toolID, targetID uint64) ([]byte, error) {
		return tf2tracking.MarshalFields("CMsgApplyStrangeRestriction", map[string]any{"strange_part_item_id": toolID, "item_item_id": targetID, "strange_attr_index": index})
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
	body, err := tf2tracking.MarshalFields("CMsgApplyStrangeCountTransfer", map[string]any{"tool_item_id": toolID, "item_src_item_id": sourceID, "item_dest_item_id": destinationID})
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
func requiredInt32Input(input map[string]any, key string) (int32, error) {
	value, err := requiredUint64Input(input, key)
	if err != nil || value > uint64(^uint32(0)>>1) {
		return 0, fmt.Errorf("%s must be a non-negative int32", key)
	}
	return int32(value), nil
}
func uint64Strings(values []uint64) []string {
	out := make([]string, len(values))
	for index, value := range values {
		out[index] = fmt.Sprintf("%d", value)
	}
	return out
}
