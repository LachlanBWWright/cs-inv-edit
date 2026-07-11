package transport

import (
	"context"
	"errors"
	"fmt"
	"time"

	"github.com/Lucino772/envelop/pkg/steam"
	"github.com/Lucino772/envelop/pkg/steam/steamcm"
	"github.com/Lucino772/envelop/pkg/steam/steamlang"
	"github.com/Lucino772/envelop/pkg/steam/steammsg"
	"google.golang.org/protobuf/proto"
)

type nonAuthedUnifiedHandler struct{}

type nonAuthedUnifiedResponse struct {
	Result     steamlang.EResult
	MethodName string
	Packet     *steammsg.Packet
}

type asyncResult[T any] struct {
	value T
	err   error
}

func newNonAuthedUnifiedHandler() *nonAuthedUnifiedHandler {
	return &nonAuthedUnifiedHandler{}
}

func (handler *nonAuthedUnifiedHandler) Register(handlers map[steamlang.EMsg]func(*steammsg.Packet) ([]steamcm.Event, error)) {
	handlers[steamlang.EMsg_ServiceMethodResponse] = handler.handleServiceMethodResponse
	handlers[steamlang.EMsg_ServiceMethod] = handler.handleServiceMethod
}

func (handler *nonAuthedUnifiedHandler) SendNonAuthedMessage(conn steamcm.Connection, name string, body proto.Message) (*nonAuthedUnifiedResponse, error) {
	jobID := conn.GetNextJobId()
	header := steammsg.NewProtoHeader(steamlang.EMsg(9804))
	header.Proto.JobidSource = proto.Uint64(uint64(jobID))
	header.Proto.TargetJobName = proto.String(name)
	header.Proto.Realm = proto.Uint32(1)
	packet, err := steammsg.EncodePacket(header, body, nil)
	if err != nil {
		return nil, err
	}
	resultCh := make(chan asyncResult[*nonAuthedUnifiedResponse], 1)
	conn.RegisterJob(jobID, func(payload any) {
		response, ok := payload.(*nonAuthedUnifiedResponse)
		if !ok {
			resultCh <- asyncResult[*nonAuthedUnifiedResponse]{err: fmt.Errorf("unexpected unified response payload %T", payload)}
			return
		}
		resultCh <- asyncResult[*nonAuthedUnifiedResponse]{value: response}
	})
	if err := conn.SendPacket(packet); err != nil {
		return nil, err
	}
	select {
	case result := <-resultCh:
		return result.value, result.err
	case <-time.After(8 * time.Second):
		return nil, context.DeadlineExceeded
	}
}

func (handler *nonAuthedUnifiedHandler) handleServiceMethodResponse(packet *steammsg.Packet) ([]steamcm.Event, error) {
	if !packet.IsProto() {
		return nil, errors.New("non-protobuf service method response")
	}
	protoHeader := packet.Header().(*steammsg.ProtoHeader).Proto
	return []steamcm.Event{
		steamcm.MakeEvent(steamcm.EventType_State, steamcm.EventCallback{
			JobId: steam.JobId(packet.Header().GetTargetJobId()),
			Payload: &nonAuthedUnifiedResponse{
				Result:     steamlang.EResult(protoHeader.GetEresult()),
				MethodName: protoHeader.GetTargetJobName(),
				Packet:     packet,
			},
		}),
	}, nil
}

func (handler *nonAuthedUnifiedHandler) handleServiceMethod(packet *steammsg.Packet) ([]steamcm.Event, error) {
	if !packet.IsProto() {
		return nil, errors.New("non-protobuf service method")
	}
	return nil, nil
}
