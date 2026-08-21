package transport

import (
	"encoding/json"
	"fmt"
	"time"

	"cs-inv-edit/backend/internal/proto/gametracking"
	"cs-inv-edit/backend/internal/protocol"
)

func emptyCS2FeatureSnapshot() CS2FeatureSnapshot {
	return CS2FeatureSnapshot{
		Status: "waiting", EquipSlots: []CS2EquipSlot{}, Matches: []map[string]any{},
		Rentals: []map[string]any{}, Quests: []map[string]any{}, RecurringMissions: []map[string]any{},
		SeasonalOperations: []map[string]any{}, Activity: []CS2ActivityEntry{}, Diagnostics: []string{},
	}
}

func (s *SteamGCClient) CS2Features() CS2FeatureSnapshot {
	s.cs2Mu.Lock()
	defer s.cs2Mu.Unlock()
	encoded, err := json.Marshal(s.cs2Features)
	if err != nil {
		return emptyCS2FeatureSnapshot()
	}
	var snapshot CS2FeatureSnapshot
	if err := json.Unmarshal(encoded, &snapshot); err != nil {
		return emptyCS2FeatureSnapshot()
	}
	return snapshot
}

func (s *SteamGCClient) recordCS2State(direction string, appID, emsg uint32, body []byte) {
	if direction != "received" || appID != 730 {
		return
	}
	s.cs2Mu.Lock()
	defer s.cs2Mu.Unlock()
	s.cs2Features.Status = "ready"
	s.cs2Features.RefreshedAt = time.Now().UTC().Format(time.RFC3339Nano)
	switch emsg {
	case protocol.EMsgGCClientWelcome:
		s.decodeCS2Welcome(body)
	case 9110:
		if value, err := decodeCS2Map("CMsgGCCStrike15_v2_MatchmakingGC2ClientHello", body); err == nil {
			s.cs2Features.Profile = value
		}
	case 21, 22:
		s.decodeCS2SingleObject(body)
	case 23:
		s.decodeCS2RemovedObject(body)
	case 24:
		s.decodeCS2Subscribed(body)
	case 26:
		s.decodeCS2MultipleObjects(body)
	case 1087:
		s.decodeCS2Activity("item_acknowledged", "CMsgItemAcknowledged", body)
	case 9137:
		s.decodeCS2Activity("match_drop", "CMsgGCCStrike15_v2_MatchEndRewardDropsNotification", body)
	case 9139:
		if value, err := decodeCS2Map("CMsgGCCStrike15_v2_MatchList", body); err == nil {
			matches, _ := value["matches"].([]any)
			s.cs2Features.Matches = mapSlice(matches)
		}
	case 9157:
		if value, err := decodeCS2Map("CMsgGCCStrike15_v2_Client2GCEconPreviewDataBlockResponse", body); err == nil {
			item, _ := value["iteminfo"].(map[string]any)
			s.cs2Features.InspectedItem = item
			s.cs2Features.InspectedAt = time.Now().UTC().Format(time.RFC3339Nano)
		}
	case 9210:
		if value, err := decodeCS2Map("CMsgGCCStrike15_ClientDeepStats", body); err == nil {
			s.cs2Features.DeepStats = value
		}
	case 9221:
		if value, err := decodeCS2Map("CMsgGCCStrike15_v2_GC2ClientNotifyXPShop", body); err == nil {
			s.cs2Features.XPShop = value
		}
	case 9223:
		if value, err := decodeCS2Map("CMsgGCCStrike15_v2_MatchmakingGC2ClientSearchStats", body); err == nil {
			s.cs2Features.SearchStats = value
		}
	case 9224:
		if value, err := decodeCS2Map("CMsgGCCStrike15_v2_PremierSeasonSummary", body); err == nil {
			s.cs2Features.Premier = value
		}
	case 9226:
		if value, err := decodeCS2Map("CMsgRecurringMissionSchema", body); err == nil {
			s.cs2Features.RecurringSchema = value
		}
	}
}

func (s *SteamGCClient) decodeCS2Welcome(body []byte) {
	welcome, err := gametracking.DecodeClientWelcome(body)
	if err != nil {
		s.cs2Diagnostic("decode CS2 feature ClientWelcome: " + err.Error())
		return
	}
	for _, cache := range welcome.OutofdateSubscribedCaches {
		for _, objectType := range cache.Objects {
			if objectType.TypeID == 1 {
				continue
			}
			for _, object := range objectType.ObjectData {
				s.detectCS2SO(objectType.TypeID, object, false)
			}
		}
	}
}

