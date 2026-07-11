package transport

import (
	"github.com/Lucino772/envelop/pkg/steam/steamcm"
	"github.com/Lucino772/envelop/pkg/steam/steamlang"
	"github.com/Lucino772/envelop/pkg/steam/steammsg"
	"github.com/Lucino772/envelop/pkg/steam/steampb"
)

type GCHandler struct {
	events chan<- GCEvent
}

func NewGCHandler(events chan<- GCEvent) *GCHandler {
	return &GCHandler{events: events}
}

func (h *GCHandler) Register(handlers map[steamlang.EMsg]func(*steammsg.Packet) ([]steamcm.Event, error)) {
	handlers[steamlang.EMsg_ClientLogOnResponse] = h.handleClientLogOnResponse
	handlers[steamlang.EMsg_ClientLoggedOff] = h.handleClientLoggedOff
	handlers[steamlang.EMsg_ClientServerUnavailable] = h.handleClientServerUnavailable
	handlers[steamlang.EMsg_ClientFromGC] = h.handleClientFromGC
	handlers[steamlang.EMsg_ClientGCMsgFailed] = h.handleClientGCMsgFailed
}

func (h *GCHandler) handleClientLogOnResponse(packet *steammsg.Packet) ([]steamcm.Event, error) {
	if !packet.IsProto() {
		return nil, nil
	}
	body := new(steampb.CMsgClientLogonResponse)
	if _, err := steammsg.DecodePacket(packet, body); err != nil {
		return nil, err
	}
	if h.events != nil {
		h.events <- GCEvent{Type: "steam.logon_response", Payload: body}
	}
	return []steamcm.Event{steamcm.MakeEvent(steamcm.EventType_Incoming, steamcm.EventPacketReceived{Packet: packet})}, nil
}

func (h *GCHandler) handleClientLoggedOff(packet *steammsg.Packet) ([]steamcm.Event, error) {
	if !packet.IsProto() {
		return nil, nil
	}
	body := new(steampb.CMsgClientLoggedOff)
	if _, err := steammsg.DecodePacket(packet, body); err != nil {
		return nil, err
	}
	if h.events != nil {
		h.events <- GCEvent{Type: "steam.logged_off", Payload: body}
	}
	return []steamcm.Event{steamcm.MakeEvent(steamcm.EventType_Incoming, steamcm.EventPacketReceived{Packet: packet})}, nil
}

func (h *GCHandler) handleClientServerUnavailable(packet *steammsg.Packet) ([]steamcm.Event, error) {
	if h.events != nil {
		h.events <- GCEvent{Type: "steam.server_unavailable", Payload: packet.MsgType().String()}
	}
	return []steamcm.Event{steamcm.MakeEvent(steamcm.EventType_Incoming, steamcm.EventPacketReceived{Packet: packet})}, nil
}

func (h *GCHandler) handleClientFromGC(packet *steammsg.Packet) ([]steamcm.Event, error) {
	if !packet.IsProto() {
		return nil, nil
	}
	body := new(steampb.CMsgGCClient)
	if _, err := steammsg.DecodePacket(packet, body); err != nil {
		return nil, err
	}
	if h.events != nil {
		message := GCMessage{
			AppID:   body.GetAppid(),
			EMsg:    body.GetMsgtype(),
			Body:    append([]byte(nil), body.GetPayload()...),
			SteamID: body.GetSteamid(),
			GCName:  body.GetGcname(),
		}
		if decoded, err := decodeGCProtoPayload(message); err == nil {
			message.EMsg = decoded.EMsg
			message.Body = decoded.Body
		}
		h.events <- GCEvent{
			Type:    "gc.message",
			Payload: message,
		}
	}
	return []steamcm.Event{steamcm.MakeEvent(steamcm.EventType_Incoming, steamcm.EventPacketReceived{Packet: packet})}, nil
}

func (h *GCHandler) handleClientGCMsgFailed(packet *steammsg.Packet) ([]steamcm.Event, error) {
	if h.events != nil {
		h.events <- GCEvent{Type: "gc.failed", Payload: packet.MsgType()}
	}
	return []steamcm.Event{steamcm.MakeEvent(steamcm.EventType_Incoming, steamcm.EventPacketReceived{Packet: packet})}, nil
}

type GCMessage struct {
	AppID   uint32
	EMsg    uint32
	Body    []byte
	SteamID uint64
	GCName  string
}

type gcProtoMessage struct {
	EMsg uint32
	Body []byte
}
