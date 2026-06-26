package rpc

import (
	"bytes"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"strings"
	"time"

	"cs-inv-edit/backend/internal/app"
	"cs-inv-edit/backend/internal/domain"
)

type Handler struct {
	service *app.Service
	mux     *http.ServeMux
}

func NewHandler(service *app.Service) http.Handler {
	h := &Handler{service: service, mux: http.NewServeMux()}

	h.mux.HandleFunc("GET /health", h.health)
	h.mux.HandleFunc("GET /inventory", h.inventory)
	h.mux.HandleFunc("POST /inventory/refresh", h.refreshInventory)
	h.mux.HandleFunc("GET /events", h.events)
	h.mux.HandleFunc("GET /settings", h.settings)
	h.mux.HandleFunc("POST /settings", h.updateSettings)
	h.mux.HandleFunc("POST /steam/connect", h.connectSteam)
	h.mux.HandleFunc("POST /steam/guard", h.steamGuard)
	h.mux.HandleFunc("POST /steam/disconnect", h.disconnectSteam)
	h.mux.HandleFunc("POST /storage/load", h.storageLoad)
	h.mux.HandleFunc("POST /storage/move-in", h.storageMoveIn)
	h.mux.HandleFunc("POST /storage/move-out", h.storageMoveOut)
	h.mux.HandleFunc("POST /tradeups/preview", h.tradeupPreview)
	h.mux.HandleFunc("POST /tradeups/execute", h.tradeupExecute)
	h.mux.HandleFunc("POST /stickers/extract", h.stickerExtract)
	h.mux.HandleFunc("POST /stickers/remove", h.stickerRemove)
	h.mux.HandleFunc("POST /stickers/apply", h.stickerApply)
	h.mux.HandleFunc("POST /operations/{type}", h.operation)

	return h.withCORS(h.mux)
}

func (h *Handler) health(w http.ResponseWriter, _ *http.Request) { writeJSON(w, h.service.Health()) }
func (h *Handler) inventory(w http.ResponseWriter, _ *http.Request) {
	writeJSON(w, h.service.Inventory())
}
func (h *Handler) refreshInventory(w http.ResponseWriter, _ *http.Request) {
	writeJSON(w, h.service.RefreshInventory())
}
func (h *Handler) settings(w http.ResponseWriter, _ *http.Request) {
	writeJSON(w, h.service.GetSettings())
}

func (h *Handler) updateSettings(w http.ResponseWriter, r *http.Request) {
	var payload domain.FeatureSettings
	if err := decodeJSON(r, &payload); err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}
	writeJSON(w, h.service.UpdateSettings(payload))
}

func (h *Handler) connectSteam(w http.ResponseWriter, r *http.Request) {
	writeJSON(w, h.service.ConnectSteam(decodeBody(r)))
}

func (h *Handler) steamGuard(w http.ResponseWriter, r *http.Request) {
	writeJSON(w, h.service.SubmitSteamGuard(decodeBody(r)))
}

func (h *Handler) disconnectSteam(w http.ResponseWriter, _ *http.Request) {
	writeJSON(w, h.service.DisconnectSteam())
}

func (h *Handler) storageLoad(w http.ResponseWriter, r *http.Request) {
	receipt, err := h.service.SubmitOperation("storage.load-contents", decodeBody(r))
	if err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}
	writeJSON(w, receipt)
}

func (h *Handler) storageMoveIn(w http.ResponseWriter, r *http.Request) {
	receipt, err := h.service.SubmitOperation("storage.move-in", decodeBody(r))
	if err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}
	writeJSON(w, receipt)
}

func (h *Handler) storageMoveOut(w http.ResponseWriter, r *http.Request) {
	receipt, err := h.service.SubmitOperation("storage.move-out", decodeBody(r))
	if err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}
	writeJSON(w, receipt)
}

func (h *Handler) tradeupPreview(w http.ResponseWriter, r *http.Request) {
	receipt, err := h.service.SubmitOperation("tradeups.preview", decodeBody(r))
	if err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}
	writeJSON(w, receipt)
}

func (h *Handler) tradeupExecute(w http.ResponseWriter, r *http.Request) {
	receipt, err := h.service.SubmitOperation("tradeups.execute", decodeBody(r))
	if err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}
	writeJSON(w, receipt)
}

func (h *Handler) stickerExtract(w http.ResponseWriter, r *http.Request) {
	receipt, err := h.service.SubmitOperation("stickers.extract", decodeBody(r))
	if err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}
	writeJSON(w, receipt)
}

func (h *Handler) stickerRemove(w http.ResponseWriter, r *http.Request) {
	receipt, err := h.service.SubmitOperation("stickers.remove", decodeBody(r))
	if err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}
	writeJSON(w, receipt)
}

func (h *Handler) stickerApply(w http.ResponseWriter, r *http.Request) {
	receipt, err := h.service.SubmitOperation("stickers.apply", decodeBody(r))
	if err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}
	writeJSON(w, receipt)
}

func (h *Handler) operation(w http.ResponseWriter, r *http.Request) {
	opType := strings.TrimSpace(r.PathValue("type"))
	if opType == "" {
		http.Error(w, "missing operation type", http.StatusBadRequest)
		return
	}
	receipt, err := h.service.SubmitOperation(opType, decodeBody(r))
	if err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}
	writeJSON(w, receipt)
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

func decodeBody(r *http.Request) any {
	defer r.Body.Close()
	data, err := io.ReadAll(r.Body)
	if err != nil || len(bytes.TrimSpace(data)) == 0 {
		return nil
	}
	var parsed any
	if err := json.Unmarshal(data, &parsed); err != nil {
		return map[string]any{}
	}
	return parsed
}

func decodeJSON(r *http.Request, target any) error {
	defer r.Body.Close()
	data, err := io.ReadAll(r.Body)
	if err != nil {
		return err
	}
	if len(bytes.TrimSpace(data)) == 0 {
		return nil
	}
	return json.Unmarshal(data, target)
}
