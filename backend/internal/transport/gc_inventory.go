package transport

import (
	"context"
	"encoding/binary"
	"fmt"
	"log"
	"math"
	"time"

	"cs-inv-edit/backend/internal/proto/generated"
	multigamepb "cs-inv-edit/backend/internal/proto/generated/multigamepb"
	"cs-inv-edit/backend/internal/protocol"
	"github.com/Lucino772/envelop/pkg/steam"
	"github.com/Lucino772/envelop/pkg/steam/steamlang"
	"github.com/Lucino772/envelop/pkg/steam/steammsg"
	"github.com/Lucino772/envelop/pkg/steam/steampb"
	"google.golang.org/protobuf/encoding/protowire"
	"google.golang.org/protobuf/proto"
)

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
	s.events <- GCEvent{Type: "steam.games_played.sent", Payload: fmt.Sprintf("emsg=%s appids=%v", steamlang.EMsg_ClientGamesPlayed.String(), appIDs)}
	return nil
}

func (s *SteamGCClient) RequestGameInventory(ctx context.Context, appID uint32) ([]GCInventoryItem, error) {
	s.requestMu.Lock()
	defer s.requestMu.Unlock()
	if appID != 440 && appID != 570 {
		return nil, fmt.Errorf("unsupported multi-game inventory AppID %d", appID)
	}
	trace := newDiagnosticTrace(fmt.Sprintf("appid=%d GC inventory request started", appID))
	if err := s.sendGamesPlayed([]uint32{protocol.AppIDCS2, appID}); err != nil {
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
			case 24:
				items, found, decodeErr := decodeGenericSubscribedInventory(appID, message.Body)
				if decodeErr != nil {
					return nil, trace.Error(decodeErr)
				}
				if found {
					trace.Add(fmt.Sprintf("appid=%d subscribed inventory_items=%d welcome_seen=%t", appID, len(items), welcomeSeen))
					return items, nil
				}
			}
		}
	}
}