func (s *SteamGCClient) decodeCS2RemovedObject(body []byte) {
	single, err := gametracking.DecodeSOSingleObject(body)
	if err != nil {
		s.cs2Diagnostic("decode CS2 feature SO removal: " + err.Error())
		return
	}
	name := s.cs2SOTypes[single.TypeID]
	value, err := decodeCS2Map(name, single.ObjectData)
	if err != nil {
		return
	}
	switch name {
	case "CSOEconEquipSlot":
		classID, slotID := uint32Value(value["class_id"]), uint32Value(value["slot_id"])
		filtered := s.cs2Features.EquipSlots[:0]
		for _, entry := range s.cs2Features.EquipSlots {
			if entry.ClassID != classID || entry.SlotID != slotID {
				filtered = append(filtered, entry)
			}
		}
		s.cs2Features.EquipSlots = filtered
	case "CSOEconRentalHistory":
		s.cs2Features.Rentals = removeCS2Map(s.cs2Features.Rentals, value)
	case "CSOQuestProgress":
		s.cs2Features.Quests = removeCS2Map(s.cs2Features.Quests, value)
	case "CSOAccountRecurringMission":
		s.cs2Features.RecurringMissions = removeCS2Map(s.cs2Features.RecurringMissions, value)
	case "CSOAccountSeasonalOperation":
		s.cs2Features.SeasonalOperations = removeCS2Map(s.cs2Features.SeasonalOperations, value)
	}
}

func (s *SteamGCClient) decodeCS2Subscribed(body []byte) {
	cache, err := gametracking.DecodeSOCacheSubscribed(body)
	if err != nil {
		s.cs2Diagnostic("decode CS2 feature SOCache: " + err.Error())
		return
	}
	for _, objectType := range cache.Objects {
		if objectType.TypeID == 1 {
			continue
		}
		for _, object := range objectType.ObjectData {
			s.detectCS2SO(objectType.TypeID, object, false)
		}
	}
}

func (s *SteamGCClient) decodeCS2SingleObject(body []byte) {
	single, err := gametracking.DecodeSOSingleObject(body)
	if err != nil {
		s.cs2Diagnostic("decode CS2 feature SO update: " + err.Error())
		return
	}
	s.detectCS2SO(single.TypeID, single.ObjectData, true)
}

func (s *SteamGCClient) decodeCS2MultipleObjects(body []byte) {
	multiple, err := gametracking.DecodeSOMultipleObjects(body)
	if err != nil {
		s.cs2Diagnostic("decode CS2 feature SO batch: " + err.Error())
		return
	}
	for _, object := range multiple.ObjectsModified {
		s.detectCS2SO(object.TypeID, object.ObjectData, true)
	}
}

func (s *SteamGCClient) detectCS2SO(typeID int32, body []byte, incremental bool) {
	if typeID == 1 || len(body) == 0 {
		return
	}
	if name := s.cs2SOTypes[typeID]; name != "" {
		s.assignCS2SO(name, body, incremental)
		return
	}
	candidates := []string{"CSOEconEquipSlot", "CSOEconRentalHistory", "CSOQuestProgress", "CSOAccountRecurringMission", "CSOAccountSeasonalOperation", "CSOAccountXpShop"}
	for _, name := range candidates {
		value, err := decodeCS2Map(name, body)
		if err != nil || !validCS2SO(name, value) {
			continue
		}
		s.cs2SOTypes[typeID] = name
		s.cs2Diagnostic(fmt.Sprintf("detected %s shared-object type %d", name, typeID))
		s.assignCS2SOValue(name, value, incremental)
		return
	}
}

func validCS2SO(name string, value map[string]any) bool {
	switch name {
	case "CSOEconEquipSlot":
		return uint32Value(value["account_id"]) != 0 && uint32Value(value["class_id"]) <= 5 && uint32Value(value["slot_id"]) <= 64
	case "CSOEconRentalHistory":
		return stringValue(value["crate_item_id"]) != "" && uint32Value(value["expiration_date"]) != 0
	case "CSOQuestProgress":
		return uint32Value(value["questid"]) != 0
	case "CSOAccountRecurringMission":
		return uint32Value(value["account_id"]) != 0 && uint32Value(value["mission_id"]) != 0
	case "CSOAccountSeasonalOperation":
		return uint32Value(value["season_value"]) != 0
	case "CSOAccountXpShop":
		return uint32Value(value["generation_time"]) != 0
	default:
		return false
	}
}

