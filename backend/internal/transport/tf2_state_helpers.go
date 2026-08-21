package transport

import (
	"encoding/base64"
	"encoding/json"
	"fmt"
	"strconv"

	"cs-inv-edit/backend/internal/proto/tf2tracking"
)

func decodeTF2Objects(name string, objects [][]byte, diagnostics *[]string) []map[string]any {
	values := make([]map[string]any, 0, len(objects))
	for _, object := range objects {
		value, err := decodeTF2Map(name, object)
		if err != nil {
			*diagnostics = append(*diagnostics, fmt.Sprintf("decode %s: %v", name, err))
			continue
		}
		values = append(values, value)
	}
	return values
}

func decodeTF2Map(name string, body []byte) (map[string]any, error) {
	decoded, err := tf2tracking.DecodeMessageJSON(name, body)
	if err != nil {
		return nil, err
	}
	var value map[string]any
	if err := json.Unmarshal(decoded, &value); err != nil {
		return nil, err
	}
	return value, nil
}

func uint32Value(value any) uint32 {
	switch typed := value.(type) {
	case float64:
		return uint32(typed)
	case string:
		parsed, _ := strconv.ParseUint(typed, 10, 32)
		return uint32(parsed)
	default:
		return 0
	}
}

func stringValue(value any) string {
	switch typed := value.(type) {
	case string:
		return typed
	case float64:
		return strconv.FormatUint(uint64(typed), 10)
	default:
		return ""
	}
}

func decodeBase64(value any) []byte {
	encoded, _ := value.(string)
	decoded, _ := base64.StdEncoding.DecodeString(encoded)
	return decoded
}

func upsertTF2PresetItem(entries []TF2PresetItem, next TF2PresetItem) []TF2PresetItem {
	for index, entry := range entries {
		if entry.ClassID == next.ClassID && entry.PresetID == next.PresetID && entry.SlotID == next.SlotID {
			entries[index] = next
			return entries
		}
	}
	return append(entries, next)
}

func upsertTF2ClassPreset(entries []TF2ClassPreset, next TF2ClassPreset) []TF2ClassPreset {
	for index, entry := range entries {
		if entry.ClassID == next.ClassID {
			entries[index] = next
			return entries
		}
	}
	return append(entries, next)
}

func upsertTF2Map(entries []map[string]any, next map[string]any) []map[string]any {
	nextKey := tf2MapIdentity(next)
	if nextKey != "" {
		for index, entry := range entries {
			if tf2MapIdentity(entry) == nextKey {
				entries[index] = next
				return entries
			}
		}
	}
	return append(entries, next)
}

func removeTF2Map(entries []map[string]any, target map[string]any) []map[string]any {
	targetKey := tf2MapIdentity(target)
	if targetKey == "" {
		return entries
	}
	filtered := entries[:0]
	for _, entry := range entries {
		if tf2MapIdentity(entry) != targetKey {
			filtered = append(filtered, entry)
		}
	}
	return filtered
}

func tf2MapIdentity(value map[string]any) string {
	for _, key := range []string{"quest_id", "match_id", "notification_id", "account_id", "node_defindex", "reward_defindex", "rating_type"} {
		if id := stringValue(value[key]); id != "" && id != "0" {
			return key + ":" + id
		}
	}
	return ""
}

func cloneTF2FeatureSnapshot(source TF2FeatureSnapshot) TF2FeatureSnapshot {
	encoded, err := json.Marshal(source)
	if err != nil {
		return emptyTF2FeatureSnapshot()
	}
	var clone TF2FeatureSnapshot
	if err := json.Unmarshal(encoded, &clone); err != nil {
		return emptyTF2FeatureSnapshot()
	}
	return clone
}
