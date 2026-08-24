package steamcm

import (
	"bytes"
	"encoding/binary"
	"errors"
	"io"
)

const (
	tcpConnectionMagic uint32 = 0x31305456
)

type tcpLayer struct {
	rbuff bytes.Buffer
}

func NewTCPLayer() *tcpLayer {
	return &tcpLayer{}
}

func (layer *tcpLayer) ProcessIncoming(events []Event) ([]Event, error) {
	processedEvents := make([]Event, 0)
	for _, event := range events {
		if event.Type != EventType_Incoming {
			processedEvents = append(processedEvents, event)
			continue
		}

		switch payload := event.Payload.(type) {
		case EventDataReceived:
			_events, err := layer.handleIncomingData(payload.Data)
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

func (layer *tcpLayer) ProcessOutgoing(events []Event) ([]Event, error) {
	processedEvents := make([]Event, 0)
	for _, event := range events {
		if event.Type != EventType_Outgoing {
			processedEvents = append(processedEvents, event)
			continue
		}

		switch payload := event.Payload.(type) {
		case EventDataToSend:
			_events, err := layer.handleOutgoingData(payload.Data)
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

func (layer *tcpLayer) handleIncomingData(data []byte) ([]Event, error) {
	if _, err := layer.rbuff.Write(data); err != nil {
		return nil, err
	}

	events := make([]Event, 0)
	for {
		packet, err := layer.tryRead()
		if err != nil {
			if errors.Is(err, io.ErrUnexpectedEOF) {
				return events, nil
			}
			return nil, err
		}
		events = append(
			events,
			MakeEvent(EventType_Incoming, EventDataReceived{Data: packet}),
		)
	}
}

func (layer *tcpLayer) handleOutgoingData(data []byte) ([]Event, error) {
	var buff bytes.Buffer
	if err := binary.Write(&buff, binary.LittleEndian, uint32(len(data))); err != nil {
		return nil, err
	}
	if err := binary.Write(&buff, binary.LittleEndian, tcpConnectionMagic); err != nil {
		return nil, err
	}
	if _, err := buff.Write(data); err != nil {
		return nil, err
	}
	return []Event{
		MakeEvent(EventType_Outgoing, EventDataToSend{Data: buff.Bytes()}),
	}, nil
}

func (layer *tcpLayer) tryRead() ([]byte, error) {
	// Check that there is at least enough data
	if layer.rbuff.Len() < 8 {
		return nil, io.ErrUnexpectedEOF
	}

	// Peek at packet len and check that there is enough data
	pktLen := binary.LittleEndian.Uint32(layer.rbuff.Bytes()[:4])
	if layer.rbuff.Len() < int(pktLen)+8 {
		return nil, io.ErrUnexpectedEOF
	}

	// Read the entire packet
	pktData := make([]byte, pktLen+8)
	if _, err := io.ReadFull(&layer.rbuff, pktData); err != nil {
		// If there is still not enough data, consider this as a EOF error. This should
		// not be possible but just in case we make sure the error is different.
		if errors.Is(err, io.ErrUnexpectedEOF) {
			return nil, io.EOF
		}
		return nil, err
	}

	pktMagic := binary.LittleEndian.Uint32(pktData[4:8])
	if pktMagic != tcpConnectionMagic {
		return nil, errors.New("invalid packet magic")
	}

	return pktData[8:], nil
}