func gameClientHello(appID uint32) ([]byte, error) {
	// These versions come from steam.inf at the pinned tracker revisions listed
	// in docs/multi-game-economy-sources.md. Dota 2 must explicitly identify
	// Source 2 because the protobuf's legacy default is Source 1.
	switch appID {
	case 440:
		return proto.Marshal(&multigamepb.CMsgClientHello{Version: proto.Uint32(10815139)})
	case 570:
		return proto.Marshal(&multigamepb.CMsgClientHello{Version: proto.Uint32(6859), ClientSessionNeed: proto.Uint32(0), ClientLauncher: proto.Uint32(0), Engine: proto.Uint32(1)})
	default:
		return nil, fmt.Errorf("unsupported hello AppID %d", appID)
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
	var welcome multigamepb.CMsgClientWelcome
	if err := proto.Unmarshal(body, &welcome); err != nil {
		return nil, false, err
	}
	for _, cache := range welcome.GetOutofdateSubscribedCaches() {
		if items, found, err := decodeGenericSubscribedTypes(appID, cache.GetObjects()); found || err != nil {
			return items, found, err
		}
	}
	return nil, false, nil
}

func decodeGenericSubscribedInventory(appID uint32, body []byte) ([]GCInventoryItem, bool, error) {
	var cache multigamepb.CMsgSOCacheSubscribed
	if err := proto.Unmarshal(body, &cache); err != nil {
		return nil, false, err
	}
	return decodeGenericSubscribedTypes(appID, cache.GetObjects())
}

func decodeGenericSubscribedTypes(appID uint32, types []*multigamepb.CMsgSOCacheSubscribed_SubscribedType) ([]GCInventoryItem, bool, error) {
	for _, objectType := range types {
		if objectType.GetTypeId() != 1 {
			continue
		}
		items := make([]GCInventoryItem, 0, len(objectType.GetObjectData()))
		for _, data := range objectType.GetObjectData() {
			var item multigamepb.CSOEconItem
			if err := proto.Unmarshal(data, &item); err != nil {
				return nil, true, fmt.Errorf("decode economy item: %w", err)
			}
			if item.GetId() == 0 {
				continue
			}
			attributes := make(map[uint32]uint32, len(item.GetAttribute()))
			attributeBytes := make(map[uint32][]byte, len(item.GetAttribute()))
			for _, attribute := range item.GetAttribute() {
				definitionIndex := attribute.GetDefIndex()
				if appID == 570 && attribute.DefIndex == nil {
					definitionIndex = 65535
				}
				value := attribute.GetValue()
				if value == 0 && len(attribute.GetValueBytes()) >= 4 {
					value = binary.LittleEndian.Uint32(attribute.GetValueBytes()[:4])
				}
				attributes[definitionIndex] = value
				if len(attribute.GetValueBytes()) > 0 {
					attributeBytes[definitionIndex] = append([]byte(nil), attribute.GetValueBytes()...)
				}
			}
			equipped := make([]GCEquippedState, 0, len(item.GetEquippedState()))
			for _, state := range item.GetEquippedState() {
				equipped = append(equipped, GCEquippedState{Class: state.GetNewClass(), Slot: state.GetNewSlot()})
			}
			quantity, level, quality := item.GetQuantity(), item.GetLevel(), item.GetQuality()
			if appID == 570 {
				if item.Quantity == nil {
					quantity = 1
				}
				if item.Level == nil {
					level = 1
				}
				if item.Quality == nil {
					quality = 4
				}
			}
			items = append(items, GCInventoryItem{ID: item.GetId(), OriginalID: item.GetOriginalId(), DefIndex: item.GetDefIndex(), Quantity: quantity, Quality: quality, Inventory: item.GetInventory(), CustomName: item.GetCustomName(), Attributes: attributes, AttributeBytes: attributeBytes, EquippedStates: equipped, InteriorItemID: item.GetInteriorItem().GetId(), Level: level, Flags: item.GetFlags(), Origin: item.GetOrigin(), Style: item.GetStyle(), CustomDesc: item.GetCustomDesc()})
		}
		return items, true, nil
	}
	return nil, false, nil
}

func (s *SteamGCClient) SendToGC(_ context.Context, appID uint32, emsg uint32, body []byte) error {
	return s.sendToGC(appID, emsg, body, false)
}

func (s *SteamGCClient) SendProtoToGC(_ context.Context, appID uint32, emsg uint32, body []byte) error {
	return s.sendToGC(appID, emsg, body, true)
}

func (s *SteamGCClient) sendToGC(appID uint32, emsg uint32, body []byte, protobufPayload bool) error {
	s.mu.Lock()
	conn := s.conn
	s.mu.Unlock()
	if conn == nil {
		return ErrNotConnected
	}
	packet, err := encodeGCClientPacket(appID, emsg, body, protobufPayload)
	if err != nil {
		return err
	}
	if err := conn.SendPacket(packet); err != nil {
		return err
	}
	diagnosticEMsg := emsg
	if protobufPayload {
		diagnosticEMsg = emsg | protoMask
	}
	s.events <- GCEvent{Type: "gc.sent", Payload: GCMessage{AppID: appID, EMsg: diagnosticEMsg, Body: append([]byte(nil), packetBodyForDiagnostics(emsg, body, protobufPayload)...)}}
	return nil
}

func packetBodyForDiagnostics(emsg uint32, body []byte, protobufPayload bool) []byte {
	if !protobufPayload {
		return body
	}
	payload, err := encodeGCProtoPayload(emsg, body)
	if err != nil {
		return body
	}
	return payload
}

func (s *SteamGCClient) RequestInventory(ctx context.Context) ([]GCInventoryItem, error) {
	s.requestMu.Lock()
	defer s.requestMu.Unlock()
	trace := newDiagnosticTrace("cs2 gc inventory request started")
	if err := s.SendGamesPlayed(ctx, protocol.AppIDCS2); err != nil {
		wrapped := fmt.Errorf("cs2 games played presence failed: %w", err)
		return nil, trace.Error(wrapped)
	}
	trace.Add("cs2 games played presence sent")
	body, err := proto.Marshal(&cs2pb.CMsgClientHello{
		Version:           proto.Uint32(2000244),
		ClientSessionNeed: proto.Uint32(0),
		ClientLauncher:    proto.Uint32(0),
		SteamLauncher:     proto.Uint32(0),
	})
	if err != nil {
		return nil, err
	}
	helloEMsg := uint32(protocol.EMsgGCClientHello)
	if err := s.SendProtoToGC(ctx, protocol.AppIDCS2, helloEMsg, body); err != nil {
		wrapped := fmt.Errorf("cs2 gc client hello send failed: %w", err)
		return nil, trace.Error(wrapped)
	}
	trace.Add(fmt.Sprintf("cs2 gc ClientHello sent emsg=%d", helloEMsg))
	helloRetry := time.NewTimer(time.Second)
	defer helloRetry.Stop()
	helloRetryDelay := time.Second
	statusNoSessionCount := 0
	for {
		select {
		case <-ctx.Done():
			wrapped := fmt.Errorf("cs2 gc inventory timed out waiting for ClientWelcome: %w", ctx.Err())
			return nil, trace.Error(wrapped)
		case <-helloRetry.C:
			if err := s.SendProtoToGC(ctx, protocol.AppIDCS2, helloEMsg, body); err != nil {
				wrapped := fmt.Errorf("cs2 gc client hello retry failed: %w", err)
				return nil, trace.Error(wrapped)
			}
			trace.Add(fmt.Sprintf("cs2 gc ClientHello retry sent emsg=%d delay=%s", helloEMsg, helloRetryDelay))
			helloRetryDelay *= 2
			if helloRetryDelay > 8*time.Second {
				helloRetryDelay = 8 * time.Second
			}
			helloRetry.Reset(helloRetryDelay)
		case event := <-s.events:
			trace.Add(fmt.Sprintf("cs2 gc observed event type=%s", event.Type))
			if event.Type == "steam.games_played.sent" || event.Type == "gc.sent" {
				trace.Add(fmt.Sprintf("cs2 gc observed event payload=%v", event.Payload))
			}
			message, ok := event.Payload.(GCMessage)
			if !ok || event.Type != "gc.message" {
				continue
			}
			trace.Add(fmt.Sprintf("cs2 gc observed appid=%d emsg=%d body_bytes=%d", message.AppID, message.EMsg, len(message.Body)))
			if message.AppID != protocol.AppIDCS2 {
				continue
			}
			if message.EMsg == protocol.EMsgGCCStrike15V2ClientLogonFatalError {
				return nil, trace.Error(decodeCS2ClientLogonFatalError(message.Body))
			}
			if message.EMsg == protocol.EMsgGCClientConnectionStatus {
				status, err := decodeCS2ConnectionStatus(message.Body)
				if err != nil {
					return nil, trace.Error(err)
				}
				trace.Add("cs2 gc connection status " + status)
				if isCS2ConnectionStatusNoSession(message.Body) {
					statusNoSessionCount++
					nextHello := nextCS2HelloEMsg(helloEMsg)
					if nextHello != helloEMsg {
						helloEMsg = nextHello
						helloRetryDelay = time.Second
						trace.Add(fmt.Sprintf("cs2 gc switching ClientHello variant after NO_SESSION next_emsg=%d", helloEMsg))
						if err := s.SendProtoToGC(ctx, protocol.AppIDCS2, helloEMsg, body); err != nil {
							wrapped := fmt.Errorf("cs2 gc client hello variant send failed: %w", err)
							return nil, trace.Error(wrapped)
						}
						trace.Add(fmt.Sprintf("cs2 gc ClientHello variant sent emsg=%d", helloEMsg))
						resetTimer(helloRetry, helloRetryDelay)
						continue
					}
					if statusNoSessionCount >= 2 {
						return nil, trace.Error(fmt.Errorf("CS2 GC refused session: %s", status))
					}
				}
				continue
			}
			if message.EMsg == protocol.EMsgGCClientWelcome {
				s.mu.Lock()
				s.lastWelcome = append([]byte(nil), message.Body...)
				s.mu.Unlock()
				items, err := decodeInventoryFromClientWelcome(message.Body)
				if err != nil {
					return nil, trace.Error(err)
				}
				trace.Add(fmt.Sprintf("cs2 gc ClientWelcome decoded inventory_items=%d", len(items)))
				return items, nil
			}
		}
	}
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
		var notification cs2pb.CMsgGCCStrike15V2GC2ClientNotifyXPShop
		if err := proto.Unmarshal(message.Body, &notification); err != nil {
			return false, err
		}
		state := notification.GetPostmatch()
		if state == nil {
			state = notification.GetPrematch()
		}
		if state == nil {
			return false, nil
		}
		applyXpShopState(result, state)
		return true, nil
	}
	switch message.EMsg {
	case protocol.EMsgSOCacheSubscribed:
		var subscribed cs2pb.CMsgSOCacheSubscribed
		if err := proto.Unmarshal(message.Body, &subscribed); err != nil {
			return false, err
		}
		log.Printf("[armory] CacheSubscribed objects=%d version=%d", len(subscribed.GetObjects()), subscribed.GetVersion())
		return decodeXpShopSubscribedCache(result, &subscribed)
	case protocol.EMsgSOCreate, protocol.EMsgSOUpdate:
		var single cs2pb.CMsgSOSingleObject
		if err := proto.Unmarshal(message.Body, &single); err != nil {
			return false, err
		}
		log.Printf("[armory] single SO emsg=%d type_id=%d object_bytes=%d version=%d", message.EMsg, single.GetTypeId(), len(single.GetObjectData()), single.GetVersion())
		// A keyless XP Shop state and a single bid have indistinguishable fields
		// 1-3 when the bid omits optional field 4. Incremental messages can update
		// only a type already identified from a complete subscribed cache.
		if result.XpShopTypeID == 0 || single.GetTypeId() != result.XpShopTypeID {
			return false, nil
		}
		return decodeIncrementalArmoryObject(result, single.GetTypeId(), single.GetObjectData()), nil
	case protocol.EMsgSOUpdateMultiple:
		var multiple cs2pb.CMsgSOMultipleObjects
		if err := proto.Unmarshal(message.Body, &multiple); err != nil {
			return false, err
		}
		matched := false
		log.Printf("[armory] multiple SO objects=%d version=%d", len(multiple.GetObjectsModified()), multiple.GetVersion())
		for _, object := range multiple.GetObjectsModified() {
			log.Printf("[armory] multiple SO type_id=%d object_bytes=%d", object.GetTypeId(), len(object.GetObjectData()))
			if result.XpShopTypeID != 0 && object.GetTypeId() == result.XpShopTypeID && decodeIncrementalArmoryObject(result, object.GetTypeId(), object.GetObjectData()) {
				matched = true
			}
		}
		return matched, nil
	default:
		return false, nil
	}
}

