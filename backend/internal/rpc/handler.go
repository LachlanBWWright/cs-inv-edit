package rpc

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"reflect"
	"strconv"
	"strings"
	"time"

	"cs-inv-edit/backend/internal/app"
	"cs-inv-edit/backend/internal/operations"
	"cs-inv-edit/backend/internal/steamtrade"
	"golang.org/x/net/websocket"
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
	h.mux.HandleFunc("/games/{game}/inventory", h.gameInventory)
	h.mux.HandleFunc("/games/{game}/inventory/refresh", h.gameInventoryRefresh)
	h.mux.HandleFunc("/games/tf2/features", h.tf2Features)
	h.mux.HandleFunc("/games/cs2/features", h.cs2Features)
	h.mux.HandleFunc("/steam-inventory-service/{appID}", h.steamInventoryService)
	h.mux.HandleFunc("/steam-inventory-service/{appID}/refresh", h.steamInventoryServiceRefresh)
	h.mux.HandleFunc("/steam-inventory-service/games", h.steamInventoryServiceGames)
	h.mux.HandleFunc("/armory", h.armory)
	h.mux.HandleFunc("/armory/refresh", h.armoryRefresh)
	h.mux.HandleFunc("/armory/redeem", h.armoryRedeem)
	h.mux.HandleFunc("/store", h.store)
	h.mux.HandleFunc("/store/refresh", h.storeRefresh)
	h.mux.HandleFunc("/store/purchases", h.storePurchases)
	h.mux.HandleFunc("/store/purchases/{id}", h.storePurchase)
	h.mux.HandleFunc("/store/purchases/{id}/reconcile", h.storePurchaseReconcile)
	h.mux.HandleFunc("/trades", h.trades)
	h.mux.HandleFunc("/trade-accounts", h.tradeAccounts)
	h.mux.HandleFunc("/trades/refresh", h.tradesRefresh)
	h.mux.HandleFunc("/trades/offers", h.tradeOfferCreate)
	h.mux.HandleFunc("/trades/offers/{id}/accept", h.tradeOfferAccept)
	h.mux.HandleFunc("/trades/offers/{id}/counter", h.tradeOfferCounter)
	h.mux.HandleFunc("/market/preview", h.marketPreview)
	h.mux.HandleFunc("/operations", h.operations)
	h.mux.HandleFunc("/operations/", h.operationRoot)
	h.mux.HandleFunc("/operations/{type}", h.operation)
	h.mux.HandleFunc("/events", h.events)
	h.mux.HandleFunc("/protocol-trace", h.protocolTrace)
	h.mux.HandleFunc("/settings", h.settings)
	h.mux.HandleFunc("/steam/status", h.steamStatus)
	h.mux.HandleFunc("/steam/connect", h.steamConnect)
	h.mux.HandleFunc("/steam/qr", h.steamQR)
	h.mux.Handle("/steam/status/ws", websocket.Handler(h.steamStatusWebSocket))
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

func (h *Handler) tradeAccounts(w http.ResponseWriter, r *http.Request) {
	if r.Method == http.MethodGet {
		writeJSON(w, h.service.AccountTrades())
		return
	}
	if r.Method == http.MethodPost {
		ctx, cancel := context.WithTimeout(r.Context(), 30*time.Second)
		defer cancel()
		writeJSON(w, h.service.RefreshAccountTrades(ctx, r.URL.Query().Get("steamId")))
		return
	}
	writeError(w, http.StatusMethodNotAllowed, "trade accounts route requires GET or POST")
}

func (h *Handler) trades(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		writeError(w, http.StatusMethodNotAllowed, "trades route requires GET")
		return
	}
	writeJSON(w, h.service.Trades())
}

func (h *Handler) tradesRefresh(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		writeError(w, http.StatusMethodNotAllowed, "trade refresh requires POST")
		return
	}
	ctx, cancel := context.WithTimeout(r.Context(), 30*time.Second)
	defer cancel()
	writeJSON(w, h.service.RefreshTrades(ctx))
}

