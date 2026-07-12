//go:build js && wasm

package main

import (
	"encoding/json"
	"syscall/js"
	"time"
)

type healthStatus struct {
	Status  string `json:"status"`
	Service string `json:"service"`
	Version string `json:"version"`
	Time    string `json:"time"`
}

func health(this js.Value, args []js.Value) any {
	payload := healthStatus{
		Status:  "ok",
		Service: "cs2-wasm-backend",
		Version: "0.0.0",
		Time:    time.Now().UTC().Format(time.RFC3339Nano),
	}
	encoded, err := json.Marshal(payload)
	if err != nil {
		return "{}"
	}
	return string(encoded)
}

func main() {
	js.Global().Set("csInvEditWasmBackend", map[string]any{
		"health": js.FuncOf(health),
	})
	select {}
}