func decodeArmoryFromClientWelcome(body []byte) (GCArmorySnapshot, error) {
	var welcome cs2pb.CMsgClientWelcome
	if err := proto.Unmarshal(body, &welcome); err != nil {
		return GCArmorySnapshot{}, fmt.Errorf("failed to decode CS2 ClientWelcome for Armory: %w", err)
	}
	var result GCArmorySnapshot
	for _, cache := range welcome.GetOutofdateSubscribedCaches() {
		for _, objectType := range cache.GetObjects() {
			log.Printf("[armory] welcome SO type_id=%d objects=%d", objectType.GetTypeId(), len(objectType.GetObjectData()))
			if objectType.GetTypeId() == 1 || len(objectType.GetObjectData()) != 1 {
				continue
			}
			for _, objectData := range objectType.GetObjectData() {
				state, valid, reason := decodeXpShopCandidate(objectData)
				log.Printf("[armory] welcome candidate type_id=%d valid=%t reason=%s", objectType.GetTypeId(), valid, reason)
				if !valid {
					continue
				}
				if result.XpShopTypeID != 0 && result.XpShopTypeID != objectType.GetTypeId() {
					return GCArmorySnapshot{}, fmt.Errorf("ambiguous XpShop SOCache candidates: type %d and type %d", result.XpShopTypeID, objectType.GetTypeId())
				}
				result.XpShopTypeID = objectType.GetTypeId()
				applyXpShopState(&result, state)
			}
		}
	}
	return result, nil
}

