package dataservice

import (
	"context"
	"encoding/json"
	"net/http"
	"strings"
	"time"

	"cs-inv-edit/backend/pricescanner"
)

type Handler struct {
	prices         *PriceCache
	mux            *http.ServeMux
	allowedOrigins map[string]bool
}

type priceQuery struct {
	MarketNames []string `json:"marketNames"`
	Currency    string   `json:"currency"`
	AppID       int      `json:"appId,omitempty"`
}

func NewHandler(prices *PriceCache) http.Handler {
	return NewHandlerWithOrigins(prices, []string{"*"})
}

func NewHandlerWithOrigins(prices *PriceCache, origins []string) http.Handler {
	allowedOrigins := make(map[string]bool, len(origins))
	for _, origin := range origins {
		if origin = strings.TrimSpace(origin); origin != "" {
			allowedOrigins[origin] = true
		}
	}
	handler := &Handler{prices: prices, mux: http.NewServeMux(), allowedOrigins: allowedOrigins}
	handler.mux.HandleFunc("/healthz", handler.health)
	handler.mux.HandleFunc("/readyz", handler.health)
	handler.mux.HandleFunc("/v1/providers", handler.providers)
	handler.mux.HandleFunc("/v1/prices/query", handler.queryPrices)
	return handler.withCORS(handler.mux)
}

func (h *Handler) health(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		writeError(w, http.StatusMethodNotAllowed, "health route requires GET")
		return
	}
	writeJSON(w, map[string]any{"status": "ok", "service": "cs-inv-edit-data", "version": "0.1.0", "time": time.Now().UTC().Format(time.RFC3339)})
}

func (h *Handler) providers(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		writeError(w, http.StatusMethodNotAllowed, "provider route requires GET")
		return
	}
	writeJSON(w, map[string]any{"providers": []string{"steam", "skinport", "csfloat", "waxpeer", "marketcsgo", "marketdota", "pricedb"}})
}

func (h *Handler) queryPrices(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		writeError(w, http.StatusMethodNotAllowed, "price query requires POST")
		return
	}
	var input priceQuery
	decoder := json.NewDecoder(http.MaxBytesReader(w, r.Body, 64<<10))
	decoder.DisallowUnknownFields()
	if err := decoder.Decode(&input); err != nil {
		writeError(w, http.StatusBadRequest, "invalid price query: "+err.Error())
		return
	}
	ctx, cancel := context.WithTimeout(r.Context(), 25*time.Second)
	defer cancel()
	query := pricescanner.Query{MarketNames: input.MarketNames, Currency: input.Currency, AppID: input.AppID}
	result, err := h.prices.Query(ctx, query)
	if err != nil {
		writeError(w, http.StatusBadRequest, err.Error())
		return
	}
	result.ServedAt = time.Now().UTC().Format(time.RFC3339)
	writeJSON(w, result)
}

func (h *Handler) withCORS(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		origin := r.Header.Get("Origin")
		if h.allowedOrigins["*"] {
			w.Header().Set("Access-Control-Allow-Origin", "*")
		} else if h.allowedOrigins[origin] {
			w.Header().Set("Access-Control-Allow-Origin", origin)
			w.Header().Set("Vary", "Origin")
		}
		if w.Header().Get("Access-Control-Allow-Origin") != "" {
			w.Header().Set("Access-Control-Allow-Headers", "Content-Type")
			w.Header().Set("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
		}
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
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(map[string]string{"error": message})
}
