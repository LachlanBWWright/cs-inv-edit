package transport

import (
	"context"
	"fmt"
	"log"
	"math"
	"time"

	cs2pb "cs-inv-edit/backend/internal/proto/gametracking"
	"cs-inv-edit/backend/internal/protocol"
	"google.golang.org/protobuf/encoding/protowire"
	"google.golang.org/protobuf/proto"
	"google.golang.org/protobuf/reflect/protoreflect"
)

func cs2ClientHello() ([]byte, error) {
	return cs2pb.MarshalMessage("CMsgClientHello", map[string]any{"version": cs2ClientVersion, "client_session_need": uint32(0), "client_launcher": uint32(0), "steam_launcher": uint32(0)})
}

func (s *SteamGCClient) RequestArmory(ctx context.Context) (GCArmorySnapshot, error) {
	s.requestMu.Lock()
	defer s.requestMu.Unlock()
	s.mu.Lock()
	body := append([]byte(nil), s.lastWelcome...)
	s.mu.Unlock()
	if len(body) == 0 {
		return GCArmorySnapshot{}, fmt.Errorf("CS2 GC Armory state is unavailable until ClientWelcome is received")
	}
	result, err := decodeArmoryFromClientWelcome(body)
	if err != nil {
		return GCArmorySnapshot{}, err
	}
	log.Printf("[armory] ClientWelcome decoded generation=%d balance=%d; waiting for CacheSubscribed if generation is zero", result.GenerationTime, result.Balance)
	quiet := time.NewTimer(750 * time.Millisecond)
	if result.GenerationTime == 0 {
		if !quiet.Stop() {
			<-quiet.C
		}
	}
	defer quiet.Stop()
	for {
		select {
		case <-ctx.Done():
			log.Printf("[armory] collection context ended: %v", ctx.Err())
			if result.GenerationTime == 0 {
				return GCArmorySnapshot{}, fmt.Errorf("timed out waiting for an unambiguous authoritative XpShop SOCache after ClientWelcome: %w", ctx.Err())
			}
			return result, nil
		case <-quiet.C:
			log.Printf("[armory] final generation=%d balance=%d item_ids=%d bids=%d", result.GenerationTime, result.Balance, len(result.ItemIDs), len(result.Offers))
			return result, nil
		case event := <-s.events:
			message, ok := event.Payload.(GCMessage)
			if !ok || event.Type != "gc.message" || message.AppID != protocol.AppIDCS2 {
				continue
			}
			matched, decodeErr := decodeArmorySOMessage(&result, message)
			log.Printf("[armory] post-welcome GC message emsg=%d bytes=%d armory_match=%t decode_error=%v", message.EMsg, len(message.Body), matched, decodeErr)
			if decodeErr != nil {
				return GCArmorySnapshot{}, decodeErr
			}
			if matched && result.GenerationTime != 0 {
				resetTimer(quiet, 750*time.Millisecond)
			}
		}
	}
}

func decodeArmorySOMessage(result *GCArmorySnapshot, message GCMessage) (bool, error) {
	if message.EMsg == protocol.EMsgGCCStrike15V2GC2ClientNotifyXPShop {
		notification, err := cs2pb.UnmarshalMessage("CMsgGCCStrike15V2GC2ClientNotifyXPShop", message.Body)
		if err != nil {
			return false, err
		}
		var stateMessage protoreflect.Message
		for _, name := range []string{"postmatch", "prematch"} {
			field := notification.Descriptor().Fields().ByName(protoreflect.Name(name))
			if notification.Has(field) {
				stateMessage = notification.Get(field).Message()
				break
			}
		}
		if stateMessage == nil {
			return false, nil
		}
		stateBody, err := proto.Marshal(stateMessage.Interface())
		if err != nil {
			return false, err
		}
		state, err := cs2pb.DecodeXpShop(stateBody)
		if err != nil {
			return false, err
		}
		applyXpShopState(result, state)
		return true, nil
	}
	switch message.EMsg {
	case protocol.EMsgSOCacheSubscribed:
		subscribed, err := cs2pb.DecodeSOCacheSubscribed(message.Body)
		if err != nil {
			return false, err
		}
		log.Printf("[armory] CacheSubscribed objects=%d version=%d", len(subscribed.Objects), subscribed.Version)
		return decodeXpShopSubscribedCache(result, subscribed)
	case protocol.EMsgSOCreate, protocol.EMsgSOUpdate:
		single, err := cs2pb.DecodeSOSingleObject(message.Body)
		if err != nil {
			return false, err
		}
		log.Printf("[armory] single SO emsg=%d type_id=%d object_bytes=%d version=%d", message.EMsg, single.TypeID, len(single.ObjectData), single.Version)
		// A keyless XP Shop state and a single bid have indistinguishable fields
		// 1-3 when the bid omits optional field 4. Incremental messages can update
		// only a type already identified from a complete subscribed cache.
		if result.XpShopTypeID == 0 || single.TypeID != result.XpShopTypeID {
			return false, nil
		}
		return decodeIncrementalArmoryObject(result, single.TypeID, single.ObjectData), nil
	case protocol.EMsgSOUpdateMultiple:
		multiple, err := cs2pb.DecodeSOMultipleObjects(message.Body)
		if err != nil {
			return false, err
		}
		matched := false
		log.Printf("[armory] multiple SO objects=%d version=%d", len(multiple.ObjectsModified), multiple.Version)
		for _, object := range multiple.ObjectsModified {
			log.Printf("[armory] multiple SO type_id=%d object_bytes=%d", object.TypeID, len(object.ObjectData))
			if result.XpShopTypeID != 0 && object.TypeID == result.XpShopTypeID && decodeIncrementalArmoryObject(result, object.TypeID, object.ObjectData) {
				matched = true
			}
		}
		return matched, nil
	default:
		return false, nil
	}
}