func decodeTradeCreate(w http.ResponseWriter, r *http.Request) (steamtrade.CreateRequest, bool) {
	var input steamtrade.CreateRequest
	decoder := json.NewDecoder(http.MaxBytesReader(w, r.Body, 64<<10))
	decoder.DisallowUnknownFields()
	if err := decoder.Decode(&input); err != nil {
		writeError(w, http.StatusBadRequest, "invalid trade offer request: "+err.Error())
		return input, false
	}
	return input, true
}

func (h *Handler) tradeOfferCreate(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		writeError(w, http.StatusMethodNotAllowed, "trade offer route requires POST")
		return
	}
	input, ok := decodeTradeCreate(w, r)
	if !ok {
		return
	}
	ctx, cancel := context.WithTimeout(r.Context(), 30*time.Second)
	defer cancel()
	writeJSON(w, h.service.CreateTradeOffer(ctx, input))
}

func (h *Handler) tradeOfferAccept(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		writeError(w, http.StatusMethodNotAllowed, "trade accept route requires POST")
		return
	}
	ctx, cancel := context.WithTimeout(r.Context(), 30*time.Second)
	defer cancel()
	writeJSON(w, h.service.AcceptTradeOffer(ctx, r.PathValue("id")))
}

func (h *Handler) tradeOfferCounter(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		writeError(w, http.StatusMethodNotAllowed, "trade counter route requires POST")
		return
	}
	input, ok := decodeTradeCreate(w, r)
	if !ok {
		return
	}
	ctx, cancel := context.WithTimeout(r.Context(), 30*time.Second)
	defer cancel()
	writeJSON(w, h.service.CounterTradeOffer(ctx, r.PathValue("id"), input))
}

func (h *Handler) health(w http.ResponseWriter, _ *http.Request) { writeJSON(w, h.service.Health()) }
func (h *Handler) protocolTrace(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		writeError(w, http.StatusMethodNotAllowed, "protocol trace route requires GET")
		return
	}
	after, _ := strconv.ParseUint(r.URL.Query().Get("after"), 10, 64)
	writeJSON(w, h.service.ProtocolTrace(after))
}
func (h *Handler) inventory(w http.ResponseWriter, _ *http.Request) {
	writeJSON(w, h.service.Inventory())
}
func (h *Handler) inventoryRefresh(w http.ResponseWriter, _ *http.Request) {
	writeJSON(w, h.service.RefreshInventory())
}
func (h *Handler) gameInventory(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		writeError(w, http.StatusMethodNotAllowed, "game inventory route requires GET")
		return
	}
	snapshot, supported, enabled := h.service.GameInventory(r.PathValue("game"))
	if !supported {
		writeError(w, http.StatusNotFound, "unsupported economy game")
		return
	}
	if !enabled {
		writeError(w, http.StatusForbidden, "game inventory is disabled by feature flag")
		return
	}
	writeJSON(w, snapshot)
}
func (h *Handler) gameInventoryRefresh(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		writeError(w, http.StatusMethodNotAllowed, "game inventory refresh requires POST")
		return
	}
	receipt := h.service.RefreshGameInventory(r.PathValue("game"))
	if receipt.State == operations.StateBlockedByFeatureFlag {
		w.WriteHeader(http.StatusForbidden)
	}
	writeJSON(w, receipt)
}
func (h *Handler) tf2Features(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		writeError(w, http.StatusMethodNotAllowed, "TF2 features route requires GET")
		return
	}
	writeJSON(w, h.service.TF2Features())
}

