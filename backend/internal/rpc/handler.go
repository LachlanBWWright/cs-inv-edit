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

	h.mux.HandleFunc("/health", h.health)
	h.mux.HandleFunc("/inventory", h.inventory)
	h.mux.HandleFunc("/inventory/refresh", h.inventoryRefresh)
	h.mux.HandleFunc("/operations", h.operations)
	h.mux.HandleFunc("/operations/", h.operationRoot)
	h.mux.HandleFunc("/operations/{type}", h.operation)
	h.mux.HandleFunc("/events", h.events)
	h.mux.HandleFunc("/settings", h.settings)
	h.mux.HandleFunc("/steam/status", h.steamStatus)
	h.mux.HandleFunc("/steam/connect", h.steamConnect)
	h.mux.HandleFunc("/steam/guard", h.steamGuard)
	h.mux.HandleFunc("/steam/disconnect", h.steamDisconnect)
	h.mux.HandleFunc("/storage/load", h.storageLoad)
	h.mux.HandleFunc("/storage/move-in", h.storageMoveIn)
	h.mux.HandleFunc("/storage/move-out", h.storageMoveOut)
	h.mux.HandleFunc("/containers/open", h.containerOpen)
	h.mux.HandleFunc("/tradeups/preview", h.tradeupPreview)
	h.mux.HandleFunc("/tradeups/execute", h.tradeupExecute)
	h.mux.HandleFunc("/stickers/extract", h.stickerExtract)
	h.mux.HandleFunc("/nametags/apply", h.nametagApply)
	h.mux.HandleFunc("/nametags/remove", h.nametagRemove)
	h.mux.HandleFunc("/items/delete", h.itemDelete)
	h.mux.HandleFunc("/stattrak/swap", h.stattrakSwap)
	h.mux.HandleFunc("/strange-parts/apply", h.strangePartApply)
	h.mux.HandleFunc("/items/use", h.itemUse)
	h.mux.HandleFunc("/items/use-multiple", h.itemUseMultiple)
	h.mux.HandleFunc("/tools/apply", h.toolApply)
	h.mux.HandleFunc("/tools/apply-base", h.toolApplyBase)
	h.mux.HandleFunc("/gifts/send", h.giftSend)

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
func (h *Handler) steamStatus(w http.ResponseWriter, _ *http.Request) {
	writeJSON(w, h.service.ConnectionStatus())
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
func (h *Handler) containerOpen(w http.ResponseWriter, r *http.Request) {
	writeJSON(w, h.handleBodyOperation(r, "containers.open"))
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
func (h *Handler) nametagApply(w http.ResponseWriter, r *http.Request) {
	writeJSON(w, h.handleBodyOperation(r, "nametags.apply"))
}
func (h *Handler) nametagRemove(w http.ResponseWriter, r *http.Request) {
	writeJSON(w, h.handleBodyOperation(r, "nametags.remove"))
}
func (h *Handler) itemDelete(w http.ResponseWriter, r *http.Request) {
	writeJSON(w, h.handleBodyOperation(r, "items.delete"))
}
func (h *Handler) stattrakSwap(w http.ResponseWriter, r *http.Request) {
	writeJSON(w, h.handleBodyOperation(r, "stattrak.swap"))
}
func (h *Handler) strangePartApply(w http.ResponseWriter, r *http.Request) {
	writeJSON(w, h.handleBodyOperation(r, "strange-parts.apply"))
}
func (h *Handler) itemUse(w http.ResponseWriter, r *http.Request) {
	writeJSON(w, h.handleBodyOperation(r, "items.use"))
}
func (h *Handler) itemUseMultiple(w http.ResponseWriter, r *http.Request) {
	writeJSON(w, h.handleBodyOperation(r, "items.use-multiple"))
}
func (h *Handler) toolApply(w http.ResponseWriter, r *http.Request) {
	writeJSON(w, h.handleBodyOperation(r, "tools.apply"))
}
func (h *Handler) toolApplyBase(w http.ResponseWriter, r *http.Request) {
	writeJSON(w, h.handleBodyOperation(r, "tools.apply-base"))
}
func (h *Handler) giftSend(w http.ResponseWriter, r *http.Request) {
	writeJSON(w, h.handleBodyOperation(r, "gifts.send"))
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
		origin := r.Header.Get("Origin")
		if strings.HasPrefix(origin, "http://localhost:") || strings.HasPrefix(origin, "http://127.0.0.1:") {
			w.Header().Set("Access-Control-Allow-Origin", origin)
			w.Header().Set("Vary", "Origin")
		}
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