func decodeArmoryFromClientWelcome(body []byte) (GCArmorySnapshot, error) {
	welcome, err := cs2pb.DecodeClientWelcome(body)
	if err != nil {
		return GCArmorySnapshot{}, fmt.Errorf("failed to decode CS2 ClientWelcome for Armory: %w", err)
	}
	var result GCArmorySnapshot
	for _, cache := range welcome.OutofdateSubscribedCaches {
		for _, objectType := range cache.Objects {
			log.Printf("[armory] welcome SO type_id=%d objects=%d", objectType.TypeID, len(objectType.ObjectData))
			if objectType.TypeID == 1 || len(objectType.ObjectData) != 1 {
				continue
			}
			for _, objectData := range objectType.ObjectData {
				state, valid, reason := decodeXpShopCandidate(objectData)
				log.Printf("[armory] welcome candidate type_id=%d valid=%t reason=%s", objectType.TypeID, valid, reason)
				if !valid {
					continue
				}
				if result.XpShopTypeID != 0 && result.XpShopTypeID != objectType.TypeID {
					if result.XpShopTypeID == observedXpShopTypeID {
						continue
					}
					if objectType.TypeID != observedXpShopTypeID {
						return GCArmorySnapshot{}, fmt.Errorf("ambiguous XpShop SOCache candidates: type %d and type %d", result.XpShopTypeID, objectType.TypeID)
					}
				}
				result.XpShopTypeID = objectType.TypeID
				applyXpShopState(&result, state)
			}
		}
	}
	return result, nil
}

func decodeXpShopSubscribedCache(result *GCArmorySnapshot, subscribed cs2pb.SOCacheSubscribed) (bool, error) {
	for _, objectType := range subscribed.Objects {
		log.Printf("[armory] subscribed SO type_id=%d objects=%d", objectType.TypeID, len(objectType.ObjectData))
		if objectType.TypeID == 1 || len(objectType.ObjectData) != 1 {
			continue
		}
		for _, objectData := range objectType.ObjectData {
			state, valid, reason := decodeXpShopCandidate(objectData)
			log.Printf("[armory] subscribed candidate type_id=%d valid=%t reason=%s", objectType.TypeID, valid, reason)
			if !valid {
				continue
			}
			if result.XpShopTypeID != 0 && result.XpShopTypeID != objectType.TypeID {
				if result.XpShopTypeID == observedXpShopTypeID {
					continue
				}
				if objectType.TypeID != observedXpShopTypeID {
					return false, fmt.Errorf("ambiguous XpShop SOCache candidates: type %d and type %d", result.XpShopTypeID, objectType.TypeID)
				}
			}
			result.XpShopTypeID = objectType.TypeID
			applyXpShopState(result, state)
			return true, nil
		}
	}
	return false, nil
}

// CS2 currently publishes CSOAccountXpShop as SO type 6. The protobuf schema
// does not declare SO type IDs, so retain structural discovery as a fallback,
// but prefer the observed type when another account object has the same wire
// shape (for example, an object that only exists on accounts with credits).
const observedXpShopTypeID int32 = 6

func decodeIncrementalArmoryObject(result *GCArmorySnapshot, typeID int32, data []byte) bool {
	state, valid, reason := decodeXpShopCandidate(data)
	log.Printf("[armory] incremental candidate type_id=%d valid=%t reason=%s", typeID, valid, reason)
	if !valid {
		return false
	}
	result.XpShopTypeID = typeID
	applyXpShopState(result, state)
	return true
}

