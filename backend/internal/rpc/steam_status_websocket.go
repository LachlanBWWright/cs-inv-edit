package rpc

import (
	"reflect"
	"time"

	"golang.org/x/net/websocket"
)

func (h *Handler) steamStatusWebSocket(conn *websocket.Conn) {
	defer conn.Close()
	var previous any
	ticker := time.NewTicker(100 * time.Millisecond)
	defer ticker.Stop()
	for {
		status := h.service.ConnectionStatus()
		if !reflect.DeepEqual(previous, status) {
			if err := websocket.JSON.Send(conn, status); err != nil {
				return
			}
			previous = status
		}
		select {
		case <-conn.Request().Context().Done():
			return
		case <-ticker.C:
		}
	}
}
