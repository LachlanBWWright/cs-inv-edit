package dataservice

import (
	"bytes"
	"context"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"cs-inv-edit/backend/pricescanner"
)

type staticScanner struct{}

func (staticScanner) Scan(context.Context, pricescanner.Query) (pricescanner.Result, error) {
	return pricescanner.Result{Currency: "USD", Items: []pricescanner.ItemResult{}, Listings: []pricescanner.Quote{}, Errors: []pricescanner.ProviderError{}, ScannedAt: "now"}, nil
}

func TestPriceQuery(t *testing.T) {
	handler := NewHandler(NewPriceCache(staticScanner{}, time.Minute))
	request := httptest.NewRequest(http.MethodPost, "/v1/prices/query", bytes.NewBufferString(`{"marketNames":["Item"],"currency":"USD","appId":730}`))
	recorder := httptest.NewRecorder()
	handler.ServeHTTP(recorder, request)
	if recorder.Code != http.StatusOK {
		t.Fatalf("status=%d body=%s", recorder.Code, recorder.Body.String())
	}
}

func TestPriceQueryRejectsUnknownFields(t *testing.T) {
	handler := NewHandler(NewPriceCache(staticScanner{}, time.Minute))
	request := httptest.NewRequest(http.MethodPost, "/v1/prices/query", bytes.NewBufferString(`{"marketNames":["Item"],"unknown":true}`))
	recorder := httptest.NewRecorder()
	handler.ServeHTTP(recorder, request)
	if recorder.Code != http.StatusBadRequest {
		t.Fatalf("status=%d, want 400", recorder.Code)
	}
}

func TestHealthRejectsPost(t *testing.T) {
	handler := NewHandler(NewPriceCache(staticScanner{}, time.Minute))
	request := httptest.NewRequest(http.MethodPost, "/healthz", nil)
	recorder := httptest.NewRecorder()
	handler.ServeHTTP(recorder, request)
	if recorder.Code != http.StatusMethodNotAllowed {
		t.Fatalf("status=%d, want 405", recorder.Code)
	}
}

func TestPreflightIncludesCORSHeaders(t *testing.T) {
	handler := NewHandler(NewPriceCache(staticScanner{}, time.Minute))
	request := httptest.NewRequest(http.MethodOptions, "/v1/prices/query", nil)
	recorder := httptest.NewRecorder()
	handler.ServeHTTP(recorder, request)
	if recorder.Code != http.StatusNoContent || recorder.Header().Get("Access-Control-Allow-Origin") != "*" {
		t.Fatalf("status=%d origin=%q", recorder.Code, recorder.Header().Get("Access-Control-Allow-Origin"))
	}
}

func TestConfiguredCORSOriginDoesNotAllowOtherOrigins(t *testing.T) {
	handler := NewHandlerWithOrigins(NewPriceCache(staticScanner{}, time.Minute), []string{"https://app.example"})
	request := httptest.NewRequest(http.MethodOptions, "/v1/prices/query", nil)
	request.Header.Set("Origin", "https://other.example")
	recorder := httptest.NewRecorder()
	handler.ServeHTTP(recorder, request)
	if recorder.Header().Get("Access-Control-Allow-Origin") != "" {
		t.Fatalf("unexpected allowed origin %q", recorder.Header().Get("Access-Control-Allow-Origin"))
	}
}
