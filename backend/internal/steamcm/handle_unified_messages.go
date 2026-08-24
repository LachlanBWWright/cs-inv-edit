package steamcm

import (
	"errors"
	"time"

	"cs-inv-edit/backend/internal/steam"
	"cs-inv-edit/backend/internal/steamlang"
	"cs-inv-edit/backend/internal/steammsg"
	"google.golang.org/protobuf/proto"
)

type SteamUnifiedMessageHandler struct{}

type steamUnifiedMessageResponse struct {
	Result     steamlang.EResult
	MethodName string
	Packet     *steammsg.Packet
}

func NewSteamUnifiedMessageHandler() *SteamUnifiedMessageHandler {
	return &SteamUnifiedMessageHandler{}
}

func (handler *SteamUnifiedMessageHandler) Register(handlers map[steamlang.EMsg]func(*steammsg.Packet) ([]Event, error)) {
	handlers[steamlang.EMsg_ServiceMethodResponse] = handler.handleServiceMethodResponse
	handlers[steamlang.EMsg_ServiceMethod] = handler.handleServiceMethod
}

func (handler *SteamUnifiedMessageHandler) SendMessage(conn Connection, name string, body any) (*steamUnifiedMessageResponse, error) {
	// TODO : Check that user is logged-in
	jobId := conn.GetNextJobId()

	header := steammsg.NewProtoHeader(steamlang.EMsg_ServiceMethodCallFromClient)
	header.Proto.JobidSource = proto.Uint64(uint64(jobId))
	header.Proto.TargetJobName = proto.String(name)
	packet, err := steammsg.EncodePacket(header, body, nil)
	if err != nil {
		return nil, err
	}
	if err := conn.SendPacket(packet); err != nil {
		return nil, err
	}
	return waitForJob[*steamUnifiedMessageResponse](conn, jobId, time.Second*30)
}

func (handler *SteamUnifiedMessageHandler) SendNotification(conn Connection, name string, body any) error {
	// TODO : Check that user is logged-in

	header := steammsg.NewProtoHeader(steamlang.EMsg_ServiceMethodCallFromClient)
	header.Proto.TargetJobName = proto.String(name)
	packet, err := steammsg.EncodePacket(header, body, nil)
	if err != nil {
		return err
	}
	return conn.SendPacket(packet)
}

func (handler *SteamUnifiedMessageHandler) handleServiceMethodResponse(packet *steammsg.Packet) ([]Event, error) {
	if !packet.IsProto() {
		return nil, errors.New("non-protobuf packet")
	}
	protoHeader := packet.Header().(*steammsg.ProtoHeader).Proto
	return []Event{
		MakeEvent(EventType_State, EventCallback{
			JobId: steam.JobId(packet.Header().GetTargetJobId()),
			Payload: &steamUnifiedMessageResponse{
				Result:     steamlang.EResult(protoHeader.GetEresult()),
				MethodName: protoHeader.GetTargetJobName(),
				Packet:     packet,
			},
		}),
	}, nil
}

func (handler *SteamUnifiedMessageHandler) handleServiceMethod(packet *steammsg.Packet) ([]Event, error) {
	if !packet.IsProto() {
		return nil, errors.New("non-protobuf packet")
	}
	// TODO : Implement this
	// protoHeader := packet.Header().(*ProtoHeader).Proto
	return nil, nil
}
