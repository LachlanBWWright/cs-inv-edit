package transport

import (
	"context"
	"encoding/binary"
	"errors"
	"fmt"
	"time"

	"cs-inv-edit/backend/internal/proto/dota2tracking"
	"cs-inv-edit/backend/internal/proto/tf2tracking"
	"cs-inv-edit/backend/internal/proto/tracking"
	"cs-inv-edit/backend/internal/protocol"
	"github.com/Lucino772/envelop/pkg/steam/steamlang"
	"google.golang.org/protobuf/reflect/protoreflect"
	"google.golang.org/protobuf/types/dynamicpb"
)

func sessionConflictError(err error) error {
	var resultErr steamResultError
	if errors.As(err, &resultErr) && (resultErr.result == steamlang.EResult_LoggedInElsewhere || resultErr.result == steamlang.EResult_AlreadyLoggedInElsewhere) {
		return SteamSessionConflictError{Result: int32(resultErr.result)}
	}
	return err
}

// cs2ClientVersion must match game/csgo/steam.inf in the pinned
// proto/vendor/gametracking-cs2 revision.
const cs2ClientVersion uint32 = 2000877

func (s *SteamGCClient) SendGamesPlayed(_ context.Context, appID uint32) error {
	return s.sendGamesPlayed([]uint32{appID})
}

func (s *SteamGCClient) SetGamesPlayed(_ context.Context, appIDs []uint32) error {
	return s.sendGamesPlayed(appIDs)
}

func (s *SteamGCClient) sendGamesPlayed(appIDs []uint32) error {
	s.mu.Lock()
	conn := s.conn
	s.mu.Unlock()
	if conn == nil {
		return ErrNotConnected
	}
	packet, err := encodeGamesPlayedPacketForApps(appIDs)
	if err != nil {
		return err
	}
	if err := conn.SendPacket(packet); err != nil {
		return err
	}
	s.mu.Lock()
	s.gamesPlayed = append([]uint32(nil), appIDs...)
	s.mu.Unlock()
	s.events <- GCEvent{Type: "steam.games_played.sent", Payload: fmt.Sprintf("emsg=%s appids=%v", steamlang.EMsg_ClientGamesPlayedWithDataBlob.String(), appIDs)}
	return nil
}

func (s *SteamGCClient) ensureGamesPlayedIncludes(appIDs ...uint32) error {
	s.mu.Lock()
	current := append([]uint32(nil), s.gamesPlayed...)
	s.mu.Unlock()
	return s.sendGamesPlayed(mergeGamesPlayed(current, appIDs))
}

func mergeGamesPlayed(current, required []uint32) []uint32 {
	seen := make(map[uint32]struct{}, len(current)+len(required))
	merged := make([]uint32, 0, len(current)+len(required))
	for _, appID := range append(append([]uint32(nil), current...), required...) {
		if _, exists := seen[appID]; exists {
			continue
		}
		seen[appID] = struct{}{}
		merged = append(merged, appID)
	}
	return merged
}

func (s *SteamGCClient) RequestGameInventory(ctx context.Context, appID uint32) ([]GCInventoryItem, error) {
	s.requestMu.Lock()
	defer s.requestMu.Unlock()
	return s.requestGameInventoryLocked(ctx, appID)
}

