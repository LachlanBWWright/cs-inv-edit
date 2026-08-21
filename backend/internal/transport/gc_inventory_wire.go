package transport

import (
	"encoding/binary"
	"fmt"
	"math"
	"time"

	cs2pb "cs-inv-edit/backend/internal/proto/gametracking"
	"github.com/Lucino772/envelop/pkg/steam"
	"github.com/Lucino772/envelop/pkg/steam/steamlang"
	"github.com/Lucino772/envelop/pkg/steam/steammsg"
	"github.com/Lucino772/envelop/pkg/steam/steampb"
	"google.golang.org/protobuf/proto"
)

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