func (s *SteamGCClient) assignCS2SO(name string, body []byte, incremental bool) {
	value, err := decodeCS2Map(name, body)
	if err != nil {
		s.cs2Diagnostic("decode " + name + ": " + err.Error())
		return
	}
	s.assignCS2SOValue(name, value, incremental)
}

func (s *SteamGCClient) assignCS2SOValue(name string, value map[string]any, _ bool) {
	switch name {
	case "CSOEconEquipSlot":
		next := CS2EquipSlot{ClassID: uint32Value(value["class_id"]), SlotID: uint32Value(value["slot_id"]), ItemID: stringValue(value["item_id"]), DefinitionID: uint32Value(value["item_definition"])}
		for index, entry := range s.cs2Features.EquipSlots {
			if entry.ClassID == next.ClassID && entry.SlotID == next.SlotID {
				s.cs2Features.EquipSlots[index] = next
				return
			}
		}
		s.cs2Features.EquipSlots = append(s.cs2Features.EquipSlots, next)
	case "CSOEconRentalHistory":
		s.cs2Features.Rentals = upsertCS2Map(s.cs2Features.Rentals, value)
	case "CSOQuestProgress":
		s.cs2Features.Quests = upsertCS2Map(s.cs2Features.Quests, value)
	case "CSOAccountRecurringMission":
		s.cs2Features.RecurringMissions = upsertCS2Map(s.cs2Features.RecurringMissions, value)
	case "CSOAccountSeasonalOperation":
		s.cs2Features.SeasonalOperations = upsertCS2Map(s.cs2Features.SeasonalOperations, value)
	case "CSOAccountXpShop":
		s.cs2Features.XPShop = value
	}
}

func upsertCS2Map(entries []map[string]any, next map[string]any) []map[string]any {
	key := cs2MapIdentity(next)
	for index, entry := range entries {
		if key != "" && cs2MapIdentity(entry) == key {
			entries[index] = next
			return entries
		}
	}
	return append(entries, next)
}

func removeCS2Map(entries []map[string]any, target map[string]any) []map[string]any {
	key := cs2MapIdentity(target)
	filtered := entries[:0]
	for _, entry := range entries {
		if key == "" || cs2MapIdentity(entry) != key {
			filtered = append(filtered, entry)
		}
	}
	return filtered
}

func cs2MapIdentity(value map[string]any) string {
	for _, key := range []string{"crate_item_id", "questid", "mission_id", "season_value", "generation_time"} {
		if id := stringValue(value[key]); id != "" && id != "0" {
			return key + ":" + id
		}
	}
	return ""
}

func (s *SteamGCClient) decodeCS2Activity(kind, name string, body []byte) {
	value, err := decodeCS2Map(name, body)
	if err != nil {
		s.cs2Diagnostic("decode CS2 " + kind + ": " + err.Error())
		return
	}
	item, _ := value["iteminfo"].(map[string]any)
	id := stringValue(item["itemid"])
	s.cs2Features.Activity = append(s.cs2Features.Activity, CS2ActivityEntry{Kind: kind, ID: id, Data: item})
	if len(s.cs2Features.Activity) > 200 {
		s.cs2Features.Activity = append([]CS2ActivityEntry(nil), s.cs2Features.Activity[len(s.cs2Features.Activity)-200:]...)
	}
}

func (s *SteamGCClient) cs2Diagnostic(message string) {
	for _, existing := range s.cs2Features.Diagnostics {
		if existing == message {
			return
		}
	}
	s.cs2Features.Diagnostics = append(s.cs2Features.Diagnostics, message)
}

func decodeCS2Map(name string, body []byte) (map[string]any, error) {
	decoded, err := gametracking.DecodeMessageJSON(name, body)
	if err != nil {
		return nil, err
	}
	var value map[string]any
	if err := json.Unmarshal(decoded, &value); err != nil {
		return nil, err
	}
	return value, nil
}

func mapSlice(values []any) []map[string]any {
	out := make([]map[string]any, 0, len(values))
	for _, source := range values {
		if value, ok := source.(map[string]any); ok {
			out = append(out, value)
		}
	}
	return out
}
