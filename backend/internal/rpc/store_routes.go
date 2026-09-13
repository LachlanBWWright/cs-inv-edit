package rpc

import (
	"context"
	"net/http"
	"time"

	apiContract "cs-inv-edit/backend/internal/api"
)

func (h *Handler) GetStore(w http.ResponseWriter, _ *http.Request) {
	writeJSON(w, h.service.Store())
}

func (h *Handler) RefreshStore(w http.ResponseWriter, _ *http.Request) {
	writeJSON(w, h.service.RefreshStore())
}

func (h *Handler) GetTf2Store(w http.ResponseWriter, _ *http.Request) {
	writeJSON(w, h.service.TF2Store())
}

func (h *Handler) RefreshTf2Store(w http.ResponseWriter, _ *http.Request) {
	writeJSON(w, h.service.RefreshTF2Store())
}

func (h *Handler) InitializeTf2StorePurchase(w http.ResponseWriter, r *http.Request) {
	body, err := parseBody(r)
	if err != nil {
		writeError(w, http.StatusBadRequest, err.Error())
		return
	}
	writeJSON(w, h.service.InitializeTF2StorePurchase(body))
}

func (h *Handler) InitializeStorePurchase(w http.ResponseWriter, r *http.Request) {
	body, err := parseBody(r)
	if err != nil {
		writeError(w, http.StatusBadRequest, err.Error())
		return
	}
	writeJSON(w, h.service.InitializeStorePurchase(body))
}

func (h *Handler) GetStorePurchase(w http.ResponseWriter, _ *http.Request, id apiContract.ID) {
	session, ok := h.service.StorePurchase(id)
	if !ok {
		writeError(w, http.StatusNotFound, "purchase session not found")
		return
	}
	writeJSON(w, session)
}

func (h *Handler) ReconcileStorePurchase(w http.ResponseWriter, _ *http.Request, id apiContract.ID) {
	writeJSON(w, h.service.ReconcileStorePurchase(id))
}

func (h *Handler) GetMarketPreview(w http.ResponseWriter, _ *http.Request, params apiContract.GetMarketPreviewParams) {
	preview, err := h.service.MarketPreview(params.MarketName)
	if err != nil {
		writeError(w, http.StatusBadGateway, err.Error())
		return
	}
	writeJSON(w, preview)
}

func (h *Handler) ListSteamInventoryServiceGames(w http.ResponseWriter, r *http.Request) {
	ctx, cancel := context.WithTimeout(r.Context(), 30*time.Second)
	defer cancel()
	writeJSON(w, h.service.SteamInventoryServiceGames(ctx))
}
