//go:build js && wasm

package main

import (
	"bytes"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"syscall/js"
	"time"

	"cs-inv-edit/backend/internal/app"
	"cs-inv-edit/backend/internal/rpc"
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

type backendResponse struct {
	Status int    `json:"status"`
	Body   string `json:"body"`
}

func requestHandler(handler http.Handler) js.Func {
	return js.FuncOf(func(_ js.Value, args []js.Value) any {
		return js.Global().Get("Promise").New(js.FuncOf(func(_ js.Value, promiseArgs []js.Value) any {
			resolve := promiseArgs[0]
			if len(args) < 2 {
				resolve.Invoke(`{"status":400,"body":"missing method or path"}`)
				return nil
			}
			method := args[0].String()
			path := args[1].String()
			body := ""
			if len(args) > 2 && !args[2].IsNull() && !args[2].IsUndefined() {
				body = args[2].String()
			}
			go func() {
				request := httptest.NewRequest(method, path, bytes.NewBufferString(body))
				request.Header.Set("Content-Type", "application/json")
				response := httptest.NewRecorder()
				handler.ServeHTTP(response, request)
				encoded, err := json.Marshal(backendResponse{Status: response.Code, Body: response.Body.String()})
				if err != nil {
					resolve.Invoke(`{"status":500,"body":"failed to encode response"}`)
					return
				}
				resolve.Invoke(string(encoded))
			}()
			return nil
		}))
	})
}

func main() {
	service := app.NewService()
	handler := rpc.NewHandler(service)
	js.Global().Set("csInvEditWasmBackend", map[string]any{
		"health":  js.FuncOf(health),
		"request": requestHandler(handler),
	})
	select {}
}
