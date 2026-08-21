package transport

import (
	"context"
	"fmt"

	"github.com/Lucino772/envelop/pkg/steam/steamlang"
	"github.com/Lucino772/envelop/pkg/steam/steammsg"
	"github.com/Lucino772/envelop/pkg/steam/steampb"
	"google.golang.org/protobuf/proto"
)

func (s *SteamGCClient) RequestSteamInventoryService(ctx context.Context, appID uint32, steamID uint64) (SteamInventoryServiceResponse, error) {
	if appID == 0 {
		return SteamInventoryServiceResponse{}, fmt.Errorf("Steam Inventory Service AppID must be greater than zero")
	}
	if steamID == 0 {
		return SteamInventoryServiceResponse{}, fmt.Errorf("SteamID must be greater than zero")
	}
	if err := s.ensureSteamSession(ctx); err != nil {
		return SteamInventoryServiceResponse{}, fmt.Errorf("Steam session recovery failed: %w", err)
	}
	s.mu.Lock()
	conn := s.conn
	s.mu.Unlock()
	if conn == nil {
		return SteamInventoryServiceResponse{}, ErrNotConnected
	}
	handler := newNonAuthedUnifiedHandler()
	response, err := handler.SendAuthedMessageForApp(ctx, conn, appID, "Inventory.GetInventory#1", &steampb.CInventory_GetInventory_Request{
		Appid:   proto.Uint32(appID),
		Steamid: proto.Uint64(steamID),
	})
	if err != nil {
		return SteamInventoryServiceResponse{}, fmt.Errorf("Inventory.GetInventory request failed: %w", err)
	}
	if response.Result != steamlang.EResult_OK {
		return SteamInventoryServiceResponse{}, steamResultError{method: "Inventory.GetInventory#1", result: response.Result}
	}
	var decoded steampb.CInventory_Response
	if _, err := steammsg.DecodePacket(response.Packet, &decoded); err != nil {
		return SteamInventoryServiceResponse{}, fmt.Errorf("decode Inventory.GetInventory response: %w", err)
	}
	return SteamInventoryServiceResponse{
		ETag:           decoded.GetEtag(),
		RemovedItemIDs: append([]uint64(nil), decoded.GetRemoveditemids()...),
		ItemJSON:       decoded.GetItemJson(),
		ItemDefJSON:    decoded.GetItemdefJson(),
		Replayed:       decoded.GetReplayed(),
	}, nil
}
