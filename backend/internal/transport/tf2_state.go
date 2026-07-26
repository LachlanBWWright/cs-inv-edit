package transport

import (
	"encoding/base64"
	"encoding/json"
	"fmt"
	"strconv"
	"time"

	multigamepb "cs-inv-edit/backend/internal/proto/generated/multigamepb"
	"cs-inv-edit/backend/internal/proto/tf2tracking"
	"google.golang.org/protobuf/proto"
)

const (
	tf2SOTypeLadder       = 39
	tf2SOTypeMatch        = 40
	tf2SOTypeXPSource     = 41
	tf2SOTypeNotification = 42
	tf2SOTypeQuestNode    = 44
	tf2SOTypeQuest        = 45
	tf2SOTypeQuestReward  = 46
	tf2SOTypeRating       = 2007
)

func emptyTF2FeatureSnapshot() TF2FeatureSnapshot {
	return TF2FeatureSnapshot{
		Status: "waiting", PresetItems: []TF2PresetItem{}, ClassPresets: []TF2ClassPreset{},
		Matches: []map[string]any{}, Ladder: []map[string]any{}, Ratings: []map[string]any{},
		Quests: []map[string]any{}, QuestNodes: []map[string]any{}, QuestRewards: []map[string]any{},
		Activity: []TF2ActivityEntry{}, Market: []TF2MarketEntry{}, Diagnostics: []string{},
	}
}

func (s *SteamGCClient) TF2Features() TF2FeatureSnapshot {
	s.tf2Mu.Lock()
	defer s.tf2Mu.Unlock()
	return cloneTF2FeatureSnapshot(s.tf2Features)
}

func (s *SteamGCClient) recordTF2State(direction string, appID, emsg uint32, body []byte) {
	if direction != "received" || appID != 440 {
		return
	}
	s.tf2Mu.Lock()
	defer s.tf2Mu.Unlock()
	s.tf2Features.Status = "ready"
	s.tf2Features.RefreshedAt = time.Now().UTC().Format(time.RFC3339Nano)
	switch emsg {
	case 21, 22:
		s.decodeTF2SingleObject(body)
	case 23:
		s.decodeTF2RemovedObject(body)
	case 24:
		s.decodeTF2Subscribed(body)
	case 26:
		s.decodeTF2MultipleObjects(body)
	case 1081:
		s.decodeTF2Market(body)
	case 1062:
		if value, err := decodeTF2Map("CMsgItemAcknowledged", body); err == nil {
			s.appendTF2Activity("item_pickup", stringValue(value["inventory"]), value)
		}
	case 6403:
		s.decodeTF2Inspect(body)
	case 6553:
		if value, err := decodeTF2Map("CMsgQuestProgressReport", body); err == nil {
			s.appendTF2Activity("quest_progress", stringValue(value["quest_id"]), value)
		}
	case 6517:
		if value, err := decodeTF2Map("CMsgGC_DailyCompetitiveStatsRollup_Response", body); err == nil {
			s.tf2Features.DailyStats = value
		}
	case 6525:
		if value, err := decodeTF2Map("CMsgGCMatchMakerStatsResponse", body); err == nil {
			s.tf2Features.Matchmaking = value
		}
	case 6528:
		if value, err := decodeTF2Map("CMsgGCDataCenterPing_Update", body); err == nil {
			s.tf2Features.DataCenterPing = value
		}
	}
}

func (s *SteamGCClient) decodeTF2SingleObject(body []byte) {
	value, err := decodeTF2Map("CMsgSOSingleObject", body)
	if err != nil {
		s.tf2Diagnostic("decode TF2 shared-object update: " + err.Error())
		return
	}
	s.mergeTF2Object(int32(uint32Value(value["type_id"])), decodeBase64(value["object_data"]))
}

func (s *SteamGCClient) decodeTF2RemovedObject(body []byte) {
	value, err := decodeTF2Map("CMsgSOSingleObject", body)
	if err != nil {
		s.tf2Diagnostic("decode TF2 shared-object removal: " + err.Error())
		return
	}
	s.removeTF2Object(int32(uint32Value(value["type_id"])), decodeBase64(value["object_data"]))
}

