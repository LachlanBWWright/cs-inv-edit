package rpc

import (
	"net/http"

	"golang.org/x/net/websocket"
)

func (h *Handler) ConnectSteam(w http.ResponseWriter, r *http.Request) {
	body, err := parseBody(r)
	if err != nil {
		writeError(w, http.StatusBadRequest, err.Error())
		return
	}
	writeJSON(w, h.service.ConnectSteam(body))
}

func (h *Handler) StartSteamQr(w http.ResponseWriter, _ *http.Request) {
	writeJSON(w, h.service.StartSteamQR())
}

func (h *Handler) SubmitSteamGuard(w http.ResponseWriter, r *http.Request) {
	body, err := parseBody(r)
	if err != nil {
		writeError(w, http.StatusBadRequest, err.Error())
		return
	}
	writeJSON(w, h.service.SubmitSteamGuard(body))
}

func (h *Handler) DisconnectSteam(w http.ResponseWriter, _ *http.Request) {
	writeJSON(w, h.service.DisconnectSteam())
}

func (h *Handler) GetSteamStatus(w http.ResponseWriter, _ *http.Request) {
	writeJSON(w, h.service.ConnectionStatus())
}

func (h *Handler) WatchSteamStatus(w http.ResponseWriter, r *http.Request) {
	websocket.Handler(h.steamStatusWebSocket).ServeHTTP(w, r)
}