func (s *SteamGCClient) requestGameInventoryLocked(ctx context.Context, appID uint32) ([]GCInventoryItem, error) {
	if appID != 440 && appID != 570 {
		return nil, fmt.Errorf("unsupported multi-game inventory AppID %d", appID)
	}
	trace := newDiagnosticTrace(fmt.Sprintf("appid=%d GC inventory request started", appID))
	if err := s.ensureSteamSession(ctx); err != nil {
		return nil, trace.Error(fmt.Errorf("steam session recovery failed: %w", err))
	}
	if err := s.ensureGamesPlayedIncludes(protocol.AppIDCS2, appID); err != nil {
		return nil, trace.Error(fmt.Errorf("multi-game presence failed: %w", err))
	}
	hello, err := gameClientHello(appID)
	if err != nil {
		return nil, err
	}
	if err := s.SendProtoToGC(ctx, appID, 4006, hello); err != nil {
		return nil, trace.Error(fmt.Errorf("appid=%d GC hello failed: %w", appID, err))
	}
	trace.Add(fmt.Sprintf("appid=%d GC ClientHello sent emsg=4006", appID))
	retry := time.NewTicker(3 * time.Second)
	defer retry.Stop()
	welcomeSeen := false
	for {
		select {
		case <-ctx.Done():
			return nil, trace.Error(fmt.Errorf("appid=%d timed out waiting for authoritative economy SOCache: %w", appID, ctx.Err()))
		case <-retry.C:
			if err := s.SendProtoToGC(ctx, appID, 4006, hello); err != nil {
				return nil, trace.Error(err)
			}
			trace.Add(fmt.Sprintf("appid=%d GC ClientHello retry sent", appID))
		case event := <-s.events:
			message, ok := event.Payload.(GCMessage)
			if !ok || event.Type != "gc.message" || message.AppID != appID {
				continue
			}
			trace.Add(fmt.Sprintf("appid=%d observed emsg=%d bytes=%d", appID, message.EMsg, len(message.Body)))
			switch message.EMsg {
			case 4004:
				welcomeSeen = true
				if items, found, decodeErr := decodeGameWelcomeInventory(appID, message.Body); decodeErr != nil {
					return nil, trace.Error(decodeErr)
				} else if found {
					trace.Add(fmt.Sprintf("appid=%d welcome inventory_items=%d", appID, len(items)))
					return items, nil
				}
				if appID == 570 {
					refreshes, decodeErr := dotaWelcomeSOCacheRefreshes(message.Body)
					if decodeErr != nil {
						return nil, trace.Error(decodeErr)
					}
					for _, refresh := range refreshes {
						if sendErr := s.SendProtoToGC(ctx, appID, 28, refresh); sendErr != nil {
							return nil, trace.Error(fmt.Errorf("appid=%d send welcome SOCache subscription refresh: %w", appID, sendErr))
						}
					}
					if len(refreshes) > 0 {
						trace.Add(fmt.Sprintf("appid=%d welcome SOCache subscription_refreshes=%d", appID, len(refreshes)))
					}
				}
			case 24:
				items, found, decodeErr := decodeGenericSubscribedInventory(appID, message.Body)
				if decodeErr != nil {
					return nil, trace.Error(decodeErr)
				}
				if found {
					trace.Add(fmt.Sprintf("appid=%d subscribed inventory_items=%d welcome_seen=%t", appID, len(items), welcomeSeen))
					return items, nil
				}
			case 27:
				refresh, decodeErr := gameSOCacheSubscriptionRefresh(appID, message.Body)
				if decodeErr != nil {
					return nil, trace.Error(fmt.Errorf("appid=%d decode SOCache subscription check: %w", appID, decodeErr))
				}
				if sendErr := s.SendProtoToGC(ctx, appID, 28, refresh); sendErr != nil {
					return nil, trace.Error(fmt.Errorf("appid=%d send SOCache subscription refresh: %w", appID, sendErr))
				}
				trace.Add(fmt.Sprintf("appid=%d SOCache subscription refresh sent emsg=28", appID))
			}
		}
	}
}

func gameSOCacheSubscriptionRefresh(appID uint32, body []byte) ([]byte, error) {
	check, err := unmarshalGameMessage(appID, "CMsgSOCacheSubscriptionCheck", body)
	if err != nil {
		return nil, err
	}
	ownerField := tracking.Field(check, "owner")
	ownerSOIDField := tracking.Field(check, "owner_soid")
	if !check.Has(ownerField) && !check.Has(ownerSOIDField) {
		return nil, fmt.Errorf("SOCache subscription check omitted owner identity")
	}
	fields := make(map[string]any)
	if check.Has(ownerField) {
		fields["owner"] = tracking.Uint(check, "owner")
	}
	if check.Has(ownerSOIDField) {
		owner := check.Get(ownerSOIDField).Message()
		fields["owner_soid"] = map[string]any{"type": uint32(tracking.Uint(owner, "type")), "id": tracking.Uint(owner, "id")}
	}
	return marshalGameMessage(appID, "CMsgSOCacheSubscriptionRefresh", fields)
}

