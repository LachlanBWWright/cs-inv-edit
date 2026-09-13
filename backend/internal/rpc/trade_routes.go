package rpc

import (
	"context"
	"encoding/json"
	"net/http"
	"time"

	apiContract "cs-inv-edit/backend/internal/api"
	"cs-inv-edit/backend/internal/steamtrade"
)

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