func decodeXpShopSubscribedCache(result *GCArmorySnapshot, subscribed *cs2pb.CMsgSOCacheSubscribed) (bool, error) {
	for _, objectType := range subscribed.GetObjects() {
		log.Printf("[armory] subscribed SO type_id=%d objects=%d", objectType.GetTypeId(), len(objectType.GetObjectData()))
		if objectType.GetTypeId() == 1 || len(objectType.GetObjectData()) != 1 {
			continue
		}
		for _, objectData := range objectType.GetObjectData() {
			state, valid, reason := decodeXpShopCandidate(objectData)
			log.Printf("[armory] subscribed candidate type_id=%d valid=%t reason=%s", objectType.GetTypeId(), valid, reason)
			if !valid {
				continue
			}
			if result.XpShopTypeID != 0 && result.XpShopTypeID != objectType.GetTypeId() {
				return false, fmt.Errorf("ambiguous XpShop SOCache candidates: type %d and type %d", result.XpShopTypeID, objectType.GetTypeId())
			}
			result.XpShopTypeID = objectType.GetTypeId()
			applyXpShopState(result, state)
			return true, nil
		}
	}
	return false, nil
}

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

func decodeXpShopCandidate(data []byte) (*cs2pb.CSOAccountXpShop, bool, string) {
	remaining := data
	for len(remaining) > 0 {
		number, wireType, n := protowire.ConsumeTag(remaining)
		if n < 0 {
			return nil, false, "invalid protobuf tag"
		}
		remaining = remaining[n:]
		if number < 1 || number > 3 {
			return nil, false, fmt.Sprintf("unexpected field %d", number)
		}
		if wireType == protowire.VarintType {
			value, consumed := protowire.ConsumeVarint(remaining)
			if consumed < 0 || value > math.MaxUint32 {
				return nil, false, fmt.Sprintf("field %d is not uint32", number)
			}
			remaining = remaining[consumed:]
			continue
		}
		if number == 3 && wireType == protowire.BytesType {
			packed, consumed := protowire.ConsumeBytes(remaining)
			if consumed < 0 {
				return nil, false, "invalid packed xp_tracks"
			}
			for len(packed) > 0 {
				value, width := protowire.ConsumeVarint(packed)
				if width < 0 || value > math.MaxUint32 {
					return nil, false, "packed xp_track is not uint32"
				}
				packed = packed[width:]
			}
			remaining = remaining[consumed:]
			continue
		}
		return nil, false, fmt.Sprintf("field %d has wire type %d", number, wireType)
	}
	var state cs2pb.CSOAccountXpShop
	if err := proto.Unmarshal(data, &state); err != nil {
		return nil, false, err.Error()
	}
	if state.GenerationTime == nil {
		return nil, false, "generation_time field is absent"
	}
	if state.GetRedeemableBalance() > 1_000_000 {
		return nil, false, fmt.Sprintf("balance %d outside XP Shop range", state.GetRedeemableBalance())
	}
	return &state, true, "exact CSOAccountXpShop fields and uint32 widths"
}

