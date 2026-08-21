package app

import (
	"context"
	"fmt"
	"strconv"
	"time"

	"cs-inv-edit/backend/internal/domain"
	"cs-inv-edit/backend/internal/operations"
	"cs-inv-edit/backend/internal/proto/gametracking"
	"cs-inv-edit/backend/internal/protocol"
)

func (s *Service) submitCS2FeatureOperation(receipt operations.Receipt, operation string, input map[string]any) operations.Receipt {
	mapping, known := protocol.CS2FeatureOperationMapping(operation)
	if !known {
		return s.finishCS2FeatureOperation(receipt, "failed", "unknown CS2 feature operation", nil)
	}
	s.mu.Lock()
	connected := s.connection.State == domain.ConnectionStateConnected
	steamID := s.connection.SteamID
	loadoutsEnabled := s.settings.FeatureFlags.EnableCS2Loadouts
	s.mu.Unlock()
	result := map[string]any{"game": "cs2", "requestEMsg": mapping.EMsg, "featureFlag": mapping.FeatureFlag}
	if mapping.FeatureFlag == "enableCs2Loadouts" && !loadoutsEnabled {
		return s.finishCS2FeatureOperation(receipt, "blocked_by_feature_flag", "enableCs2Loadouts is disabled", result)
	}
	if !connected || steamID == "" {
		return s.finishCS2FeatureOperation(receipt, "requires_connection", "connect Steam before requesting CS2 coordinator data", result)
	}
	body, itemIDs, err := encodeCS2FeatureOperation(operation, input, steamID)
	if err != nil {
		return s.finishCS2FeatureOperation(receipt, "failed", err.Error(), result)
	}
	if err := s.validateCS2OwnedItems(itemIDs); err != nil {
		return s.finishCS2FeatureOperation(receipt, "failed", err.Error(), result)
	}
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()
	if err := s.gcClient.SendProtoToGC(ctx, protocol.AppIDCS2, mapping.EMsg, body); err != nil {
		return s.finishCS2FeatureOperation(receipt, "failed", "CS2 GC send failed: "+err.Error(), result)
	}
	for _, key := range []string{"classId", "slotId", "itemId", "matchId", "outcomeId"} {
		if value, ok := input[key]; ok {
			result[key] = value
		}
	}
	return s.finishCS2FeatureOperation(receipt, "awaiting_gc_confirmation", "CS2 request sent; awaiting authoritative coordinator state", result)
}

func encodeCS2FeatureOperation(operation string, input map[string]any, steamID string) ([]byte, []uint64, error) {
	switch operation {
	case "cs2.loadout.set":
		itemID, err := requiredUint64Input(input, "itemId")
		if err != nil {
			return nil, nil, err
		}
		classID, err := requiredUint32Input(input, "classId")
		if err != nil {
			return nil, nil, err
		}
		slotID, err := requiredUint32Input(input, "slotId")
		if err != nil {
			return nil, nil, err
		}
		changeNumber := uint32(time.Now().Unix())
		body, err := gametracking.MarshalAdjustEquipSlots([]gametracking.EquipSlotAdjustment{{ClassID: classID, SlotID: slotID, ItemID: itemID}}, changeNumber)
		return body, []uint64{itemID}, err
	case "cs2.matches.recent":
		steam64, err := strconv.ParseUint(steamID, 10, 64)
		if err != nil {
			return nil, nil, fmt.Errorf("connected Steam ID is invalid")
		}
		body, err := gametracking.Marshal("CMsgGCCStrike15_v2_MatchListRequestRecentUserGames", map[string]uint64{"accountid": steam64 & 0xffffffff})
		return body, nil, err
	case "cs2.profile.refresh":
		body, err := gametracking.Marshal("CMsgGCCStrike15_v2_MatchmakingClient2GCHello", map[string]uint64{})
		return body, nil, err
	case "cs2.matches.details":
		matchID, err := requiredUint64Input(input, "matchId")
		if err != nil {
			return nil, nil, err
		}
		outcomeID, err := optionalUint64Input(input, "outcomeId")
		if err != nil {
			return nil, nil, err
		}
		token, err := optionalUint32Input(input, "token")
		if err != nil {
			return nil, nil, err
		}
		body, err := gametracking.Marshal("CMsgGCCStrike15_v2_MatchListRequestFullGameInfo", map[string]uint64{"matchid": matchID, "outcomeid": outcomeID, "token": uint64(token)})
		return body, nil, err
	case "cs2.inspect.resolve":
		inspectURL, _ := input["inspectUrl"].(string)
		params, err := parseTF2InspectURL(inspectURL)
		if err != nil {
			return nil, nil, err
		}
		s, _ := optionalUint64Input(params, "paramS")
		a, _ := optionalUint64Input(params, "paramA")
		d, _ := optionalUint64Input(params, "paramD")
		m, _ := optionalUint64Input(params, "paramM")
		body, err := gametracking.Marshal("CMsgGCCStrike15_v2_Client2GCEconPreviewDataBlockRequest", map[string]uint64{"param_s": s, "param_a": a, "param_d": d, "param_m": m})
		return body, nil, err
	case "cs2.progression.refresh":
		body, err := gametracking.Marshal("CMsgRequestRecurringMissionSchedule", map[string]uint64{})
		return body, nil, err
	default:
		return nil, nil, fmt.Errorf("CS2 operation %q has no encoder", operation)
	}
}

func (s *Service) validateCS2OwnedItems(itemIDs []uint64) error {
	if len(itemIDs) == 0 {
		return nil
	}
	s.mu.Lock()
	defer s.mu.Unlock()
	owned := make(map[string]bool, len(s.inventory.Items))
	for _, item := range s.inventory.Items {
		owned[item.ID] = true
	}
	for _, itemID := range itemIDs {
		if !owned[strconv.FormatUint(itemID, 10)] {
			return fmt.Errorf("CS2 item %d is not present in the current authoritative GC inventory", itemID)
		}
	}
	return nil
}

func (s *Service) finishCS2FeatureOperation(receipt operations.Receipt, state operations.State, message string, result map[string]any) operations.Receipt {
	receipt.State, receipt.Message, receipt.Result = state, message, result
	s.addEvent(receipt, state, message)
	return receipt
}
