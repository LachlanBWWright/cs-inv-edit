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
	h := &Handler{service: service, mux: http.NewServeMux()}

	h.mux.HandleFunc("GET /health", h.health)
	h.mux.HandleFunc("GET /inventory", h.inventory)
	h.mux.HandleFunc("POST /inventory/refresh", h.inventoryRefresh)
	h.mux.HandleFunc("GET /operations", h.operations)
	h.mux.HandleFunc("POST /operations", h.operationRoot)
	h.mux.HandleFunc("POST /operations/", h.operationRoot)
	h.mux.HandleFunc("GET /events", h.events)
	h.mux.HandleFunc("POST /operations/{type}", h.operation)
	h.mux.HandleFunc("GET /settings", h.settings)
	h.mux.HandleFunc("POST /settings", h.settingsSave)
	h.mux.HandleFunc("POST /steam/connect", h.steamConnect)
	h.mux.HandleFunc("POST /steam/guard", h.steamGuard)
	h.mux.HandleFunc("POST /steam/disconnect", h.steamDisconnect)
	h.mux.HandleFunc("POST /storage/load", h.storageLoad)
	h.mux.HandleFunc("POST /storage/move-in", h.storageMoveIn)
	h.mux.HandleFunc("POST /storage/move-out", h.storageMoveOut)
	h.mux.HandleFunc("POST /tradeups/preview", h.tradeupPreview)
	h.mux.HandleFunc("POST /tradeups/execute", h.tradeupExecute)
	h.mux.HandleFunc("POST /stickers/extract", h.stickerExtract)
	h.mux.HandleFunc("POST /stickers/remove", h.stickerRemove)
	h.mux.HandleFunc("POST /stickers/apply", h.stickerApply)

	return h.withCORS(h.mux)
}

func (h *Handler) health(w http.ResponseWriter, _ *http.Request) { writeJSON(w, h.service.Health()) }
func (h *Handler) inventory(w http.ResponseWriter, _ *http.Request) {
	writeJSON(w, h.service.Inventory())
}
func (h *Handler) inventoryRefresh(w http.ResponseWriter, _ *http.Request) {
	writeJSON(w, h.service.RefreshInventory())
}
func (h *Handler) operations(w http.ResponseWriter, _ *http.Request) {
	writeJSON(w, h.service.Operations())
}
func (h *Handler) settings(w http.ResponseWriter, _ *http.Request) {
	writeJSON(w, h.service.Settings())
}
func (h *Handler) settingsSave(w http.ResponseWriter, r *http.Request) {
	body, err := parseBody(r)
	if err != nil {
		writeError(w, http.StatusBadRequest, err.Error())
		return
	}
	writeJSON(w, h.service.SubmitOperation("settings", body))
}
func (h *Handler) steamConnect(w http.ResponseWriter, r *http.Request) {
	body, err := parseBody(r)
	if err != nil {
		writeError(w, http.StatusBadRequest, err.Error())
		return
	}
	writeJSON(w, h.service.ConnectSteam(body))
}
func (h *Handler) steamGuard(w http.ResponseWriter, r *http.Request) {
	body, err := parseBody(r)
	if err != nil {
		writeError(w, http.StatusBadRequest, err.Error())
		return
	}
	writeJSON(w, h.service.SubmitSteamGuard(body))
}
func (h *Handler) steamDisconnect(w http.ResponseWriter, _ *http.Request) {
	writeJSON(w, h.service.DisconnectSteam())
}
func (h *Handler) storageLoad(w http.ResponseWriter, r *http.Request) {
	writeJSON(w, h.handleBodyOperation(r, "storage.load"))
}
func (h *Handler) storageMoveIn(w http.ResponseWriter, r *http.Request) {
	writeJSON(w, h.handleBodyOperation(r, "storage.move-in"))
}
func (h *Handler) storageMoveOut(w http.ResponseWriter, r *http.Request) {
	writeJSON(w, h.handleBodyOperation(r, "storage.move-out"))
}
func (h *Handler) tradeupPreview(w http.ResponseWriter, r *http.Request) {
	writeJSON(w, h.handleBodyOperation(r, "tradeups.preview"))
}
func (h *Handler) tradeupExecute(w http.ResponseWriter, r *http.Request) {
	writeJSON(w, h.handleBodyOperation(r, "tradeups.execute"))
}
func (h *Handler) stickerExtract(w http.ResponseWriter, r *http.Request) {
	writeJSON(w, h.handleBodyOperation(r, "stickers.extract"))
}
func (h *Handler) stickerRemove(w http.ResponseWriter, r *http.Request) {
	writeJSON(w, h.handleBodyOperation(r, "stickers.remove"))
}
func (h *Handler) stickerApply(w http.ResponseWriter, r *http.Request) {
	writeJSON(w, h.handleBodyOperation(r, "stickers.apply"))
}

func (h *Handler) operationRoot(w http.ResponseWriter, _ *http.Request) {
	writeError(w, http.StatusBadRequest, "missing operation type")
}

func (h *Handler) operation(w http.ResponseWriter, r *http.Request) {
	opType := strings.TrimSpace(r.PathValue("type"))
	if opType == "" {
		writeError(w, http.StatusBadRequest, "missing operation type")
		return
	}
	body, err := parseBody(r)
	if err != nil {
		body = map[string]any{}
	}
	writeJSON(w, h.service.SubmitOperation(opType, body))
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

func (h *Handler) handleBodyOperation(r *http.Request, opType string) any {
	body, err := parseBody(r)
	if err != nil {
		return map[string]any{"error": err.Error()}
	}
	return h.service.SubmitOperation(opType, body)
}

func parseBody(r *http.Request) (map[string]any, error) {
	if r.Body == nil {
		return map[string]any{}, nil
	}
	defer r.Body.Close()
	var payload map[string]any
	if err := json.NewDecoder(r.Body).Decode(&payload); err != nil {
		return nil, err
	}
	return payload, nil
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

func writeError(w http.ResponseWriter, status int, message string) {
	http.Error(w, message, status)
}
