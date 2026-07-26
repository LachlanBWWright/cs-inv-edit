package transport

import (
	"context"
	"fmt"

	"github.com/Lucino772/envelop/pkg/steam/steamlang"
	"github.com/Lucino772/envelop/pkg/steam/steammsg"
	"github.com/Lucino772/envelop/pkg/steam/steampb"
	"google.golang.org/protobuf/proto"
)

func (s *SteamGCClient) RequestOwnedGames(ctx context.Context, steamID uint64) ([]SteamOwnedGame, error) {
	if steamID == 0 {
		return nil, fmt.Errorf("SteamID must be greater than zero")
	}
	if err := s.ensureSteamSession(ctx); err != nil {
		return nil, fmt.Errorf("Steam session recovery failed: %w", err)
	}
	s.mu.Lock()
	conn := s.conn
	s.mu.Unlock()
	if conn == nil {
		return nil, ErrNotConnected
	}
	handler := newNonAuthedUnifiedHandler()
	response, err := handler.SendAuthedMessage(ctx, conn, "Player.GetOwnedGames#1", &steampb.CPlayer_GetOwnedGames_Request{
		Steamid:                proto.Uint64(steamID),
		IncludeAppinfo:         proto.Bool(true),
		IncludePlayedFreeGames: proto.Bool(true),
		IncludeFreeSub:         proto.Bool(true),
		SkipUnvettedApps:       proto.Bool(false),
		Language:               proto.String("english"),
		IncludeExtendedAppinfo: proto.Bool(true),
	})
	if err != nil {
		return nil, fmt.Errorf("Player.GetOwnedGames request failed: %w", err)
	}
	if response.Result != steamlang.EResult_OK {
		return nil, steamResultError{method: "Player.GetOwnedGames#1", result: response.Result}
	}
	var decoded steampb.CPlayer_GetOwnedGames_Response
	if _, err := steammsg.DecodePacket(response.Packet, &decoded); err != nil {
		return nil, fmt.Errorf("decode Player.GetOwnedGames response: %w", err)
	}
	games := make([]SteamOwnedGame, 0, len(decoded.GetGames()))
	for _, game := range decoded.GetGames() {
		if game.GetAppid() <= 0 {
			continue
		}
		playtime := game.GetPlaytimeForever()
		if playtime < 0 {
			playtime = 0
		}
		games = append(games, SteamOwnedGame{
			AppID:           uint32(game.GetAppid()),
			Name:            game.GetName(),
			PlaytimeForever: uint32(playtime),
			LastPlayed:      game.GetRtimeLastPlayed(),
			HasMarket:       game.GetHasMarket(),
		})
	}
	return games, nil
}
