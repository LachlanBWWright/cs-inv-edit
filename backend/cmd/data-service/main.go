package main

import (
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
	scanner := pricescanner.New(
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
	handler := dataservice.NewHandlerWithOrigins(dataservice.NewPriceCache(scanner, 5*time.Minute), origins)
	log.Printf("data-service listening on http://%s", address)
	if err := http.ListenAndServe(address, handler); err != nil {
		log.Fatal(err)
	}
}
