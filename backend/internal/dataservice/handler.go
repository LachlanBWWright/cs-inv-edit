package dataservice

import (
	"context"
	"encoding/json"
	"net/http"
	"strings"
	"time"

	dataContract "cs-inv-edit/backend/internal/dataapi"
	"cs-inv-edit/backend/pricescanner"
)

type Handler struct {
	prices         *PriceCache
	mux            *http.ServeMux
	allowedOrigins map[string]bool
}

var _ dataContract.ServerInterface = (*Handler)(nil)

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
	dataContract.HandlerFromMux(handler, handler.mux)
	return handler.withCORS(handler.mux)
}

func (h *Handler) GetHealth(w http.ResponseWriter, _ *http.Request) {
	h.writeHealth(w)
}

func (h *Handler) GetReadiness(w http.ResponseWriter, _ *http.Request) {
	h.writeHealth(w)
}

func (h *Handler) writeHealth(w http.ResponseWriter) {
	writeJSON(w, dataContract.DataServiceHealth{
		Status: dataContract.DataServiceHealthStatus("ok"), Service: dataContract.DataServiceHealthService("cs-inv-edit-data"),
		Version: "0.1.0", Time: time.Now().UTC(),
	})
}

func (h *Handler) ListProviders(w http.ResponseWriter, _ *http.Request) {
	writeJSON(w, dataContract.ProviderList{Providers: []string{"steam", "skinport", "csfloat", "waxpeer", "marketcsgo", "marketdota", "pricedb"}})
}

func (h *Handler) QueryPrices(w http.ResponseWriter, r *http.Request) {
	var input dataContract.PriceQuery
	decoder := json.NewDecoder(http.MaxBytesReader(w, r.Body, 64<<10))
	decoder.DisallowUnknownFields()
	if err := decoder.Decode(&input); err != nil {
		writeError(w, http.StatusBadRequest, "invalid price query: "+err.Error())
		return
	}
	ctx, cancel := context.WithTimeout(r.Context(), 25*time.Second)
	defer cancel()
	appID := 0
	if input.AppId != nil {
		appID = *input.AppId
	}
	query := pricescanner.Query{MarketNames: input.MarketNames, Currency: input.Currency, AppID: appID}
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