func dotaWelcomeSOCacheRefreshes(body []byte) ([][]byte, error) {
	welcome, err := dota2tracking.UnmarshalMessage("CMsgClientWelcome", body)
	if err != nil {
		return nil, err
	}
	checks := tracking.List(welcome, "uptodate_subscribed_caches")
	refreshes := make([][]byte, 0, checks.Len())
	for index := 0; index < checks.Len(); index++ {
		check := checks.Get(index).Message()
		ownerField := tracking.Field(check, "owner_soid")
		if !check.Has(ownerField) {
			return nil, fmt.Errorf("Dota 2 welcome SOCache subscription check omitted owner_soid")
		}
		owner := check.Get(ownerField).Message()
		body, err := dota2tracking.MarshalMessage("CMsgSOCacheSubscriptionRefresh", map[string]any{
			"owner_soid": map[string]any{"type": uint32(tracking.Uint(owner, "type")), "id": tracking.Uint(owner, "id")},
		})
		if err != nil {
			return nil, err
		}
		refreshes = append(refreshes, body)
	}
	return refreshes, nil
}

func gameClientHello(appID uint32) ([]byte, error) {
	// These versions come from steam.inf at the pinned tracker revisions listed
	// in docs/multi-game-economy-sources.md. Dota 2 must explicitly identify
	// Source 2 because the protobuf's legacy default is Source 1.
	switch appID {
	case 440:
		return tf2tracking.MarshalFields("CMsgClientHello", map[string]any{"version": uint32(10815139)})
	case 570:
		return dota2tracking.MarshalMessage("CMsgClientHello", map[string]any{"version": uint32(6859), "client_session_need": uint32(0), "client_launcher": uint32(0), "engine": uint32(1)})
	default:
		return nil, fmt.Errorf("unsupported hello AppID %d", appID)
	}
}

func marshalGameMessage(appID uint32, name string, fields map[string]any) ([]byte, error) {
	switch appID {
	case 440:
		return tf2tracking.MarshalFields(name, fields)
	case 570:
		return dota2tracking.MarshalMessage(name, fields)
	default:
		return nil, fmt.Errorf("unsupported GameTracking AppID %d", appID)
	}
}

func unmarshalGameMessage(appID uint32, name string, body []byte) (*dynamicpb.Message, error) {
	switch appID {
	case 440:
		return tf2tracking.UnmarshalMessage(name, body)
	case 570:
		return dota2tracking.UnmarshalMessage(name, body)
	default:
		return nil, fmt.Errorf("unsupported GameTracking AppID %d", appID)
	}
}

func decodeGameWelcomeInventory(appID uint32, body []byte) ([]GCInventoryItem, bool, error) {
	// TF2's authoritative CMsgClientWelcome field 3 is txn_country_code, while
	// Dota 2 uses field 3 for outofdate_subscribed_caches. Never decode the TF2
	// country string as a Dota SOCache; TF2 inventory arrives in EMsg 24.
	if appID == 440 {
		return nil, false, nil
	}
	if appID != 570 {
		return nil, false, fmt.Errorf("unsupported welcome AppID %d", appID)
	}
	return decodeGenericWelcomeInventory(appID, body)
}

func decodeGenericWelcomeInventory(appID uint32, body []byte) ([]GCInventoryItem, bool, error) {
	welcome, err := unmarshalGameMessage(appID, "CMsgClientWelcome", body)
	if err != nil {
		return nil, false, err
	}
	caches := tracking.List(welcome, "outofdate_subscribed_caches")
	for index := 0; index < caches.Len(); index++ {
		if items, found, err := decodeGenericSubscribedTypes(appID, tracking.List(caches.Get(index).Message(), "objects")); found || err != nil {
			return items, found, err
		}
	}
	return nil, false, nil
}

