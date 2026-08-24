package steamcm

import (
	"cs-inv-edit/backend/internal/proto/steampb"
	"cs-inv-edit/backend/internal/steam"
	"cs-inv-edit/backend/internal/steamlang"
	"cs-inv-edit/backend/internal/steammsg"
)

type sessionLayer struct {
	steamId   *steam.SteamId
	sessionId *int32
}

func NewSessionLayer() *sessionLayer {
	return &sessionLayer{
		steamId:   nil,
		sessionId: nil,
	}
}

func (layer *sessionLayer) ProcessIncoming(events []Event) ([]Event, error) {
	processedEvents := make([]Event, 0)
	for _, event := range events {
		if event.Type != EventType_Incoming {
			processedEvents = append(processedEvents, event)
			continue
		}

		switch payload := event.Payload.(type) {
		case EventPacketReceived:
			_events, err := layer.handleIncomingPacket(payload.Packet)
			if err != nil {
				return nil, err
			}
			processedEvents = append(processedEvents, _events...)
		default:
			processedEvents = append(processedEvents, event)
		}
	}
	return processedEvents, nil
}

func (layer *sessionLayer) ProcessOutgoing(events []Event) ([]Event, error) {
	processedEvents := make([]Event, 0)
	for _, event := range events {
		if event.Type != EventType_Outgoing {
			processedEvents = append(processedEvents, event)
			continue
		}

		switch payload := event.Payload.(type) {
		case EventPacketTosend:
			packet := payload.Packet
			if layer.steamId != nil {
				packet.Header().SetSteamId(layer.steamId)
			}
			if layer.sessionId != nil {
				packet.Header().SetSessionId(layer.sessionId)
			}
			processedEvents = append(
				processedEvents,
				event.WithPayload(EventPacketTosend{Packet: packet}),
			)
		default:
			processedEvents = append(processedEvents, event)
		}
	}
	return processedEvents, nil
}

func (layer *sessionLayer) handleIncomingPacket(packet *steammsg.Packet) ([]Event, error) {
	events := make([]Event, 0)

	switch packet.MsgType() {
	case steamlang.EMsg_ClientLogOnResponse:
		if !packet.IsProto() {
			return nil, nil
		}
		body := new(steampb.CMsgClientLogonResponse)
		if _, err := steammsg.DecodePacket(packet, body); err != nil {
			return nil, err
		}
		if body.GetEresult() == int32(steamlang.EResult_OK) {
			layer.steamId = packet.Header().GetSteamId()
			layer.sessionId = packet.Header().GetSessionId()
		} else {
			layer.steamId = nil
			layer.sessionId = nil
		}
	case steamlang.EMsg_ClientLoggedOff:
		layer.steamId = nil
		layer.sessionId = nil
		if !packet.IsProto() {
			return nil, nil
		}
		body := new(steampb.CMsgClientLoggedOff)
		if _, err := steammsg.DecodePacket(packet, body); err != nil {
			return nil, err
		}
	}

	events = append(
		events,
		MakeEvent(EventType_Incoming, EventPacketReceived{Packet: packet}),
	)
	return events, nil
}
