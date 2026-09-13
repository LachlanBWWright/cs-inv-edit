package rpc

import (
	"encoding/json"
	"fmt"
	"net/http"
	"time"

	apiContract "cs-inv-edit/backend/internal/api"
	"cs-inv-edit/backend/internal/app"
)

type Handler struct {
	service *app.Service
	mux     *http.ServeMux
}

var _ apiContract.ServerInterface = (*Handler)(nil)

func NewHandler(service *app.Service) http.Handler {
	h := &Handler{service: service, mux: http.NewServeMux()}

	apiContract.HandlerFromMux(h, h.mux)
	return h.withCORS(h.mux)
}

func (h *Handler) GetHealth(w http.ResponseWriter, _ *http.Request) {
	writeJSON(w, h.service.Health())
}
func (h *Handler) GetProtocolTrace(w http.ResponseWriter, _ *http.Request, params apiContract.GetProtocolTraceParams) {
	after := uint64(0)
	if params.After != nil {
		after = *params.After
	}
	writeJSON(w, h.service.ProtocolTrace(after))
}
func (h *Handler) ListOperations(w http.ResponseWriter, _ *http.Request) {
	writeJSON(w, h.service.Operations())
}
func (h *Handler) GetSettings(w http.ResponseWriter, _ *http.Request) {
	writeJSON(w, h.service.Settings())
}
func (h *Handler) ListEvents(w http.ResponseWriter, r *http.Request) {
	if r.Header.Get("Accept") != "text/event-stream" {
		writeJSON(w, h.service.Events())
		return
	}
	w.Header().Set("Content-Type", "text/event-stream")
	w.Header().Set("Cache-Control", "no-cache")
	w.Header().Set("Connection", "keep-alive")
	ticker := time.NewTicker(2 * time.Second)
	defer ticker.Stop()
	for {
		select {
		case <-r.Context().Done():
			return
		case <-ticker.C:
			payload, err := json.Marshal(h.service.Events())
			if err != nil {
				return
			}
			if _, err := fmt.Fprintf(w, "event: snapshot\ndata: %s\n\n", payload); err != nil {
				return
			}
			if flusher, ok := w.(http.Flusher); ok {
				flusher.Flush()
			}
		}
	}
}