func decodeGenericSubscribedInventory(appID uint32, body []byte) ([]GCInventoryItem, bool, error) {
	cache, err := unmarshalGameMessage(appID, "CMsgSOCacheSubscribed", body)
	if err != nil {
		return nil, false, err
	}
	return decodeGenericSubscribedTypes(appID, tracking.List(cache, "objects"))
}

func decodeGenericSubscribedTypes(appID uint32, types protoreflect.List) ([]GCInventoryItem, bool, error) {
	for typeIndex := 0; typeIndex < types.Len(); typeIndex++ {
		objectType := types.Get(typeIndex).Message()
		if tracking.Int(objectType, "type_id") != 1 {
			continue
		}
		objectData := tracking.List(objectType, "object_data")
		items := make([]GCInventoryItem, 0, objectData.Len())
		for dataIndex := 0; dataIndex < objectData.Len(); dataIndex++ {
			item, err := unmarshalGameMessage(appID, "CSOEconItem", objectData.Get(dataIndex).Bytes())
			if err != nil {
				return nil, true, fmt.Errorf("decode economy item: %w", err)
			}
			if tracking.Uint(item, "id") == 0 {
				continue
			}
			attributeList := tracking.List(item, "attribute")
			attributes := make(map[uint32]uint32, attributeList.Len())
			attributeBytes := make(map[uint32][]byte, attributeList.Len())
			for attributeIndex := 0; attributeIndex < attributeList.Len(); attributeIndex++ {
				attribute := attributeList.Get(attributeIndex).Message()
				definitionIndex := uint32(tracking.Uint(attribute, "def_index"))
				if appID == 570 && !tracking.Has(attribute, "def_index") {
					definitionIndex = 65535
				}
				value := uint32(tracking.Uint(attribute, "value"))
				valueBytes := tracking.Bytes(attribute, "value_bytes")
				if value == 0 && len(valueBytes) >= 4 {
					value = binary.LittleEndian.Uint32(valueBytes[:4])
				}
				attributes[definitionIndex] = value
				if len(valueBytes) > 0 {
					attributeBytes[definitionIndex] = append([]byte(nil), valueBytes...)
				}
			}
			equippedList := tracking.List(item, "equipped_state")
			equipped := make([]GCEquippedState, 0, equippedList.Len())
			for stateIndex := 0; stateIndex < equippedList.Len(); stateIndex++ {
				state := equippedList.Get(stateIndex).Message()
				equipped = append(equipped, GCEquippedState{Class: uint32(tracking.Uint(state, "new_class")), Slot: uint32(tracking.Uint(state, "new_slot"))})
			}
			quantity, level, quality := uint32(tracking.Uint(item, "quantity")), uint32(tracking.Uint(item, "level")), uint32(tracking.Uint(item, "quality"))
			if appID == 570 {
				if !tracking.Has(item, "quantity") {
					quantity = 1
				}
				if !tracking.Has(item, "level") {
					level = 1
				}
				if !tracking.Has(item, "quality") {
					quality = 4
				}
			}
			interiorID := uint64(0)
			interiorField := tracking.Field(item, "interior_item")
			if item.Has(interiorField) {
				interiorID = tracking.Uint(item.Get(interiorField).Message(), "id")
			}
			items = append(items, GCInventoryItem{ID: tracking.Uint(item, "id"), OriginalID: tracking.Uint(item, "original_id"), DefIndex: uint32(tracking.Uint(item, "def_index")), Quantity: quantity, Quality: quality, Inventory: uint32(tracking.Uint(item, "inventory")), CustomName: tracking.String(item, "custom_name"), Attributes: attributes, AttributeBytes: attributeBytes, EquippedStates: equipped, InteriorItemID: interiorID, Level: level, Flags: uint32(tracking.Uint(item, "flags")), Origin: uint32(tracking.Uint(item, "origin")), Style: uint32(tracking.Uint(item, "style")), CustomDesc: tracking.String(item, "custom_desc")})
		}
		return items, true, nil
	}
	return nil, false, nil
}
