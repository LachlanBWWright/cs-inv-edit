package transport

import (
	"bytes"
	"fmt"
	"github.com/Lucino772/envelop/pkg/steam/steamcm"
	"github.com/Lucino772/envelop/pkg/steam/steamlang"
	"github.com/Lucino772/envelop/pkg/steam/steammsg"
	"github.com/Lucino772/envelop/pkg/steam/steampb"
	"io"
	"log"
	"sync/atomic"
)

type GCHandler struct {
	events           chan<- GCEvent
	steamTraceActive *atomic.Bool
	protocolTrace    func(*steammsg.Packet)
	gcProtocolTrace  func(string, uint32, uint32, []byte)
	sessionEnded     func(string)
}

func NewGCHandler(events chan<- GCEvent, options ...any) *GCHandler {
	handler := &GCHandler{events: events}
	for _, option := range options {
		switch typed := option.(type) {
		case *atomic.Bool:
			handler.steamTraceActive = typed
		case func(*steammsg.Packet):
			handler.protocolTrace = typed
		case func(string, uint32, uint32, []byte):
			handler.gcProtocolTrace = typed
		case func(string):
			handler.sessionEnded = typed
		}
	}
	return handler
}

func (h *GCHandler) Register(handlers map[steamlang.EMsg]func(*steammsg.Packet) ([]steamcm.Event, error)) {
	handlers[steamlang.EMsg_ClientLogOnResponse] = h.handleClientLogOnResponse
	handlers[steamlang.EMsg_ClientLoggedOff] = h.handleClientLoggedOff
	handlers[steamlang.EMsg_ClientServerUnavailable] = h.handleClientServerUnavailable
	handlers[steamlang.EMsg_ClientFromGC] = h.handleClientFromGC
	handlers[steamlang.EMsg_ClientGCMsgFailed] = h.handleClientGCMsgFailed
	handlers[steamlang.EMsg_ClientMicroTxnAuthRequest] = h.handleClientMicroTxnAuthRequest

	// The dependency dispatcher has no wildcard hook. Wrap every registered
	// handler and install trace-only fallbacks across the current EMsg range so
	// a purchase can prove which raw Steam message types reached this CM session.
	for value := 0; value <= 10000; value++ {
		emsg := steamlang.EMsg(value)
		next := handlers[emsg]
		handlers[emsg] = func(packet *steammsg.Packet) ([]steamcm.Event, error) {
			if h.protocolTrace != nil {
				h.protocolTrace(packet)
			}
			if h.steamTraceActive != nil && h.steamTraceActive.Load() && h.events != nil {
				h.events <- GCEvent{Type: "steam.packet", Payload: fmt.Sprintf("emsg=%d name=%s proto=%t", packet.MsgType(), packet.MsgType().String(), packet.IsProto())}
			}
			if next != nil {
				return next(packet)
			}
			return []steamcm.Event{steamcm.MakeEvent(steamcm.EventType_Incoming, steamcm.EventPacketReceived{Packet: packet})}, nil
		}
	}
}

type rawSteamBody struct{ data []byte }

func (b *rawSteamBody) ReadFrom(r io.Reader) (int64, error) {
	data, err := io.ReadAll(r)
	b.data = append([]byte(nil), data...)
	return int64(len(data)), err
}

func (h *GCHandler) handleClientMicroTxnAuthRequest(packet *steammsg.Packet) ([]steamcm.Event, error) {
	log.Printf("[store-purchase] received Steam packet emsg=%d name=%s proto=%t", packet.MsgType(), packet.MsgType().String(), packet.IsProto())
	if h.events != nil {
		h.events <- GCEvent{Type: "steam.microtxn_packet", Payload: fmt.Sprintf("proto=%t", packet.IsProto())}
	}
	var body rawSteamBody
	if _, err := steammsg.DecodePacket(packet, &body); err != nil {
		log.Printf("[store-purchase] Steam emsg=5504 packet decode failed error=%v", err)
		return nil, err
	}
	log.Printf("[store-purchase] received Steam emsg=5504 body_bytes=%d body_hex=%x", len(body.data), body.data)
	if h.events != nil {
		h.events <- GCEvent{Type: "steam.microtxn_authorization", Payload: bytes.Clone(body.data)}
	}
	return []steamcm.Event{steamcm.MakeEvent(steamcm.EventType_Incoming, steamcm.EventPacketReceived{Packet: packet})}, nil
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
		steamID := uint64(0)
		if header, ok := packet.Header().(*steammsg.ProtoHeader); ok && header.Proto != nil {
			steamID = header.Proto.GetSteamid()
		}
		h.events <- GCEvent{Type: "steam.logon_response", Payload: steamLogonResponse{Body: body, SteamID: steamID}}
	}
	return []steamcm.Event{steamcm.MakeEvent(steamcm.EventType_Incoming, steamcm.EventPacketReceived{Packet: packet})}, nil
}

type steamLogonResponse struct {
	Body    *steampb.CMsgClientLogonResponse
	SteamID uint64
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
	if h.sessionEnded != nil {
		h.sessionEnded("steam.logged_off")
	}
	return []steamcm.Event{steamcm.MakeEvent(steamcm.EventType_Incoming, steamcm.EventPacketReceived{Packet: packet})}, nil
}

func (h *GCHandler) handleClientServerUnavailable(packet *steammsg.Packet) ([]steamcm.Event, error) {
	if h.events != nil {
		h.events <- GCEvent{Type: "steam.server_unavailable", Payload: packet.MsgType().String()}
	}
	if h.sessionEnded != nil {
		h.sessionEnded("steam.server_unavailable")
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
		if h.gcProtocolTrace != nil {
			h.gcProtocolTrace("received", message.AppID, message.EMsg, message.Body)
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
