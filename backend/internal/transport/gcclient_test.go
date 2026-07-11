package transport

import (
	"bytes"
	"errors"
	"testing"

	"cs-inv-edit/backend/internal/protocol"
	"github.com/Lucino772/envelop/pkg/steam/steamlang"
	"github.com/Lucino772/envelop/pkg/steam/steammsg"
	"github.com/Lucino772/envelop/pkg/steam/steampb"
	"google.golang.org/protobuf/proto"
)

func TestEncodeGCClientPacketWrapsPayload(t *testing.T) {
	inner := []byte{0x01, 0x02, 0x03}
	packet, err := encodeGCClientPacket(protocol.AppIDCS2, protocol.EMsgSetItemName, inner, false)
	if err != nil {
		t.Fatalf("encodeGCClientPacket returned error: %v", err)
	}
	if packet.MsgType() != steamlang.EMsg_ClientToGC {
		t.Fatalf("expected ClientToGC packet, got %v", packet.MsgType())
	}
	if !packet.IsProto() {
		t.Fatalf("expected protobuf Steam packet")
	}
	header, ok := packet.Header().(*steammsg.ProtoHeader)
	if !ok {
		t.Fatalf("expected ProtoHeader, got %T", packet.Header())
	}
	if got := header.Proto.GetRoutingAppid(); got != protocol.AppIDCS2 {
		t.Fatalf("expected routing appid 730, got %d", got)
	}
	var body steampb.CMsgGCClient
	if _, err := steammsg.DecodePacket(packet, &body); err != nil {
		t.Fatalf("failed to decode CMsgGCClient: %v", err)
	}
	if body.GetAppid() != 730 {
		t.Fatalf("expected appid 730, got %d", body.GetAppid())
	}
	if body.GetMsgtype() != 1006 {
		t.Fatalf("expected gc msgtype 1006, got %d", body.GetMsgtype())
	}
	if !bytes.Equal(body.GetPayload(), inner) {
		t.Fatalf("payload mismatch: %v", body.GetPayload())
	}
	inner[0] = 0xff
	payload := body.GetPayload()
	if len(payload) == 0 {
		t.Fatalf("expected decoded payload")
	}
	if payload[0] == 0xff {
		t.Fatalf("expected payload to be copied")
	}
}

func TestEncodeGamesPlayedPacketAdvertisesCS2(t *testing.T) {
	packet, err := encodeGamesPlayedPacket(730)
	if err != nil {
		t.Fatalf("encodeGamesPlayedPacket returned error: %v", err)
	}
	if packet.MsgType() != steamlang.EMsg_ClientGamesPlayed {
		t.Fatalf("expected ClientGamesPlayed packet, got %v", packet.MsgType())
	}
	var body steampb.CMsgClientGamesPlayed
	if _, err := steammsg.DecodePacket(packet, &body); err != nil {
		t.Fatalf("failed to decode CMsgClientGamesPlayed: %v", err)
	}
	if len(body.GetGamesPlayed()) != 1 {
		t.Fatalf("expected one game, got %d", len(body.GetGamesPlayed()))
	}
	game := body.GetGamesPlayed()[0]
	if game.GetGameId() != 730 {
		t.Fatalf("expected CS2 app id 730, got %d", game.GetGameId())
	}
	if game.GetGameExtraInfo() != "Counter-Strike 2" {
		t.Fatalf("unexpected game extra info %q", game.GetGameExtraInfo())
	}
}

func TestGCHandlerDecodesClientFromGC(t *testing.T) {
	events := make(chan GCEvent, 1)
	handler := NewGCHandler(events)
	header := steammsg.NewProtoHeader(steamlang.EMsg_ClientFromGC)
	header.Proto.RoutingAppid = proto.Uint32(protocol.AppIDCS2)
	packet, err := steammsg.EncodePacket(header, &steampb.CMsgGCClient{
		Appid:   proto.Uint32(protocol.AppIDCS2),
		Msgtype: proto.Uint32(protocol.EMsgGCClientWelcome),
		Payload: []byte{0x09},
		Steamid: proto.Uint64(76561198000000000),
		Gcname:  proto.String("CS2"),
	}, nil)
	if err != nil {
		t.Fatalf("failed to build ClientFromGC packet: %v", err)
	}
	if _, err := handler.handleClientFromGC(packet); err != nil {
		t.Fatalf("handleClientFromGC returned error: %v", err)
	}
	event := <-events
	if event.Type != "gc.message" {
		t.Fatalf("expected gc.message event, got %q", event.Type)
	}
	message, ok := event.Payload.(GCMessage)
	if !ok {
		t.Fatalf("expected GCMessage payload, got %T", event.Payload)
	}
	if message.AppID != protocol.AppIDCS2 || message.EMsg != protocol.EMsgGCClientWelcome || message.SteamID != 76561198000000000 || message.GCName != "CS2" {
		t.Fatalf("unexpected decoded message: %+v", message)
	}
	if !bytes.Equal(message.Body, []byte{0x09}) {
		t.Fatalf("unexpected message body: %v", message.Body)
	}
}

func TestSteamGCClientSendToGCRequiresConnection(t *testing.T) {
	client := NewSteamGCClient()
	if err := client.SendToGC(t.Context(), 730, 1006, []byte{1}); !errors.Is(err, ErrNotConnected) {
		t.Fatalf("expected ErrNotConnected, got %v", err)
	}
	if err := client.SendGamesPlayed(t.Context(), 730); !errors.Is(err, ErrNotConnected) {
		t.Fatalf("expected ErrNotConnected, got %v", err)
	}
}
