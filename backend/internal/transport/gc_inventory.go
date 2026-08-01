package transport

import (
	"context"
	"encoding/binary"
	"errors"
	"fmt"
	"log"
	"math"
	"time"

	"cs-inv-edit/backend/internal/proto/dota2tracking"
	cs2pb "cs-inv-edit/backend/internal/proto/gametracking"
	"cs-inv-edit/backend/internal/proto/tf2tracking"
	"cs-inv-edit/backend/internal/proto/tracking"
	"cs-inv-edit/backend/internal/protocol"
	"github.com/Lucino772/envelop/pkg/steam"
	"github.com/Lucino772/envelop/pkg/steam/steamlang"
	"github.com/Lucino772/envelop/pkg/steam/steammsg"
	"github.com/Lucino772/envelop/pkg/steam/steampb"
	"google.golang.org/protobuf/encoding/protowire"
	"google.golang.org/protobuf/proto"
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

func (s *SteamGCClient) SendToGC(ctx context.Context, appID uint32, emsg uint32, body []byte) error {
	return s.sendToGC(ctx, appID, emsg, body, false)
}

func (s *SteamGCClient) SendProtoToGC(ctx context.Context, appID uint32, emsg uint32, body []byte) error {
	return s.sendToGC(ctx, appID, emsg, body, true)
}

func (s *SteamGCClient) sendToGC(ctx context.Context, appID uint32, emsg uint32, body []byte, protobufPayload bool) error {
	select {
	case <-ctx.Done():
		return ctx.Err()
	default:
	}
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
	if protobufPayload {
		s.recordGCProtocol("sent", appID, emsg, body)
	}
	diagnosticEMsg := emsg
	if protobufPayload {
		diagnosticEMsg = emsg | protoMask
	}
	diagnostic := GCEvent{Type: "gc.sent", Payload: GCMessage{AppID: appID, EMsg: diagnosticEMsg, Body: append([]byte(nil), packetBodyForDiagnostics(emsg, body, protobufPayload)...)}}
	select {
	case s.events <- diagnostic:
	default:
		// ProtocolTrace already recorded the send. A full diagnostic queue must
		// never block or change the outcome of the real GC operation.
	}
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

// CS2's terminal UI polls for the volatile offer for five one-second
// intervals after requesting casket contents. Keep the GC receiver alive for
// that same window so a late CSOVolatileItemOffer is not discarded after the
// ordinary ClientWelcome arrives.
const cs2PostWelcomeSettle = 5 * time.Second

func (s *SteamGCClient) RequestInventory(ctx context.Context) ([]GCInventoryItem, error) {
	s.requestMu.Lock()
	defer s.requestMu.Unlock()
	trace := newDiagnosticTrace("cs2 gc inventory request started")
	if err := s.ensureSteamSession(ctx); err != nil {
		return nil, trace.Error(fmt.Errorf("steam session recovery failed: %w", err))
	}
	if err := s.ensureGamesPlayedIncludes(protocol.AppIDCS2); err != nil {
		wrapped := fmt.Errorf("cs2 games played presence failed: %w", err)
		return nil, trace.Error(wrapped)
	}
	trace.Add("cs2 games played presence sent")
	body, err := cs2ClientHello()
	if err != nil {
		return nil, err
	}
	helloEMsg := uint32(protocol.EMsgGCClientHello)
	if err := s.SendProtoToGC(ctx, protocol.AppIDCS2, helloEMsg, body); err != nil {
		wrapped := fmt.Errorf("cs2 gc client hello send failed: %w", err)
		return nil, trace.Error(wrapped)
	}
	trace.Add(fmt.Sprintf("cs2 gc ClientHello sent emsg=%d client_version=%d", helloEMsg, cs2ClientVersion))
	helloRetry := time.NewTimer(time.Second)
	defer helloRetry.Stop()
	helloRetryDelay := time.Second
	helloRetryCount := 0
	statusNoSessionCount := 0
	incrementalItems := make(map[uint64]GCInventoryItem)
	volatileOffers := make(map[uint32][]GCVolatileOffer)
	var welcomeItems []GCInventoryItem
	var settleTimer *time.Timer
	var settle <-chan time.Time
	defer func() {
		if settleTimer != nil {
			settleTimer.Stop()
		}
	}()
	for {
		select {
		case <-ctx.Done():
			if len(welcomeItems) > 0 {
				welcomeItems = mergeInventoryItemMap(welcomeItems, incrementalItems)
				attachVolatileOffers(welcomeItems, volatileOffers)
				trace.Add(fmt.Sprintf("cs2 gc settle interrupted by context; returning inventory_items=%d incremental_econ_items=%d volatile_offer_defindexes=%d", len(welcomeItems), len(incrementalItems), len(volatileOffers)))
				return welcomeItems, nil
			}
			wrapped := fmt.Errorf("cs2 gc inventory timed out waiting for ClientWelcome after %d ClientHello retries (client_version=%d): %w", helloRetryCount, cs2ClientVersion, ctx.Err())
			return nil, trace.Error(wrapped)
		case <-settle:
			welcomeItems = mergeInventoryItemMap(welcomeItems, incrementalItems)
			attachVolatileOffers(welcomeItems, volatileOffers)
			trace.Add(fmt.Sprintf("cs2 gc post-welcome settle completed inventory_items=%d incremental_econ_items=%d volatile_offer_defindexes=%d", len(welcomeItems), len(incrementalItems), len(volatileOffers)))
			return welcomeItems, nil
		case <-helloRetry.C:
			if len(welcomeItems) > 0 {
				continue
			}
			if err := s.SendProtoToGC(ctx, protocol.AppIDCS2, helloEMsg, body); err != nil {
				if errors.Is(err, ErrNotConnected) {
					trace.Add("steam transport dropped while waiting for CS2 GC; attempting one session recovery")
					if recoveryErr := s.ensureSteamSession(ctx); recoveryErr != nil {
						wrapped := fmt.Errorf("cs2 gc session recovery failed: %w", sessionConflictError(recoveryErr))
						return nil, trace.Error(wrapped)
					}
					if recoveryErr := s.ensureGamesPlayedIncludes(protocol.AppIDCS2); recoveryErr != nil {
						return nil, trace.Error(fmt.Errorf("cs2 presence recovery failed: %w", recoveryErr))
					}
					trace.Add("steam session and CS2 presence recovered")
				} else {
					wrapped := fmt.Errorf("cs2 gc client hello retry failed: %w", err)
					return nil, trace.Error(wrapped)
				}
				if err := s.SendProtoToGC(ctx, protocol.AppIDCS2, helloEMsg, body); err != nil {
					return nil, trace.Error(fmt.Errorf("cs2 gc client hello send after session recovery failed: %w", err))
				}
			}
			helloRetryCount++
			trace.Add(fmt.Sprintf("cs2 gc ClientHello retry sent emsg=%d delay=%s retry=%d", helloEMsg, helloRetryDelay, helloRetryCount))
			helloRetryDelay *= 2
			if helloRetryDelay > 8*time.Second {
				helloRetryDelay = 8 * time.Second
			}
			helloRetry.Reset(helloRetryDelay)
		case event := <-s.events:
			trace.Add(fmt.Sprintf("cs2 gc observed event type=%s", event.Type))
			if event.Type == "steam.logged_off" {
				if loggedOff, ok := event.Payload.(*steampb.CMsgClientLoggedOff); ok {
					result := loggedOff.GetEresult()
					if result == int32(steamlang.EResult_LoggedInElsewhere) || result == int32(steamlang.EResult_AlreadyLoggedInElsewhere) {
						return nil, trace.Error(SteamSessionConflictError{Result: result})
					}
				}
				return nil, trace.Error(fmt.Errorf("Steam ended the session while waiting for CS2 GC; retry to reconnect"))
			}
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
				welcomeItems = items
				if settleTimer == nil {
					settleTimer = time.NewTimer(cs2PostWelcomeSettle)
				} else {
					resetTimer(settleTimer, cs2PostWelcomeSettle)
				}
				settle = settleTimer.C
				trace.Add(fmt.Sprintf("cs2 gc ClientWelcome decoded inventory_items=%d; settling asynchronous SO updates for %s", len(items), cs2PostWelcomeSettle))
				continue
			}
			update, found, decodeErr := decodeCS2IncrementalInventory(message)
			if decodeErr != nil {
				trace.Add(fmt.Sprintf("cs2 gc incremental economy decode failed emsg=%d error=%v", message.EMsg, decodeErr))
				continue
			}
			if found {
				for _, item := range update.Items {
					incrementalItems[item.ID] = item
				}
				for defindex, offers := range update.VolatileOffers {
					volatileOffers[defindex] = append([]GCVolatileOffer(nil), offers...)
				}
				if settleTimer != nil {
					resetTimer(settleTimer, 250*time.Millisecond)
				}
				trace.Add(fmt.Sprintf("cs2 gc retained incremental objects emsg=%d economy_items=%d volatile_offer_defindexes=%d", message.EMsg, len(update.Items), len(update.VolatileOffers)))
			}
		}
	}
}

type cs2IncrementalInventoryUpdate struct {
	Items          []GCInventoryItem
	VolatileOffers map[uint32][]GCVolatileOffer
}

func (s *SteamGCClient) WaitForNewCS2InventoryItem(ctx context.Context, knownIDs map[uint64]struct{}) (GCInventoryItem, error) {
	for {
		select {
		case <-ctx.Done():
			return GCInventoryItem{}, fmt.Errorf("wait for CS2 economy item creation: %w", ctx.Err())
		case event := <-s.events:
			message, ok := event.Payload.(GCMessage)
			if !ok || event.Type != "gc.message" || message.AppID != protocol.AppIDCS2 {
				continue
			}
			update, found, err := decodeCS2IncrementalInventory(message)
			if err != nil {
				return GCInventoryItem{}, err
			}
			if !found {
				continue
			}
			for _, item := range update.Items {
				if item.ID == 0 {
					continue
				}
				if _, known := knownIDs[item.ID]; !known {
					return item, nil
				}
			}
		}
	}
}

// The current CS2 client registers
// CProtoBufSharedObject<CSOVolatileItemOffer, 20>. The MSVC symbol in the
// authoritative GameTracking client strings encodes 20 as $0BE@.
const cs2VolatileItemOfferSOTypeID int32 = 20

func decodeCS2IncrementalInventory(message GCMessage) (cs2IncrementalInventoryUpdate, bool, error) {
	switch message.EMsg {
	case protocol.EMsgSOCacheSubscribed:
		subscribed, err := cs2pb.DecodeSOCacheSubscribed(message.Body)
		if err != nil {
			return cs2IncrementalInventoryUpdate{}, true, fmt.Errorf("decode CS2 subscribed SOCache: %w", err)
		}
		return decodeCS2SubscribedTypes(subscribed.Objects)
	case protocol.EMsgSOCreate, protocol.EMsgSOUpdate:
		single, err := cs2pb.DecodeSOSingleObject(message.Body)
		if err != nil {
			return cs2IncrementalInventoryUpdate{}, true, fmt.Errorf("decode CS2 single SO: %w", err)
		}
		if single.TypeID == 1 {
			item, err := decodeCS2EconItem(single.ObjectData)
			if err != nil {
				return cs2IncrementalInventoryUpdate{}, true, err
			}
			return cs2IncrementalInventoryUpdate{Items: []GCInventoryItem{item}}, true, nil
		}
		if single.TypeID != cs2VolatileItemOfferSOTypeID {
			return cs2IncrementalInventoryUpdate{}, false, nil
		}
		offer, ok := decodeCS2VolatileOffer(single.ObjectData)
		if !ok {
			return cs2IncrementalInventoryUpdate{}, false, nil
		}
		return cs2IncrementalInventoryUpdate{VolatileOffers: map[uint32][]GCVolatileOffer{offer.DefIndex: domainVolatileOffers(offer)}}, true, nil
	case protocol.EMsgSOUpdateMultiple:
		multiple, err := cs2pb.DecodeSOMultipleObjects(message.Body)
		if err != nil {
			return cs2IncrementalInventoryUpdate{}, true, fmt.Errorf("decode CS2 multiple SO update: %w", err)
		}
		update := cs2IncrementalInventoryUpdate{Items: make([]GCInventoryItem, 0), VolatileOffers: make(map[uint32][]GCVolatileOffer)}
		for _, object := range multiple.ObjectsModified {
			if object.TypeID != 1 {
				if object.TypeID != cs2VolatileItemOfferSOTypeID {
					continue
				}
				if offer, ok := decodeCS2VolatileOffer(object.ObjectData); ok {
					update.VolatileOffers[offer.DefIndex] = domainVolatileOffers(offer)
				}
				continue
			}
			item, err := decodeCS2EconItem(object.ObjectData)
			if err != nil {
				return cs2IncrementalInventoryUpdate{}, true, err
			}
			update.Items = append(update.Items, item)
		}
		return update, len(update.Items) > 0 || len(update.VolatileOffers) > 0, nil
	default:
		return cs2IncrementalInventoryUpdate{}, false, nil
	}
}

func decodeCS2SubscribedTypes(types []cs2pb.SubscribedType) (cs2IncrementalInventoryUpdate, bool, error) {
	update := cs2IncrementalInventoryUpdate{Items: make([]GCInventoryItem, 0), VolatileOffers: make(map[uint32][]GCVolatileOffer)}
	found := false
	for _, objectType := range types {
		if objectType.TypeID != 1 {
			if objectType.TypeID != cs2VolatileItemOfferSOTypeID {
				continue
			}
			for _, objectData := range objectType.ObjectData {
				if offer, ok := decodeCS2VolatileOffer(objectData); ok {
					update.VolatileOffers[offer.DefIndex] = domainVolatileOffers(offer)
					found = true
				}
			}
			continue
		}
		found = true
		for _, objectData := range objectType.ObjectData {
			item, err := decodeCS2EconItem(objectData)
			if err != nil {
				return cs2IncrementalInventoryUpdate{}, true, err
			}
			update.Items = append(update.Items, item)
		}
	}
	return update, found, nil
}

func decodeCS2VolatileOffer(body []byte) (cs2pb.VolatileItemOffer, bool) {
	offer, err := cs2pb.DecodeVolatileItemOffer(body)
	if err != nil || offer.DefIndex == 0 || offer.DefIndex > 1_000_000 || len(offer.FauxItemIDs) == 0 {
		return cs2pb.VolatileItemOffer{}, false
	}
	return offer, true
}

func domainVolatileOffers(offer cs2pb.VolatileItemOffer) []GCVolatileOffer {
	result := make([]GCVolatileOffer, 0, len(offer.FauxItemIDs))
	for index, fauxItemID := range offer.FauxItemIDs {
		generationTime := uint32(0)
		if index < len(offer.GenerationTime) {
			generationTime = offer.GenerationTime[index]
		}
		result = append(result, GCVolatileOffer{FauxItemID: fauxItemID, GenerationTime: generationTime})
	}
	return result
}

func attachVolatileOffers(items []GCInventoryItem, offers map[uint32][]GCVolatileOffer) {
	for index := range items {
		if values := offers[items[index].DefIndex]; len(values) > 0 {
			items[index].VolatileOffers = append([]GCVolatileOffer(nil), values...)
		}
	}
}

func mergeInventoryItemMap(items []GCInventoryItem, additional map[uint64]GCInventoryItem) []GCInventoryItem {
	indexByID := make(map[uint64]int, len(items)+len(additional))
	for index := range items {
		indexByID[items[index].ID] = index
	}
	for id, item := range additional {
		if index, exists := indexByID[id]; exists {
			items[index] = item
			continue
		}
		indexByID[id] = len(items)
		items = append(items, item)
	}
	return items
}

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
	// SteamKit's protobuf GC client leaves the default job IDs unset. Proto2
	// getters still report UINT64_MAX, but the wire header is empty. Explicitly
	// serializing UINT64_MAX changes the header from 0 to 9 bytes and is not
	// byte-equivalent to the official/SteamKit GC envelope.
	headerBytes, err := proto.Marshal(&steampb.CMsgProtoBufHeader{})
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

func encodeGCProtoPayloadWithSourceJob(emsg uint32, body []byte, sourceJobID uint64) ([]byte, error) {
	headerBytes, err := proto.Marshal(&steampb.CMsgProtoBufHeader{JobidSource: proto.Uint64(sourceJobID)})
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
	welcome, err := cs2pb.DecodeClientWelcome(body)
	if err != nil {
		return nil, fmt.Errorf("failed to decode CS2 ClientWelcome: %w", err)
	}
	items := make([]GCInventoryItem, 0)
	volatileOffers := make(map[uint32][]GCVolatileOffer)
	var decodeErrors int
	for _, cache := range welcome.OutofdateSubscribedCaches {
		for _, objectType := range cache.Objects {
			if objectType.TypeID != 1 { // CSOEconItem is the authoritative owned-item SO type.
				if objectType.TypeID != cs2VolatileItemOfferSOTypeID {
					continue
				}
				for _, objectData := range objectType.ObjectData {
					if offer, ok := decodeCS2VolatileOffer(objectData); ok {
						volatileOffers[offer.DefIndex] = domainVolatileOffers(offer)
					}
				}
				continue
			}
			for _, objectData := range objectType.ObjectData {
				item, err := decodeCS2EconItem(objectData)
				if err != nil {
					decodeErrors++
					continue
				}
				items = append(items, item)
			}
		}
	}
	if len(items) == 0 && decodeErrors > 0 {
		return nil, fmt.Errorf("failed to decode CS2 econ items from SOCache: %d object decode errors", decodeErrors)
	}
	if len(items) == 0 {
		return nil, fmt.Errorf("CS2 ClientWelcome contained no decoded econ inventory items")
	}
	attachVolatileOffers(items, volatileOffers)
	return items, nil
}

func decodeCS2EconItem(body []byte) (GCInventoryItem, error) {
	econ, err := cs2pb.DecodeEconItem(body)
	if err != nil {
		return GCInventoryItem{}, fmt.Errorf("decode CS2 CSOEconItem: %w", err)
	}
	if econ.ID == 0 {
		return GCInventoryItem{}, fmt.Errorf("decoded CS2 CSOEconItem omitted id")
	}
	return GCInventoryItem{
		ID:             econ.ID,
		OriginalID:     econ.OriginalID,
		DefIndex:       econ.DefIndex,
		Quantity:       econ.Quantity,
		Quality:        econ.Quality,
		Rarity:         econ.Rarity,
		Inventory:      econ.Inventory,
		CustomName:     econ.CustomName,
		PaintKit:       econPaintKit(econ),
		PaintWear:      econPaintWear(econ),
		Attributes:     econAttributes(econ),
		AttributeBytes: econAttributeBytes(econ),
	}, nil
}

func econAttributes(item cs2pb.EconItem) map[uint32]uint32 {
	attributes := make(map[uint32]uint32)
	for _, attribute := range item.Attributes {
		value := attribute.Value
		if value == 0 && len(attribute.ValueBytes) >= 4 {
			value = binary.LittleEndian.Uint32(attribute.ValueBytes[:4])
		}
		attributes[attribute.DefIndex] = value
	}
	return attributes
}

func econAttributeBytes(item cs2pb.EconItem) map[uint32][]byte {
	attributes := make(map[uint32][]byte)
	for _, attribute := range item.Attributes {
		if len(attribute.ValueBytes) > 0 {
			attributes[attribute.DefIndex] = append([]byte(nil), attribute.ValueBytes...)
		}
	}
	return attributes
}

func econPaintKit(item cs2pb.EconItem) uint32 {
	for _, attribute := range item.Attributes {
		if attribute.DefIndex == 6 {
			value := attribute.Value
			if value == 0 && len(attribute.ValueBytes) >= 4 {
				value = binary.LittleEndian.Uint32(attribute.ValueBytes[:4])
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

func econPaintWear(item cs2pb.EconItem) *float64 {
	for _, attribute := range item.Attributes {
		if attribute.DefIndex != 8 {
			continue
		}
		var rawBits uint32
		if len(attribute.ValueBytes) >= 4 {
			rawBits = binary.LittleEndian.Uint32(attribute.ValueBytes[:4])
		} else {
			rawBits = attribute.Value
		}
		if rawBits != 0 {
			wear := float64(math.Float32frombits(rawBits))
			if wear >= 0.0 && wear <= 1.0 && !math.IsNaN(wear) {
				return &wear
			}
		}
	}
	return nil
}

func encodeGamesPlayedPacket(appID uint32) (*steammsg.Packet, error) {
	return encodeGamesPlayedPacketForApps([]uint32{appID})
}

func encodeGamesPlayedPacketForApps(appIDs []uint32) (*steammsg.Packet, error) {
	// Current SteamKit/ASF clients announce active apps with the data-blob EMsg.
	// The legacy ClientGamesPlayed (742) is accepted for basic presence but does
	// not establish the same client routing used by commerce messages such as
	// ClientMicroTxnAuthRequest (5504).
	header := steammsg.NewProtoHeader(steamlang.EMsg_ClientGamesPlayedWithDataBlob)
	// Match the SteamClient/Linux identity used by authentication and ClientLogon.
	// Leaving this absent makes the later game-session announcement disagree with
	// the CM session that owns it, which matters for messages routed to the active
	// game client (including microtransaction authorization handoffs).
	msg := &steampb.CMsgClientGamesPlayed{ClientOsType: proto.Uint32(uint32(steamClientOSType()))}
	seen := make(map[uint32]bool)
	for _, appID := range appIDs {
		if appID == 0 || seen[appID] {
			continue
		}
		seen[appID] = true
		msg.GamesPlayed = append(msg.GamesPlayed, &steampb.CMsgClientGamesPlayed_GamePlayed{GameId: proto.Uint64(steamAppGameID(appID))})
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
