package main

import (
	"log"
	"net/http"
	"os"

	"cs-inv-edit/backend/internal/app"
	"cs-inv-edit/backend/internal/rpc"
)

func main() {
	addr := os.Getenv("CS2_BACKEND_ADDR")
	if addr == "" {
		addr = "127.0.0.1:7331"
	}

	service := app.NewService()
	handler := rpc.NewHandler(service)

	log.Printf("cs2-backend listening on http://%s", addr)
	if err := http.ListenAndServe(addr, handler); err != nil {
		log.Fatal(err)
	}
}
