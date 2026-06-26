package rpc

import (
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"cs-inv-edit/backend/internal/app"
)

func TestHandlerInventoryContract(t *testing.T) {
	handler := NewHandler(app.NewService())
	req := httptest.NewRequest(http.MethodGet, "/inventory", nil)
	rr := httptest.NewRecorder()
	handler.ServeHTTP(rr, req)
	if rr.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d", rr.Code)
	}
	if !strings.Contains(rr.Body.String(), "\"items\"") {
		t.Fatalf("expected inventory payload, got %s", rr.Body.String())
	}
}

func TestHandlerOperationContract(t *testing.T) {
	handler := NewHandler(app.NewService())
	req := httptest.NewRequest(http.MethodPost, "/operations/storage.move-in", strings.NewReader(`{"itemId":"2480000000000000000"}`))
	rr := httptest.NewRecorder()
	handler.ServeHTTP(rr, req)
	if rr.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d", rr.Code)
	}
	if !strings.Contains(rr.Body.String(), "\"operationId\"") {
		t.Fatalf("expected receipt payload, got %s", rr.Body.String())
	}
}
