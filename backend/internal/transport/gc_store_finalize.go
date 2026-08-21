package transport

import (
	"context"
	"fmt"
	"log"

	"cs-inv-edit/backend/internal/proto/gametracking"
)

func (s *SteamGCClient) FinalizeStorePurchase(ctx context.Context, orderID uint64) ([]uint64, error) {
	return s.FinalizeGameStorePurchase(ctx, cs2AppID, orderID)
}

func (s *SteamGCClient) FinalizeGameStorePurchase(ctx context.Context, appID uint32, orderID uint64) ([]uint64, error) {
	if orderID == 0 {
		return nil, fmt.Errorf("store purchase order ID is required")
	}
	s.requestMu.Lock()
	defer s.requestMu.Unlock()
	s.mu.Lock()
	conn := s.conn
	s.mu.Unlock()
	if conn == nil {
		return nil, ErrNotConnected
	}
	body, err := gametracking.MarshalStorePurchaseFinalize(orderID)
	if err != nil {
		return nil, err
	}
	finalizeEMsg, responseEMsg := storeFinalizeMessageIDs(appID)
	envelope, err := encodeGCProtoPayloadWithSourceJob(finalizeEMsg, body, uint64(conn.GetNextJobId()))
	if err != nil {
		return nil, err
	}
	if err := s.sendStoreProtoWithEnvelope(ctx, conn, appID, finalizeEMsg, body, envelope); err != nil {
		return nil, err
	}
	for {
		select {
		case <-ctx.Done():
			return nil, fmt.Errorf("store purchase finalization response: %w", ctx.Err())
		case event := <-s.events:
			message, ok := event.Payload.(GCMessage)
			if event.Type != "gc.message" || !ok || message.AppID != appID || message.EMsg != responseEMsg {
				continue
			}
			response, err := gametracking.UnmarshalStorePurchaseFinalizeResponse(message.Body)
			if err != nil {
				return nil, err
			}
			if response.Result != 1 {
				return nil, fmt.Errorf("CS2 rejected store purchase finalization with result %d", response.Result)
			}
			return response.ItemIDs, nil
		}
	}
}

func storeFinalizeMessageIDs(appID uint32) (uint32, uint32) {
	if appID == 440 {
		return 2512, 2513
	}
	return emsgStorePurchaseFinalize, emsgStorePurchaseFinalizeResponse
}

func formatStorePurchaseEvent(event GCEvent) string {
	switch payload := event.Payload.(type) {
	case GCMessage:
		emsg := payload.EMsg &^ protoMask
		name := fmt.Sprintf("GC message %d", emsg)
		switch emsg {
		case emsgStorePurchaseInit:
			name = "CMsgGCStorePurchaseInit"
		case emsgStorePurchaseInitResponse:
			name = "CMsgGCStorePurchaseInitResponse"
		case emsgStorePurchaseFinalize:
			name = "CMsgGCStorePurchaseFinalize"
		case emsgStorePurchaseFinalizeResponse:
			name = "CMsgGCStorePurchaseFinalizeResponse"
		}
		if event.Type == "gc.message" {
			return fmt.Sprintf("RECV event=%s appid=%d emsg=%d (%s) protobuf=true body_bytes=%d", event.Type, payload.AppID, emsg, name, len(payload.Body))
		}
		return fmt.Sprintf("RECV event=%s appid=%d emsg=%d (%s) protobuf_envelope=%t body_bytes=%d", event.Type, payload.AppID, emsg, name, payload.EMsg&protoMask != 0, len(payload.Body))
	case []byte:
		return fmt.Sprintf("RECV event=%s binary_payload_bytes=%d (decoded in the following protocol entry)", event.Type, len(payload))
	default:
		return fmt.Sprintf("RECV event=%s payload_type=%T payload=%v", event.Type, event.Payload, event.Payload)
	}
}

func logStorePurchaseEvent(event GCEvent) {
	switch payload := event.Payload.(type) {
	case GCMessage:
		log.Printf("[store-purchase] received event=%s appid=%d emsg=%d steamid=%d gcname=%q body_bytes=%d", event.Type, payload.AppID, payload.EMsg, payload.SteamID, payload.GCName, len(payload.Body))
	case []byte:
		log.Printf("[store-purchase] received event=%s binary_payload_bytes=%d; structured decode follows", event.Type, len(payload))
	default:
		log.Printf("[store-purchase] received event=%s payload_type=%T payload=%v", event.Type, event.Payload, event.Payload)
	}
}
