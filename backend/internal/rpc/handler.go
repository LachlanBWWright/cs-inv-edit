package rpc

import (
	"encoding/json"
	"fmt"
	"net/http"
	"strings"
	"time"

	"cs-inv-edit/backend/internal/app"
)

type Handler struct {
	service *app.Service
	mux     *http.ServeMux
}

func NewHandler(service *app.Service) http.Handler {
	h := &Handler{
		service: service,
		mux:     http.NewServeMux(),
	}

	h.mux.HandleFunc("GET /health", h.health)
	h.mux.HandleFunc("GET /inventory", h.inventory)
	h.mux.HandleFunc("GET /events", h.events)
	h.mux.HandleFunc("POST /operations/{type}", h.operation)

	return h.withCORS(h.mux)
}

func (h *Handler) health(w http.ResponseWriter, _ *http.Request) {
	writeJSON(w, h.service.Health())
}

func (h *Handler) inventory(w http.ResponseWriter, _ *http.Request) {
	writeJSON(w, h.service.Inventory())
}

func (h *Handler) operation(w http.ResponseWriter, r *http.Request) {
	opType := strings.TrimSpace(r.PathValue("type"))
	if opType == "" {
		http.Error(w, "missing operation type", http.StatusBadRequest)
		return
	}

	writeJSON(w, h.service.SubmitOperation(opType))
}

func (h *Handler) events(w http.ResponseWriter, r *http.Request) {
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
			payload, _ := json.Marshal(h.service.Events())
			fmt.Fprintf(w, "event: snapshot\ndata: %s\n\n", payload)
			if flusher, ok := w.(http.Flusher); ok {
				flusher.Flush()
			}
		}
	}
}

func (h *Handler) withCORS(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Access-Control-Allow-Origin", "http://localhost:5174")
		w.Header().Set("Access-Control-Allow-Methods", "GET,POST,OPTIONS")
		w.Header().Set("Access-Control-Allow-Headers", "Content-Type,Accept")
		if r.Method == http.MethodOptions {
			w.WriteHeader(http.StatusNoContent)
			return
		}
		next.ServeHTTP(w, r)
	})
}

func writeJSON(w http.ResponseWriter, value any) {
	w.Header().Set("Content-Type", "application/json")
	if err := json.NewEncoder(w).Encode(value); err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
	}
}
