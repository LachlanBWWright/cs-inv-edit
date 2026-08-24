package steamcm

import (
	"log"
	"math"
	"time"

	"cs-inv-edit/backend/internal/proto/steampb"
	"cs-inv-edit/backend/internal/steam"
	"cs-inv-edit/backend/internal/steamlang"
	"cs-inv-edit/backend/internal/steammsg"
	"google.golang.org/protobuf/proto"
)

type SteamUserHandler struct{}

func NewUserHandler() *SteamUserHandler {
	return &SteamUserHandler{}
}

func (handler *SteamUserHandler) Register(handlers map[steamlang.EMsg]func(*steammsg.Packet) ([]Event, error)) {
	handlers[steamlang.EMsg_ClientLogOnResponse] = handler.handleClientLogOnresponse
	handlers[steamlang.EMsg_ClientSessionToken] = handler.handleClientSessionToken
}

func (handler *SteamUserHandler) LogInAnonymously(conn Connection) (*steampb.CMsgClientLogonResponse, error) {
	audId := steam.NewInstanceSteamId(0, steam.Instance_All, steamlang.EUniverse_Public, steamlang.EAccountType_AnonUser)
	header := steammsg.NewProtoHeader(steamlang.EMsg_ClientLogon)
	header.Proto.ClientSessionid = proto.Int32(0)
	header.Proto.Steamid = proto.Uint64(uint64(audId))
	body := &steampb.CMsgClientLogon{
		ProtocolVersion: proto.Uint32(65580),
		ClientOsType:    proto.Uint32(20),
		ClientLanguage:  proto.String("english"),
		CellId:          proto.Uint32(0),
	}
	packet, err := steammsg.EncodePacket(header, body, nil)
	if err != nil {
		return nil, err
	}
	if err := conn.SendPacket(packet); err != nil {
		return nil, err
	}

	return waitForJob[*steampb.CMsgClientLogonResponse](conn, math.MaxUint64, time.Second*30)
}

func (handler *SteamUserHandler) handleClientLogOnresponse(packet *steammsg.Packet) ([]Event, error) {
	if !packet.IsProto() {
		return nil, nil
	}

	body := new(steampb.CMsgClientLogonResponse)
	if _, err := steammsg.DecodePacket(packet, body); err != nil {
		return nil, err
	}
	return []Event{
		MakeEvent(EventType_State, EventCallback{
			JobId:   steam.JobId(packet.Header().GetTargetJobId()),
			Payload: body,
		}),
	}, nil
}

func (handler *SteamUserHandler) handleClientSessionToken(packet *steammsg.Packet) ([]Event, error) {
	body := new(steampb.CMsgClientSessionToken)
	if _, err := steammsg.DecodePacket(packet, body); err != nil {
		return nil, err
	}
	log.Println("Session Token:", body)
	return nil, nil
}