func (s *SteamGCClient) decodeTF2MultipleObjects(body []byte) {
	value, err := decodeTF2Map("CMsgSOMultipleObjects", body)
	if err != nil {
		s.tf2Diagnostic("decode TF2 shared-object batch update: " + err.Error())
		return
	}
	objects, _ := value["objects"].([]any)
	for _, source := range objects {
		object, _ := source.(map[string]any)
		s.mergeTF2Object(int32(uint32Value(object["type_id"])), decodeBase64(object["object_data"]))
	}
}

func (s *SteamGCClient) mergeTF2Object(typeID int32, object []byte) {
	if len(object) == 0 || typeID == 1 {
		return
	}
	names := tf2FeatureObjectNames()
	if name, ok := names[typeID]; ok {
		value, err := decodeTF2Map(name, object)
		if err != nil {
			s.tf2Diagnostic(fmt.Sprintf("decode %s update: %v", name, err))
			return
		}
		s.mergeKnownTF2Object(typeID, value)
		return
	}
	s.mergeTF2PresetObject(typeID, object)
}

func (s *SteamGCClient) mergeKnownTF2Object(typeID int32, value map[string]any) {
	switch typeID {
	case tf2SOTypeXPSource:
		s.appendTF2Activity("xp", stringValue(value["match_id"]), value)
	case tf2SOTypeNotification:
		s.appendTF2Activity("notification", stringValue(value["notification_id"]), value)
	case tf2SOTypeLadder:
		s.tf2Features.Ladder = upsertTF2Map(s.tf2Features.Ladder, value)
	case tf2SOTypeMatch:
		s.tf2Features.Matches = upsertTF2Map(s.tf2Features.Matches, value)
	case tf2SOTypeRating:
		s.tf2Features.Ratings = upsertTF2Map(s.tf2Features.Ratings, value)
	case tf2SOTypeQuest:
		s.tf2Features.Quests = upsertTF2Map(s.tf2Features.Quests, value)
	case tf2SOTypeQuestNode:
		s.tf2Features.QuestNodes = upsertTF2Map(s.tf2Features.QuestNodes, value)
	case tf2SOTypeQuestReward:
		s.tf2Features.QuestRewards = upsertTF2Map(s.tf2Features.QuestRewards, value)
	}
}

func (s *SteamGCClient) mergeTF2PresetObject(typeID int32, object []byte) {
	if value, err := decodeTF2Map("CSOEconItemPresetInstance", object); err == nil {
		entry := TF2PresetItem{
			ClassID: uint32Value(value["class_id"]), PresetID: uint32Value(value["preset_id"]),
			SlotID: uint32Value(value["slot_id"]), ItemID: stringValue(value["item_id"]),
		}
		if entry.ClassID >= 1 && entry.ClassID <= 9 && entry.PresetID <= 3 && entry.SlotID <= 18 && entry.ItemID != "" && entry.ItemID != "0" {
			s.tf2Features.PresetItems = upsertTF2PresetItem(s.tf2Features.PresetItems, entry)
			s.tf2Diagnostic(fmt.Sprintf("detected TF2 preset-instance SO type %d", typeID))
			return
		}
	}
	if value, err := decodeTF2Map("CSOClassPresetClientData", object); err == nil {
		entry := TF2ClassPreset{ClassID: uint32Value(value["class_id"]), ActivePresetID: uint32Value(value["active_preset_id"])}
		if entry.ClassID >= 1 && entry.ClassID <= 9 && entry.ActivePresetID <= 3 && uint32Value(value["account_id"]) != 0 {
			s.tf2Features.ClassPresets = upsertTF2ClassPreset(s.tf2Features.ClassPresets, entry)
			s.tf2Diagnostic(fmt.Sprintf("detected TF2 class-preset SO type %d", typeID))
		}
	}
}

func (s *SteamGCClient) removeTF2Object(typeID int32, object []byte) {
	if typeID == tf2SOTypeQuest {
		if value, err := decodeTF2Map("CSOQuest", object); err == nil {
			s.tf2Features.Quests = removeTF2Map(s.tf2Features.Quests, value)
		}
		return
	}
	if typeID != 1 {
		s.removeTF2PresetObject(object)
	}
}

func (s *SteamGCClient) removeTF2PresetObject(object []byte) {
	if value, err := decodeTF2Map("CSOEconItemPresetInstance", object); err == nil {
		classID, presetID, slotID := uint32Value(value["class_id"]), uint32Value(value["preset_id"]), uint32Value(value["slot_id"])
		filtered := s.tf2Features.PresetItems[:0]
		for _, entry := range s.tf2Features.PresetItems {
			if entry.ClassID != classID || entry.PresetID != presetID || entry.SlotID != slotID {
				filtered = append(filtered, entry)
			}
		}
		s.tf2Features.PresetItems = filtered
	}
}