func applyXpShopState(result *GCArmorySnapshot, state *cs2pb.CSOAccountXpShop) {
	result.GenerationTime = state.GetGenerationTime()
	result.Balance = state.GetRedeemableBalance()
	result.ItemIDs = nil
	log.Printf("[armory] XpShop state generation=%d balance=%d tracks=%v", result.GenerationTime, result.Balance, state.GetXpTracks())
}

func decodeCS2ClientLogonFatalError(body []byte) error {
	var fatal cs2pb.CMsgGCCStrike15V2ClientLogonFatalError
	if err := proto.Unmarshal(body, &fatal); err != nil {
		return fmt.Errorf("CS2 GC ClientLogonFatalError emsg=%d body_bytes=%d decode failed: %w", protocol.EMsgGCCStrike15V2ClientLogonFatalError, len(body), err)
	}
	message := fatal.GetMessage()
	if message == "" {
		message = fmt.Sprintf("errorcode=%d", fatal.GetErrorcode())
	}
	if fatal.GetCountry() != "" {
		return fmt.Errorf("CS2 GC ClientLogonFatalError: %s country=%s", message, fatal.GetCountry())
	}
	return fmt.Errorf("CS2 GC ClientLogonFatalError: %s", message)
}

func decodeCS2ConnectionStatus(body []byte) (string, error) {
	var status cs2pb.CMsgConnectionStatus
	if err := proto.Unmarshal(body, &status); err != nil {
		return "", fmt.Errorf("CS2 GC ConnectionStatus emsg=%d body_bytes=%d decode failed: %w", protocol.EMsgGCClientConnectionStatus, len(body), err)
	}
	return fmt.Sprintf(
		"status=%s client_session_need=%d queue_position=%d queue_size=%d wait_seconds=%d estimated_wait_seconds_remaining=%d",
		status.GetStatus().String(),
		status.GetClientSessionNeed(),
		status.GetQueuePosition(),
		status.GetQueueSize(),
		status.GetWaitSeconds(),
		status.GetEstimatedWaitSecondsRemaining(),
	), nil
}

