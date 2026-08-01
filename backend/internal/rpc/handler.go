package rpc

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"reflect"
	"strings"
	"time"

	apiContract "cs-inv-edit/backend/internal/api"
	"cs-inv-edit/backend/internal/app"
	"cs-inv-edit/backend/internal/operations"
	"cs-inv-edit/backend/internal/steamtrade"
	"golang.org/x/net/websocket"
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

func (h *Handler) GetTradeAccounts(w http.ResponseWriter, _ *http.Request) {
	writeJSON(w, h.service.AccountTrades())
}

func (h *Handler) RefreshTradeAccounts(w http.ResponseWriter, r *http.Request, params apiContract.RefreshTradeAccountsParams) {
	ctx, cancel := context.WithTimeout(r.Context(), 30*time.Second)
	defer cancel()
	steamID := ""
	if params.SteamId != nil {
		steamID = *params.SteamId
	}
	writeJSON(w, h.service.RefreshAccountTrades(ctx, steamID))
}

func (h *Handler) GetTrades(w http.ResponseWriter, _ *http.Request) {
	writeJSON(w, h.service.Trades())
}

func (h *Handler) RefreshTrades(w http.ResponseWriter, r *http.Request) {
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

func (h *Handler) CreateTradeOffer(w http.ResponseWriter, r *http.Request) {
	input, ok := decodeTradeCreate(w, r)
	if !ok {
		return
	}
	ctx, cancel := context.WithTimeout(r.Context(), 30*time.Second)
	defer cancel()
	writeJSON(w, h.service.CreateTradeOffer(ctx, input))
}

func (h *Handler) AcceptTradeOffer(w http.ResponseWriter, r *http.Request, id apiContract.ID) {
	ctx, cancel := context.WithTimeout(r.Context(), 30*time.Second)
	defer cancel()
	writeJSON(w, h.service.AcceptTradeOffer(ctx, id))
}

func (h *Handler) CounterTradeOffer(w http.ResponseWriter, r *http.Request, id apiContract.ID) {
	input, ok := decodeTradeCreate(w, r)
	if !ok {
		return
	}
	ctx, cancel := context.WithTimeout(r.Context(), 30*time.Second)
	defer cancel()
	writeJSON(w, h.service.CounterTradeOffer(ctx, id, input))
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
func (h *Handler) GetInventory(w http.ResponseWriter, _ *http.Request) {
	writeJSON(w, h.service.Inventory())
}
func (h *Handler) RefreshInventory(w http.ResponseWriter, _ *http.Request) {
	writeJSON(w, h.service.RefreshInventory())
}
func (h *Handler) GetGameInventory(w http.ResponseWriter, _ *http.Request, game apiContract.Game) {
	snapshot, supported, enabled := h.service.GameInventory(string(game))
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
func (h *Handler) RefreshGameInventory(w http.ResponseWriter, _ *http.Request, game apiContract.Game) {
	receipt := h.service.RefreshGameInventory(string(game))
	if receipt.State == operations.StateBlockedByFeatureFlag {
		w.WriteHeader(http.StatusForbidden)
	}
	writeJSON(w, receipt)
}
func (h *Handler) GetTf2Features(w http.ResponseWriter, r *http.Request) {
	writeJSON(w, h.service.TF2FeaturesWithMetadata(r.Context()))
}

func (h *Handler) GetCs2Features(w http.ResponseWriter, _ *http.Request) {
	writeJSON(w, h.service.CS2Features())
}
func (h *Handler) ListSteamInventoryServiceGames(w http.ResponseWriter, r *http.Request) {
	ctx, cancel := context.WithTimeout(r.Context(), 30*time.Second)
	defer cancel()
	writeJSON(w, h.service.SteamInventoryServiceGames(ctx))
}
func (h *Handler) GetSteamInventoryService(w http.ResponseWriter, _ *http.Request, appID apiContract.AppID) {
	if appID == 0 {
		writeError(w, http.StatusBadRequest, "Steam Inventory Service AppID must be a positive 32-bit integer")
		return
	}
	snapshot, enabled := h.service.SteamInventoryService(uint32(appID))
	if !enabled {
		writeError(w, http.StatusForbidden, "Steam inventory is disabled by feature flag")
		return
	}
	writeJSON(w, snapshot)
}
func (h *Handler) RefreshSteamInventoryService(w http.ResponseWriter, _ *http.Request, appID apiContract.AppID) {
	if appID == 0 {
		writeError(w, http.StatusBadRequest, "Steam Inventory Service AppID must be a positive 32-bit integer")
		return
	}
	receipt := h.service.RefreshSteamInventoryService(uint32(appID))
	if receipt.State == operations.StateBlockedByFeatureFlag {
		w.WriteHeader(http.StatusForbidden)
	}
	writeJSON(w, receipt)
}
func (h *Handler) GetArmory(w http.ResponseWriter, _ *http.Request) {
	writeJSON(w, h.service.Armory())
}
func (h *Handler) RefreshArmory(w http.ResponseWriter, _ *http.Request) {
	writeJSON(w, h.service.RefreshArmory())
}
func (h *Handler) RedeemArmory(w http.ResponseWriter, r *http.Request) {
	writeJSON(w, h.handleBodyOperationDirect(r, h.service.RedeemArmory))
}
func (h *Handler) GetStore(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		writeError(w, http.StatusMethodNotAllowed, "store route requires GET")
		return
	}
	writeJSON(w, h.service.Store())
}
func (h *Handler) RefreshStore(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		writeError(w, http.StatusMethodNotAllowed, "store refresh requires POST")
		return
	}
	writeJSON(w, h.service.RefreshStore())
}
func (h *Handler) GetTf2Store(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		writeError(w, http.StatusMethodNotAllowed, "TF2 store route requires GET")
		return
	}
	writeJSON(w, h.service.TF2Store())
}
func (h *Handler) RefreshTf2Store(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		writeError(w, http.StatusMethodNotAllowed, "TF2 store refresh requires POST")
		return
	}
	writeJSON(w, h.service.RefreshTF2Store())
}
func (h *Handler) InitializeTf2StorePurchase(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		writeError(w, http.StatusMethodNotAllowed, "TF2 store purchases require POST")
		return
	}
	body, err := parseBody(r)
	if err != nil {
		writeError(w, http.StatusBadRequest, err.Error())
		return
	}
	writeJSON(w, h.service.InitializeTF2StorePurchase(body))
}
func (h *Handler) InitializeStorePurchase(w http.ResponseWriter, r *http.Request) {
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
func (h *Handler) GetStorePurchase(w http.ResponseWriter, r *http.Request, id apiContract.ID) {
	if r.Method != http.MethodGet {
		writeError(w, http.StatusMethodNotAllowed, "store purchase route requires GET")
		return
	}
	session, ok := h.service.StorePurchase(id)
	if !ok {
		writeError(w, http.StatusNotFound, "purchase session not found")
		return
	}
	writeJSON(w, session)
}
func (h *Handler) ReconcileStorePurchase(w http.ResponseWriter, r *http.Request, id apiContract.ID) {
	if r.Method != http.MethodPost {
		writeError(w, http.StatusMethodNotAllowed, "store purchase reconciliation requires POST")
		return
	}
	writeJSON(w, h.service.ReconcileStorePurchase(id))
}
func (h *Handler) GetMarketPreview(w http.ResponseWriter, r *http.Request, params apiContract.GetMarketPreviewParams) {
	if r.Method != http.MethodGet {
		writeError(w, http.StatusMethodNotAllowed, "market preview requires GET")
		return
	}
	preview, err := h.service.MarketPreview(params.MarketName)
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
func (h *Handler) ListOperations(w http.ResponseWriter, _ *http.Request) {
	writeJSON(w, h.service.Operations())
}
func (h *Handler) GetSettings(w http.ResponseWriter, _ *http.Request) {
	writeJSON(w, h.service.Settings())
}
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
func (h *Handler) LoadStorage(w http.ResponseWriter, r *http.Request) {
	writeJSON(w, h.handleBodyOperation(r, "storage.load"))
}
func (h *Handler) MoveIntoStorage(w http.ResponseWriter, r *http.Request) {
	writeJSON(w, h.handleBodyOperation(r, "storage.move-in"))
}
func (h *Handler) MoveOutOfStorage(w http.ResponseWriter, r *http.Request) {
	writeJSON(w, h.handleBodyOperation(r, "storage.move-out"))
}
func (h *Handler) OpenContainer(w http.ResponseWriter, r *http.Request) {
	writeJSON(w, h.handleBodyOperation(r, "containers.open"))
}
func (h *Handler) PreviewTradeUp(w http.ResponseWriter, r *http.Request) {
	writeJSON(w, h.handleBodyOperation(r, "tradeups.preview"))
}
func (h *Handler) ExecuteTradeUp(w http.ResponseWriter, r *http.Request) {
	writeJSON(w, h.handleBodyOperation(r, "tradeups.execute"))
}
func (h *Handler) ExtractSticker(w http.ResponseWriter, r *http.Request) {
	writeJSON(w, h.handleBodyOperation(r, "stickers.extract"))
}
func (h *Handler) ApplyNameTag(w http.ResponseWriter, r *http.Request) {
	writeJSON(w, h.handleBodyOperation(r, "nametags.apply"))
}
func (h *Handler) RemoveNameTag(w http.ResponseWriter, r *http.Request) {
	writeJSON(w, h.handleBodyOperation(r, "nametags.remove"))
}
func (h *Handler) DeleteItem(w http.ResponseWriter, r *http.Request) {
	writeJSON(w, h.handleBodyOperation(r, "items.delete"))
}
func (h *Handler) ApplyStatTrakSwap(w http.ResponseWriter, r *http.Request) {
	writeJSON(w, h.handleBodyOperation(r, "stattrak.swap"))
}
func (h *Handler) ApplyStrangePart(w http.ResponseWriter, r *http.Request) {
	writeJSON(w, h.handleBodyOperation(r, "strange-parts.apply"))
}
func (h *Handler) UseItem(w http.ResponseWriter, r *http.Request) {
	writeJSON(w, h.handleBodyOperation(r, "items.use"))
}
func (h *Handler) UseMultipleItems(w http.ResponseWriter, r *http.Request) {
	writeJSON(w, h.handleBodyOperation(r, "items.use-multiple"))
}
func (h *Handler) ApplyToolToItem(w http.ResponseWriter, r *http.Request) {
	writeJSON(w, h.handleBodyOperation(r, "tools.apply"))
}
func (h *Handler) ApplyToolToBaseItem(w http.ResponseWriter, r *http.Request) {
	writeJSON(w, h.handleBodyOperation(r, "tools.apply-base"))
}
func (h *Handler) SendGift(w http.ResponseWriter, r *http.Request) {
	writeJSON(w, h.handleBodyOperation(r, "gifts.send"))
}

func (h *Handler) RejectMissingOperationType(w http.ResponseWriter, _ *http.Request) {
	writeError(w, http.StatusBadRequest, "missing operation type")
}

func (h *Handler) SubmitOperation(w http.ResponseWriter, r *http.Request, pType string) {
	opType := strings.TrimSpace(pType)
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
