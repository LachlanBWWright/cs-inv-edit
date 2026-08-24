package main

import (
	"encoding/json"
	"log"
	"net/http"
	"os"
	"strings"
	"time"

	"cs-inv-edit/backend/internal/dataservice"
	"cs-inv-edit/backend/pricescanner"
)

func main() {
	address := os.Getenv("CSINV_DATA_ADDR")
	if address == "" {
		address = "127.0.0.1:7332"
	}
	multipliers := map[string]float64{}
	if configured := strings.TrimSpace(os.Getenv("CSINV_PRICE_MULTIPLIERS")); configured != "" {
		if err := json.Unmarshal([]byte(configured), &multipliers); err != nil {
			log.Fatalf("invalid CSINV_PRICE_MULTIPLIERS: %v", err)
		}
	}
	scanner := pricescanner.NewWithValuationPolicy(pricescanner.ValuationPolicy{
		BaselineSource: "steam",
		Multipliers:    multipliers,
	},
		pricescanner.NewSteamProvider(nil),
		pricescanner.NewSkinportProvider(nil),
		pricescanner.NewCSFloatProvider(nil, os.Getenv("CSFLOAT_API_KEY")),
		pricescanner.NewWaxpeerProvider(nil),
		pricescanner.NewMarketCSGOProvider(nil),
		pricescanner.NewMarketDotaProvider(nil),
		pricescanner.NewPriceDBProvider(nil),
	)
	origins := []string{"*"}
	if configured := strings.TrimSpace(os.Getenv("CSINV_DATA_ALLOWED_ORIGINS")); configured != "" {
		origins = strings.Split(configured, ",")
	}
	var store dataservice.ObservationStore
	historyPath := strings.TrimSpace(os.Getenv("CSINV_PRICE_HISTORY_PATH"))
	if historyPath == "" {
		historyPath = "data/price-observations.jsonl"
	}
	createdStore, err := dataservice.NewJSONLObservationStore(historyPath)
	if err != nil {
		log.Fatalf("initialize price history: %v", err)
	}
	store = createdStore
	handler := dataservice.NewHandlerWithOrigins(dataservice.NewPriceCacheWithStore(scanner, 5*time.Minute, store), origins)
	log.Printf("data-service listening on http://%s", address)
	if err := http.ListenAndServe(address, handler); err != nil {
		log.Fatal(err)
	}
}