func decodeXpShopCandidate(data []byte) (cs2pb.XpShop, bool, string) {
	remaining := data
	for len(remaining) > 0 {
		number, wireType, n := protowire.ConsumeTag(remaining)
		if n < 0 {
			return cs2pb.XpShop{}, false, "invalid protobuf tag"
		}
		remaining = remaining[n:]
		if number < 1 || number > 3 {
			return cs2pb.XpShop{}, false, fmt.Sprintf("unexpected field %d", number)
		}
		if wireType == protowire.VarintType {
			value, consumed := protowire.ConsumeVarint(remaining)
			if consumed < 0 || value > math.MaxUint32 {
				return cs2pb.XpShop{}, false, fmt.Sprintf("field %d is not uint32", number)
			}
			remaining = remaining[consumed:]
			continue
		}
		if number == 3 && wireType == protowire.BytesType {
			packed, consumed := protowire.ConsumeBytes(remaining)
			if consumed < 0 {
				return cs2pb.XpShop{}, false, "invalid packed xp_tracks"
			}
			for len(packed) > 0 {
				value, width := protowire.ConsumeVarint(packed)
				if width < 0 || value > math.MaxUint32 {
					return cs2pb.XpShop{}, false, "packed xp_track is not uint32"
				}
				packed = packed[width:]
			}
			remaining = remaining[consumed:]
			continue
		}
		return cs2pb.XpShop{}, false, fmt.Sprintf("field %d has wire type %d", number, wireType)
	}
	state, err := cs2pb.DecodeXpShop(data)
	if err != nil {
		return cs2pb.XpShop{}, false, err.Error()
	}
	if !state.GenerationPresent {
		return cs2pb.XpShop{}, false, "generation_time field is absent"
	}
	if state.RedeemableBalance > 1_000_000 {
		return cs2pb.XpShop{}, false, fmt.Sprintf("balance %d outside XP Shop range", state.RedeemableBalance)
	}
	return state, true, "exact CSOAccountXpShop fields and uint32 widths"
}

func applyXpShopState(result *GCArmorySnapshot, state cs2pb.XpShop) {
	result.GenerationTime = state.GenerationTime
	result.Balance = state.RedeemableBalance
	result.ItemIDs = nil
	log.Printf("[armory] XpShop state generation=%d balance=%d tracks=%v", result.GenerationTime, result.Balance, state.XpTracks)
}

func decodeCS2ClientLogonFatalError(body []byte) error {
	fatal, err := cs2pb.UnmarshalMessage("CMsgGCCStrike15V2ClientLogonFatalError", body)
	if err != nil {
		return fmt.Errorf("CS2 GC ClientLogonFatalError emsg=%d body_bytes=%d decode failed: %w", protocol.EMsgGCCStrike15V2ClientLogonFatalError, len(body), err)
	}
	message := fatal.Get(fatal.Descriptor().Fields().ByName("message")).String()
	if message == "" {
		message = fmt.Sprintf("errorcode=%d", fatal.Get(fatal.Descriptor().Fields().ByName("errorcode")).Int())
	}
	country := fatal.Get(fatal.Descriptor().Fields().ByName("country")).String()
	if country != "" {
		return fmt.Errorf("CS2 GC ClientLogonFatalError: %s country=%s", message, country)
	}
	return fmt.Errorf("CS2 GC ClientLogonFatalError: %s", message)
}

func decodeCS2ConnectionStatus(body []byte) (string, error) {
	status, err := cs2pb.UnmarshalMessage("CMsgConnectionStatus", body)
	if err != nil {
		return "", fmt.Errorf("CS2 GC ConnectionStatus emsg=%d body_bytes=%d decode failed: %w", protocol.EMsgGCClientConnectionStatus, len(body), err)
	}
	uintField := func(name string) uint64 {
		return status.Get(status.Descriptor().Fields().ByName(protoreflect.Name(name))).Uint()
	}
	statusField := status.Descriptor().Fields().ByName("status")
	statusValue := status.Get(statusField).Enum()
	statusName := statusField.Enum().Values().ByNumber(statusValue).Name()
	return fmt.Sprintf(
		"status=%s client_session_need=%d queue_position=%d queue_size=%d wait_seconds=%d estimated_wait_seconds_remaining=%d",
		statusName,
		uintField("client_session_need"),
		uintField("queue_position"),
		uintField("queue_size"),
		uintField("wait_seconds"),
		uintField("estimated_wait_seconds_remaining"),
	), nil
}

func isCS2ConnectionStatusNoSession(body []byte) bool {
	status, err := cs2pb.UnmarshalMessage("CMsgConnectionStatus", body)
	if err != nil {
		return false
	}
	noSession, err := cs2pb.EnumValue("GCConnectionStatus", "GCConnectionStatus_NO_SESSION")
	if err != nil {
		return false
	}
	return uint32(status.Get(status.Descriptor().Fields().ByName("status")).Enum()) == noSession
}

func nextCS2HelloEMsg(current uint32) uint32 {
	switch current {
	case protocol.EMsgGCClientHello:
		return protocol.EMsgGCClientHelloR2
	case protocol.EMsgGCClientHelloR2:
		return protocol.EMsgGCClientHelloR3
	case protocol.EMsgGCClientHelloR3:
		return protocol.EMsgGCClientHelloR4
	default:
		return current
	}
}
