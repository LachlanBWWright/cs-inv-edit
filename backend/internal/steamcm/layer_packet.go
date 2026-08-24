package steamcm

import (
	"bytes"
	"encoding/binary"
	"io"

	"cs-inv-edit/backend/internal/proto/steampb"
	"cs-inv-edit/backend/internal/steam"
	"cs-inv-edit/backend/internal/steamlang"
	"cs-inv-edit/backend/internal/steammsg"
)

type packetLayer struct{}

func NewPacketLayer() *packetLayer {
	return &packetLayer{}
}

func (layer *packetLayer) ProcessIncoming(events []Event) ([]Event, error) {
	processedEvents := make([]Event, 0)
	for _, event := range events {
		if event.Type != EventType_Incoming {
			processedEvents = append(processedEvents, event)
			continue
		}

		switch payload := event.Payload.(type) {
		case EventDataReceived:
			packet, err := steammsg.ParsePacket(payload.Data)
			if err != nil {
				return nil, err
			}

			if packet.MsgType() == steamlang.EMsg_Multi {
				_events, err := layer.handleMulti(packet)
				if err != nil {
					return nil, err
				}
				processedEvents = append(processedEvents, _events...)
			} else {
				processedEvents = append(
					processedEvents,
					event.WithPayload(EventPacketReceived{Packet: packet}),
				)
			}
		default:
			processedEvents = append(processedEvents, event)
		}
	}
	return processedEvents, nil
}

func (layer *packetLayer) ProcessOutgoing(events []Event) ([]Event, error) {
	processedEvents := make([]Event, 0)
	for _, event := range events {
		if event.Type != EventType_Outgoing {
			processedEvents = append(processedEvents, event)
			continue
		}

		switch payload := event.Payload.(type) {
		case EventPacketTosend:
			processedEvents = append(
				processedEvents,
				event.WithPayload(EventDataToSend{Data: payload.Packet.Bytes()}),
			)
		default:
			processedEvents = append(processedEvents, event)
		}
	}
	return processedEvents, nil
}

func (layer *packetLayer) handleMulti(packet *steammsg.Packet) ([]Event, error) {
	body := new(steampb.CMsgMulti)
	if _, err := steammsg.DecodePacket(packet, body); err != nil {
		return nil, err
	}

	payload := body.GetMessageBody()
	if body.GetSizeUnzipped() > 0 {
		uncompressed, err := steam.UncompressGzip(payload)
		if err != nil {
			return nil, err
		}
		payload = uncompressed
	}

	rd := bytes.NewReader(payload)

	events := make([]Event, 0)
	for rd.Len() > 0 {
		var pktLen uint32
		if err := binary.Read(rd, binary.LittleEndian, &pktLen); err != nil {
			return nil, err
		}
		pktData := make([]byte, pktLen)
		if _, err := io.ReadFull(rd, pktData); err != nil {
			return nil, err
		}

		packet, err := steammsg.ParsePacket(pktData)
		if err != nil {
			return nil, err
		}
		events = append(
			events,
			MakeEvent(EventType_Incoming, EventPacketReceived{Packet: packet}),
		)
	}
	return events, nil
}
