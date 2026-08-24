package steamcm

import (
	"cs-inv-edit/backend/internal/steamlang"
	"cs-inv-edit/backend/internal/steammsg"
)

type dispatchLayer struct {
	dispatchMap map[steamlang.EMsg]func(*steammsg.Packet) ([]Event, error)
}

func NewDispatchLayer(dispatchMap map[steamlang.EMsg]func(*steammsg.Packet) ([]Event, error)) *dispatchLayer {
	return &dispatchLayer{dispatchMap: dispatchMap}
}

func (layer *dispatchLayer) ProcessIncoming(events []Event) ([]Event, error) {
	processedEvents := make([]Event, 0)
	for _, event := range events {
		if event.Type != EventType_Incoming {
			processedEvents = append(processedEvents, event)
			continue
		}

		switch payload := event.Payload.(type) {
		case EventPacketReceived:
			if handler, ok := layer.dispatchMap[payload.Packet.MsgType()]; ok {
				_events, err := handler(payload.Packet)
				if err != nil {
					return nil, err
				}
				processedEvents = append(processedEvents, _events...)
			} else {
				processedEvents = append(processedEvents, event)
			}
		default:
			processedEvents = append(processedEvents, event)
		}
	}
	return processedEvents, nil
}

func (layer *dispatchLayer) ProcessOutgoing(events []Event) ([]Event, error) {
	return events, nil
}