func (h *Handler) cs2Features(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}
	writeJSON(w, h.service.CS2Features())
}
func (h *Handler) steamInventoryServiceGames(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		writeError(w, http.StatusMethodNotAllowed, "Steam Inventory Service games route requires GET")
		return
	}
	ctx, cancel := context.WithTimeout(r.Context(), 30*time.Second)
	defer cancel()
	writeJSON(w, h.service.SteamInventoryServiceGames(ctx))
}
func parseSteamInventoryServiceAppID(w http.ResponseWriter, r *http.Request) (uint32, bool) {
	value, err := strconv.ParseUint(r.PathValue("appID"), 10, 32)
	if err != nil || value == 0 {
		writeError(w, http.StatusBadRequest, "Steam Inventory Service AppID must be a positive 32-bit integer")
		return 0, false
	}
	return uint32(value), true
}
func (h *Handler) steamInventoryService(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		writeError(w, http.StatusMethodNotAllowed, "Steam Inventory Service route requires GET")
		return
	}
	appID, ok := parseSteamInventoryServiceAppID(w, r)
	if !ok {
		return
	}
	snapshot, enabled := h.service.SteamInventoryService(appID)
	if !enabled {
		writeError(w, http.StatusForbidden, "Steam inventory is disabled by feature flag")
		return
	}
	writeJSON(w, snapshot)
}
func (h *Handler) steamInventoryServiceRefresh(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		writeError(w, http.StatusMethodNotAllowed, "Steam Inventory Service refresh requires POST")
		return
	}
	appID, ok := parseSteamInventoryServiceAppID(w, r)
	if !ok {
		return
	}
	receipt := h.service.RefreshSteamInventoryService(appID)
	if receipt.State == operations.StateBlockedByFeatureFlag {
		w.WriteHeader(http.StatusForbidden)
	}
	writeJSON(w, receipt)
}
func (h *Handler) armory(w http.ResponseWriter, _ *http.Request) { writeJSON(w, h.service.Armory()) }
func (h *Handler) armoryRefresh(w http.ResponseWriter, _ *http.Request) {
	writeJSON(w, h.service.RefreshArmory())
}
func (h *Handler) armoryRedeem(w http.ResponseWriter, r *http.Request) {
	writeJSON(w, h.handleBodyOperationDirect(r, h.service.RedeemArmory))
}
func (h *Handler) store(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		writeError(w, http.StatusMethodNotAllowed, "store route requires GET")
		return
	}
	writeJSON(w, h.service.Store())
}
func (h *Handler) storeRefresh(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		writeError(w, http.StatusMethodNotAllowed, "store refresh requires POST")
		return
	}
	writeJSON(w, h.service.RefreshStore())
}
func (h *Handler) storePurchases(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		writeError(w, http.StatusMethodNotAllowed, "store purchases require POST")
		return
	}
	body, err := parseBody(r)
	if err != nil {
		writeError(w, http.StatusBadRequest, err.Error())
		return
	}
	writeJSON(w, h.service.InitializeStorePurchase(body))
}
func (h *Handler) storePurchase(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		writeError(w, http.StatusMethodNotAllowed, "store purchase route requires GET")
		return
	}
	session, ok := h.service.StorePurchase(r.PathValue("id"))
	if !ok {
		writeError(w, http.StatusNotFound, "purchase session not found")
		return
	}
	writeJSON(w, session)
}
func (h *Handler) storePurchaseReconcile(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		writeError(w, http.StatusMethodNotAllowed, "store purchase reconciliation requires POST")
		return
	}
	writeJSON(w, h.service.ReconcileStorePurchase(r.PathValue("id")))
}
func (h *Handler) marketPreview(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		writeError(w, http.StatusMethodNotAllowed, "market preview requires GET")
		return
	}
	preview, err := h.service.MarketPreview(r.URL.Query().Get("marketName"))
	if err != nil {
		writeError(w, http.StatusBadGateway, err.Error())
		return
	}
	writeJSON(w, preview)
}

func (h *Handler) handleBodyOperationDirect(r *http.Request, submit func(map[string]any) operations.Receipt) operations.Receipt {
	body, err := parseBody(r)
	if err != nil {
		return operations.Receipt{State: "failed", Message: err.Error()}
	}
	return submit(body)
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
func (h *Handler) steamQR(w http.ResponseWriter, _ *http.Request) {
	writeJSON(w, h.service.StartSteamQR())
}
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
