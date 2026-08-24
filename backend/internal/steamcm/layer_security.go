package steamcm

import "cs-inv-edit/backend/internal/steamlang"

// securityLayer keeps the native TCP channel-encryption handshake while
// allowing WebSocket CM connections to rely on their TLS transport.
type securityLayer struct {
	encrypted *encryptedLayer
	websocket bool
}

func NewSecurityLayer(universe steamlang.EUniverse) *securityLayer {
	return &securityLayer{encrypted: NewEncryptedLayer(universe)}
}

func (layer *securityLayer) SetWebSocket(enabled bool) {
	layer.websocket = enabled
}

func (layer *securityLayer) ProcessIncoming(events []Event) ([]Event, error) {
	if layer.websocket {
		return events, nil
	}
	return layer.encrypted.ProcessIncoming(events)
}

func (layer *securityLayer) ProcessOutgoing(events []Event) ([]Event, error) {
	if layer.websocket {
		return events, nil
	}
	return layer.encrypted.ProcessOutgoing(events)
}
