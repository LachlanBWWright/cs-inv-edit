package steamcm

import (
	"cs-inv-edit/backend/internal/proto/steampb"
	"cs-inv-edit/backend/internal/steamlang"
	"cs-inv-edit/backend/internal/steammsg"
)

type SteamBaseHandler struct {
}

func NewSteamBaseHandler() *SteamBaseHandler {
	return &SteamBaseHandler{}
}

func (handler *SteamBaseHandler) Register(handlers map[steamlang.EMsg]func(*steammsg.Packet) ([]Event, error)) {
	handlers[steamlang.EMsg_ClientServerUnavailable] = handler.handleServerUnavailable
	handlers[steamlang.EMsg_ClientCMList] = handler.handleCMList
	handlers[steamlang.EMsg_ClientSessionToken] = handler.handleSessionToken

}

func (handler *SteamBaseHandler) handleServerUnavailable(packet *steammsg.Packet) ([]Event, error) {
	body := new(steammsg.MsgClientServerUnavailable)
	if _, err := steammsg.DecodePacket(packet, body); err != nil {
		return nil, err
	}
	// TODO: Close connection
	return nil, nil
}

func (handler *SteamBaseHandler) handleCMList(_ *steammsg.Packet) ([]Event, error) {
	// TODO: Read and update CM list
	return nil, nil
}

func (handler *SteamBaseHandler) handleSessionToken(packet *steammsg.Packet) ([]Event, error) {
	body := new(steampb.CMsgClientSessionToken)
	if _, err := steammsg.DecodePacket(packet, body); err != nil {
		return nil, err
	}
	// TODO: Set internal session token
	// body.GetToken()
	return nil, nil
}