func (s *SteamGCClient) decodeTF2Subscribed(body []byte) {
	var cache multigamepb.CMsgSOCacheSubscribed
	if err := proto.Unmarshal(body, &cache); err != nil {
		s.tf2Diagnostic("decode TF2 SOCache feature objects: " + err.Error())
		return
	}
	for _, objectType := range cache.GetObjects() {
		if objectType.GetTypeId() == 1 {
			continue
		}
		s.decodeTF2ObjectType(objectType.GetTypeId(), objectType.GetObjectData())
	}
}

func (s *SteamGCClient) decodeTF2ObjectType(typeID int32, objects [][]byte) {
	names := tf2FeatureObjectNames()
	if name, ok := names[typeID]; ok {
		values := decodeTF2Objects(name, objects, &s.tf2Features.Diagnostics)
		s.assignTF2Objects(typeID, values)
		return
	}
	s.detectTF2PresetObjects(typeID, objects)
}

func tf2FeatureObjectNames() map[int32]string {
	return map[int32]string{
		tf2SOTypeLadder: "CSOTFLadderPlayerStats", tf2SOTypeMatch: "CSOTFMatchResultPlayerStats",
		tf2SOTypeXPSource: "CMsgTFXPSource", tf2SOTypeNotification: "CMsgGCNotification",
		tf2SOTypeQuestNode: "CSOQuestMapNode", tf2SOTypeQuest: "CSOQuest",
		tf2SOTypeQuestReward: "CSOQuestMapRewardPurchase", tf2SOTypeRating: "CSOTFRatingData",
	}
}

func (s *SteamGCClient) assignTF2Objects(typeID int32, values []map[string]any) {
	switch typeID {
	case tf2SOTypeLadder:
		s.tf2Features.Ladder = values
	case tf2SOTypeMatch:
		s.tf2Features.Matches = values
	case tf2SOTypeRating:
		s.tf2Features.Ratings = values
	case tf2SOTypeQuest:
		s.tf2Features.Quests = values
	case tf2SOTypeQuestNode:
		s.tf2Features.QuestNodes = values
	case tf2SOTypeQuestReward:
		s.tf2Features.QuestRewards = values
	case tf2SOTypeXPSource:
		for _, value := range values {
			s.appendTF2Activity("xp", stringValue(value["match_id"]), value)
		}
	case tf2SOTypeNotification:
		for _, value := range values {
			s.appendTF2Activity("notification", stringValue(value["notification_id"]), value)
		}
	}
}

func (s *SteamGCClient) detectTF2PresetObjects(typeID int32, objects [][]byte) {
	presetItems := make([]TF2PresetItem, 0)
	classPresets := make([]TF2ClassPreset, 0)
	for _, object := range objects {
		if value, err := decodeTF2Map("CSOEconItemPresetInstance", object); err == nil {
			classID, presetID, slotID := uint32Value(value["class_id"]), uint32Value(value["preset_id"]), uint32Value(value["slot_id"])
			itemID := stringValue(value["item_id"])
			if classID >= 1 && classID <= 9 && presetID <= 3 && slotID <= 18 && itemID != "" && itemID != "0" {
				presetItems = append(presetItems, TF2PresetItem{ClassID: classID, PresetID: presetID, SlotID: slotID, ItemID: itemID})
				continue
			}
		}
		if value, err := decodeTF2Map("CSOClassPresetClientData", object); err == nil {
			classID, activePresetID := uint32Value(value["class_id"]), uint32Value(value["active_preset_id"])
			if classID >= 1 && classID <= 9 && activePresetID <= 3 && uint32Value(value["account_id"]) != 0 {
				classPresets = append(classPresets, TF2ClassPreset{ClassID: classID, ActivePresetID: activePresetID})
			}
		}
	}
	if len(presetItems) > 0 {
		s.tf2Features.PresetItems = presetItems
		s.tf2Diagnostic(fmt.Sprintf("detected TF2 preset-instance SO type %d", typeID))
	}
	if len(classPresets) > 0 {
		s.tf2Features.ClassPresets = classPresets
		s.tf2Diagnostic(fmt.Sprintf("detected TF2 class-preset SO type %d", typeID))
	}
}