func isCS2ConnectionStatusNoSession(body []byte) bool {
	var status cs2pb.CMsgConnectionStatus
	if err := proto.Unmarshal(body, &status); err != nil {
		return false
	}
	return status.GetStatus() == cs2pb.GCConnectionStatus_GCConnectionStatus_NO_SESSION
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

func resetTimer(timer *time.Timer, delay time.Duration) {
	if !timer.Stop() {
		select {
		case <-timer.C:
		default:
		}
	}
	timer.Reset(delay)
}

func encodeGCClientPacket(appID uint32, emsg uint32, body []byte, protobufPayload bool) (*steammsg.Packet, error) {
	if appID == 0 {
		return nil, fmt.Errorf("app id is required")
	}
	if emsg == 0 {
		return nil, fmt.Errorf("gc emsg is required")
	}
	payload := append([]byte(nil), body...)
	if protobufPayload {
		var err error
		payload, err = encodeGCProtoPayload(emsg, body)
		if err != nil {
			return nil, err
		}
	}
	header := steammsg.NewProtoHeader(steamlang.EMsg_ClientToGC)
	header.Proto.RoutingAppid = proto.Uint32(appID)
	msgType := emsg
	if protobufPayload {
		msgType = emsg | protoMask
	}
	msg := &steampb.CMsgGCClient{
		Appid:   proto.Uint32(appID),
		Msgtype: proto.Uint32(msgType),
		Payload: payload,
	}
	return steammsg.EncodePacket(header, msg, nil)
}

func encodeGCProtoPayload(emsg uint32, body []byte) ([]byte, error) {
	headerBytes, err := proto.Marshal(&steampb.CMsgProtoBufHeader{
		JobidSource: proto.Uint64(^uint64(0)),
	})
	if err != nil {
		return nil, err
	}
	payload := make([]byte, 8, 8+len(headerBytes)+len(body))
	binary.LittleEndian.PutUint32(payload[0:4], emsg|protoMask)
	binary.LittleEndian.PutUint32(payload[4:8], uint32(len(headerBytes)))
	payload = append(payload, headerBytes...)
	payload = append(payload, body...)
	return payload, nil
}

func decodeGCProtoPayload(message GCMessage) (gcProtoMessage, error) {
	if message.EMsg&protoMask == 0 {
		return gcProtoMessage{EMsg: message.EMsg, Body: append([]byte(nil), message.Body...)}, nil
	}
	emsg := message.EMsg &^ protoMask
	if len(message.Body) < 8 {
		return gcProtoMessage{EMsg: emsg, Body: append([]byte(nil), message.Body...)}, nil
	}
	innerMsg := binary.LittleEndian.Uint32(message.Body[0:4])
	headerLen := int(binary.LittleEndian.Uint32(message.Body[4:8]))
	if innerMsg != message.EMsg && innerMsg != emsg {
		return gcProtoMessage{EMsg: emsg, Body: append([]byte(nil), message.Body...)}, nil
	}
	if headerLen < 0 || 8+headerLen > len(message.Body) {
		return gcProtoMessage{}, fmt.Errorf("protobuf GC payload for appid=%d emsg=%d has invalid header length %d for %d bytes", message.AppID, message.EMsg, headerLen, len(message.Body))
	}
	var header steampb.CMsgProtoBufHeader
	if err := proto.Unmarshal(message.Body[8:8+headerLen], &header); err != nil {
		return gcProtoMessage{}, fmt.Errorf("failed to decode GC protobuf header for appid=%d emsg=%d: %w", message.AppID, message.EMsg, err)
	}
	return gcProtoMessage{EMsg: emsg, Body: append([]byte(nil), message.Body[8+headerLen:]...)}, nil
}

func decodeInventoryFromClientWelcome(body []byte) ([]GCInventoryItem, error) {
	var welcome cs2pb.CMsgClientWelcome
	if err := proto.Unmarshal(body, &welcome); err != nil {
		return nil, fmt.Errorf("failed to decode CS2 ClientWelcome: %w", err)
	}
	items := make([]GCInventoryItem, 0)
	var decodeErrors int
	for _, cache := range welcome.GetOutofdateSubscribedCaches() {
		for _, objectType := range cache.GetObjects() {
			if objectType.GetTypeId() != 1 { // CSOEconItem is the authoritative owned-item SO type.
				continue
			}
			for _, objectData := range objectType.GetObjectData() {
				var econ cs2pb.CSOEconItem
				if err := proto.Unmarshal(objectData, &econ); err != nil {
					decodeErrors++
					continue
				}
				if econ.GetId() == 0 {
					continue
				}
				paintWear := econPaintWear(&econ)
				items = append(items, GCInventoryItem{
					ID:         econ.GetId(),
					OriginalID: econ.GetOriginalId(),
					DefIndex:   econ.GetDefIndex(),
					Quantity:   econ.GetQuantity(),
					Quality:    econ.GetQuality(),
					Rarity:     econ.GetRarity(),
					Inventory:  econ.GetInventory(),
					CustomName: econ.GetCustomName(),
					PaintKit:   econPaintKit(&econ),
					PaintWear:  paintWear,
					Attributes: econAttributes(&econ),
				})
			}
		}
	}
	if len(items) == 0 && decodeErrors > 0 {
		return nil, fmt.Errorf("failed to decode CS2 econ items from SOCache: %d object decode errors", decodeErrors)
	}
	if len(items) == 0 {
		return nil, fmt.Errorf("CS2 ClientWelcome contained no decoded econ inventory items")
	}
	return items, nil
}

func econAttributes(item *cs2pb.CSOEconItem) map[uint32]uint32 {
	attributes := make(map[uint32]uint32)
	for _, attribute := range item.GetAttribute() {
		value := attribute.GetValue()
		if value == 0 && len(attribute.GetValueBytes()) >= 4 {
			value = binary.LittleEndian.Uint32(attribute.GetValueBytes()[:4])
		}
		attributes[attribute.GetDefIndex()] = value
	}
	return attributes
}

func econPaintKit(item *cs2pb.CSOEconItem) uint32 {
	for _, attribute := range item.GetAttribute() {
		if attribute.GetDefIndex() == 6 {
			value := attribute.GetValue()
			if value == 0 && len(attribute.GetValueBytes()) >= 4 {
				value = binary.LittleEndian.Uint32(attribute.GetValueBytes()[:4])
			}
			// Economy attribute 6 is typed as a float in the item schema even
			// though paint-kit IDs are integral. GC value/value_bytes therefore
			// carries IEEE-754 bits rather than a directly encoded integer.
			// Retain support for already-normalized fixtures and clients.
			if value > 1<<24 {
				decoded := math.Float32frombits(value)
				if decoded >= 0 && decoded <= 1<<24 && decoded == float32(uint32(decoded)) {
					return uint32(decoded)
				}
			}
			return value
		}
	}
	return 0
}

func econPaintWear(item *cs2pb.CSOEconItem) *float64 {
	for _, attribute := range item.GetAttribute() {
		if attribute.GetDefIndex() != 8 {
			continue
		}
		value := attribute.GetValue()
		if value == 0 && len(attribute.GetValueBytes()) >= 4 {
			value = binary.LittleEndian.Uint32(attribute.GetValueBytes()[:4])
		}
		wear := float64(math.Float32frombits(value))
		return &wear
	}
	return nil
}

func encodeGamesPlayedPacket(appID uint32) (*steammsg.Packet, error) {
	return encodeGamesPlayedPacketForApps([]uint32{appID})
}

func encodeGamesPlayedPacketForApps(appIDs []uint32) (*steammsg.Packet, error) {
	header := steammsg.NewProtoHeader(steamlang.EMsg_ClientGamesPlayed)
	msg := &steampb.CMsgClientGamesPlayed{}
	labels := map[uint32]string{730: "Counter-Strike 2", 440: "Team Fortress 2", 570: "Dota 2"}
	seen := make(map[uint32]bool)
	for _, appID := range appIDs {
		if appID == 0 || seen[appID] {
			continue
		}
		seen[appID] = true
		msg.GamesPlayed = append(msg.GamesPlayed, &steampb.CMsgClientGamesPlayed_GamePlayed{GameId: proto.Uint64(steamAppGameID(appID)), GameExtraInfo: proto.String(labels[appID])})
	}
	if len(msg.GamesPlayed) == 0 {
		return nil, fmt.Errorf("at least one app id is required")
	}
	return steammsg.EncodePacket(header, msg, nil)
}

func steamAppGameID(appID uint32) uint64 {
	gameID := steam.GameId(0)
	gameID.SetAppId(appID)
	gameID.SetAppType(steam.GameType_App)
	return uint64(gameID)
}
