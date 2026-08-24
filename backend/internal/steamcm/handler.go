package steamcm

import (
	"cs-inv-edit/backend/internal/steamlang"
	"cs-inv-edit/backend/internal/steammsg"
)

type Handler interface {
	Register(map[steamlang.EMsg]func(*steammsg.Packet) ([]Event, error))
}

func MakeDispatchLayer(handlers ...Handler) *dispatchLayer {
	dispatchMap := make(map[steamlang.EMsg]func(*steammsg.Packet) ([]Event, error), 0)
	for _, handler := range handlers {
		handler.Register(dispatchMap)
	}
	return NewDispatchLayer(dispatchMap)
}