func (s *SteamGCClient) decodeTF2Market(body []byte) {
	value, err := decodeTF2Map("CMsgGCClientMarketData", body)
	if err != nil {
		s.tf2Diagnostic("decode TF2 market data: " + err.Error())
		return
	}
	entries, _ := value["entries"].([]any)
	market := make([]TF2MarketEntry, 0, len(entries))
	for _, source := range entries {
		entry, _ := source.(map[string]any)
		market = append(market, TF2MarketEntry{
			DefinitionID: uint32Value(entry["item_def_index"]), QualityID: uint32Value(entry["item_quality"]),
			SellListings: uint32Value(entry["item_sell_listings"]), PriceMinor: uint32Value(entry["price_in_local_currency"]),
		})
	}
	s.tf2Features.Market = market
	s.tf2Features.MarketAt = time.Now().UTC().Format(time.RFC3339Nano)
}

func (s *SteamGCClient) decodeTF2Inspect(body []byte) {
	value, err := decodeTF2Map("CMsgGC_Client2GCEconPreviewDataBlockResponse", body)
	if err != nil {
		s.tf2Diagnostic("decode TF2 inspect response: " + err.Error())
		return
	}
	itemInfo, _ := value["iteminfo"].(map[string]any)
	econItem, _ := itemInfo["econitem"].(map[string]any)
	if len(econItem) == 0 {
		s.tf2Diagnostic("TF2 inspect response did not contain an economy item")
		return
	}
	item := typedTF2InspectedItem(econItem)
	s.tf2Features.InspectedItem = &item
	s.tf2Features.InspectedAt = time.Now().UTC().Format(time.RFC3339Nano)
}

func typedTF2InspectedItem(value map[string]any) TF2InspectedItem {
	item := TF2InspectedItem{
		ID: stringValue(value["id"]), OriginalID: stringValue(value["original_id"]),
		DefinitionID: uint32Value(value["def_index"]), Quantity: uint32Value(value["quantity"]),
		Level: uint32Value(value["level"]), QualityID: uint32Value(value["quality"]),
		Flags: uint32Value(value["flags"]), OriginID: uint32Value(value["origin"]),
		CustomName: stringValue(value["custom_name"]), CustomDescription: stringValue(value["custom_desc"]),
		Style: uint32Value(value["style"]), Attributes: []TF2InspectedAttribute{},
		EquippedStates: []TF2InspectedEquippedState{},
	}
	attributes, _ := value["attribute"].([]any)
	for _, source := range attributes {
		attribute, _ := source.(map[string]any)
		item.Attributes = append(item.Attributes, TF2InspectedAttribute{
			DefinitionID: uint32Value(attribute["def_index"]), Value: stringValue(attribute["value"]),
			ValueBytes: stringValue(attribute["value_bytes"]),
		})
	}
	equipped, _ := value["equipped_state"].([]any)
	for _, source := range equipped {
		state, _ := source.(map[string]any)
		item.EquippedStates = append(item.EquippedStates, TF2InspectedEquippedState{
			ClassID: uint32Value(state["new_class"]), SlotID: uint32Value(state["new_slot"]),
		})
	}
	if interior, ok := value["interior_item"].(map[string]any); ok {
		nested := typedTF2InspectedItem(interior)
		item.InteriorItem = &nested
	}
	return item
}

func (s *SteamGCClient) appendTF2Activity(kind, id string, data map[string]any) {
	for index, entry := range s.tf2Features.Activity {
		if entry.Kind == kind && entry.ID == id && id != "" {
			s.tf2Features.Activity[index] = TF2ActivityEntry{Kind: kind, ID: id, Timestamp: uint32Value(data["expiration_time"]), Data: data}
			return
		}
	}
	s.tf2Features.Activity = append(s.tf2Features.Activity, TF2ActivityEntry{Kind: kind, ID: id, Timestamp: uint32Value(data["expiration_time"]), Data: data})
	if len(s.tf2Features.Activity) > 200 {
		s.tf2Features.Activity = append([]TF2ActivityEntry(nil), s.tf2Features.Activity[len(s.tf2Features.Activity)-200:]...)
	}
}

func (s *SteamGCClient) tf2Diagnostic(message string) {
	for _, existing := range s.tf2Features.Diagnostics {
		if existing == message {
			return
		}
	}
	s.tf2Features.Diagnostics = append(s.tf2Features.Diagnostics, message)
}

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
