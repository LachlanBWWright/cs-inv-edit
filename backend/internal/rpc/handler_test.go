package rpc

import (
	"bytes"
	"net/http"
	"net/http/httptest"
	"testing"

	"cs-inv-edit/backend/internal/app"
)

func TestHealthRoute(t *testing.T) {
	service := app.NewService()
	handler := NewHandler(service)

	req := httptest.NewRequest(http.MethodGet, "/health", nil)
	rr := httptest.NewRecorder()
	handler.ServeHTTP(rr, req)

	if rr.Code != http.StatusOK {
		t.Fatalf("unexpected status: %d", rr.Code)
	}
	if rr.Header().Get("Content-Type") == "" {
		t.Fatal("expected content type")
	}
}

func TestOperationsRouteRejectsMissingType(t *testing.T) {
	service := app.NewService()
	handler := NewHandler(service)

	req := httptest.NewRequest(http.MethodPost, "/operations/", nil)
	rr := httptest.NewRecorder()
	handler.ServeHTTP(rr, req)

	if rr.Code != http.StatusBadRequest {
		t.Fatalf("unexpected status: %d", rr.Code)
	}
}

func TestNameTagApplyRoute(t *testing.T) {
	service := app.NewService()
	handler := NewHandler(service)

	req := httptest.NewRequest(http.MethodPost, "/nametags/apply", bytes.NewBufferString(`{"itemId":"1"}`))
	req.Header.Set("Content-Type", "application/json")
	rr := httptest.NewRecorder()
	handler.ServeHTTP(rr, req)

	if rr.Code != http.StatusOK {
		t.Fatalf("unexpected status: %d", rr.Code)
	}
}
