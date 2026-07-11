package transport

import (
	"context"
	"encoding/binary"
	"fmt"
	"math"
	"time"

	"cs-inv-edit/backend/internal/proto/generated"
	"cs-inv-edit/backend/internal/protocol"
	"github.com/Lucino772/envelop/pkg/steam"
	"github.com/Lucino772/envelop/pkg/steam/steamlang"
	"github.com/Lucino772/envelop/pkg/steam/steammsg"
	"github.com/Lucino772/envelop/pkg/steam/steampb"
	"google.golang.org/protobuf/proto"
)

func (s *SteamGCClient) SendGamesPlayed(_ context.Context, appID uint32) error {
	s.mu.Lock()
	conn := s.conn
	s.mu.Unlock()
	if conn == nil {
		return ErrNotConnected
	}
	packet, err := encodeGamesPlayedPacket(appID)
	if err != nil {
		return err
	}
	if err := conn.SendPacket(packet); err != nil {
		return err
	}
	s.events <- GCEvent{Type: "steam.games_played.sent", Payload: fmt.Sprintf("emsg=%s appid=%d gameid=%d", steamlang.EMsg_ClientGamesPlayed.String(), appID, steamAppGameID(appID))}
	return nil
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
			return attribute.GetValue()
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
	if appID == 0 {
		return nil, fmt.Errorf("app id is required")
	}
	header := steammsg.NewProtoHeader(steamlang.EMsg_ClientGamesPlayed)
	msg := &steampb.CMsgClientGamesPlayed{
		GamesPlayed: []*steampb.CMsgClientGamesPlayed_GamePlayed{
			{
				GameId:        proto.Uint64(steamAppGameID(appID)),
				GameExtraInfo: proto.String("Counter-Strike 2"),
			},
		},
	}
	return steammsg.EncodePacket(header, msg, nil)
}

func steamAppGameID(appID uint32) uint64 {
	gameID := steam.GameId(0)
	gameID.SetAppId(appID)
	gameID.SetAppType(steam.GameType_App)
	return uint64(gameID)
}
