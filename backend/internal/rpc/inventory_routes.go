package rpc

import (
	"net/http"

	apiContract "cs-inv-edit/backend/internal/api"
	"cs-inv-edit/backend/internal/operations"
)

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

func (h *Handler) GetCs2Features(w http.ResponseWriter, r *http.Request) {
	writeJSON(w, h.service.CS2FeaturesWithMetadata(r.Context()))
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
