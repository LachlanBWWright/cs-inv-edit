package transport

import (
	"context"
	"fmt"

	"cs-inv-edit/backend/internal/protocol"
)

func (s *SteamGCClient) WaitForCS2CraftResponse(ctx context.Context) (protocol.CraftResponse, error) {
	for {
		select {
		case <-ctx.Done():
			return protocol.CraftResponse{}, fmt.Errorf("wait for CS2 craft response: %w", ctx.Err())
		case event := <-s.events:
			message, ok := event.Payload.(GCMessage)
			if !ok || event.Type != "gc.message" || message.AppID != protocol.AppIDCS2 || message.EMsg != protocol.EMsgCraftResponse {
				continue
			}
			response, err := protocol.DecodeCraftResponse(message.Body)
			if err != nil {
				return protocol.CraftResponse{}, fmt.Errorf("decode CS2 craft response: %w", err)
			}
			return response, nil
		}
	}
}
