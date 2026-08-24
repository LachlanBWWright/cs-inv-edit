package steamcm

// wireLayer selects the framing used by the physical CM transport. TCP CM
// connections carry an eight-byte envelope; WebSocket CM connections carry
// the encrypted Steam message bytes directly in binary frames.
type wireLayer struct {
	tcp       *tcpLayer
	websocket bool
}

func NewWireLayer() *wireLayer {
	return &wireLayer{tcp: NewTCPLayer()}
}

func (layer *wireLayer) SetWebSocket(enabled bool) {
	layer.websocket = enabled
}

func (layer *wireLayer) ProcessIncoming(events []Event) ([]Event, error) {
	if layer.websocket {
		return events, nil
	}
	return layer.tcp.ProcessIncoming(events)
}

func (layer *wireLayer) ProcessOutgoing(events []Event) ([]Event, error) {
	if layer.websocket {
		return events, nil
	}
	return layer.tcp.ProcessOutgoing(events)
}
