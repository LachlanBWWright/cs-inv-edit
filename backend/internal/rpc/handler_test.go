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

func TestOperationRouteDispatchesSettings(t *testing.T) {
	service := app.NewService()
	handler := NewHandler(service)

	req := httptest.NewRequest(http.MethodPost, "/operations/settings", bytes.NewBufferString(`{"validationMode":false}`))
	req.Header.Set("Content-Type", "application/json")
	rr := httptest.NewRecorder()
	handler.ServeHTTP(rr, req)

	if rr.Code != http.StatusOK {
		t.Fatalf("unexpected status: %d body=%q", rr.Code, rr.Body.String())
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

func TestDisabledMultiGameInventoryRouteIsBackendEnforced(t *testing.T) {
	service := app.NewService()
	handler := NewHandler(service)
	req := httptest.NewRequest(http.MethodGet, "/games/tf2/inventory", nil)
	rr := httptest.NewRecorder()
	handler.ServeHTTP(rr, req)
	if rr.Code != http.StatusForbidden {
		t.Fatalf("disabled TF2 status=%d body=%q", rr.Code, rr.Body.String())
	}
	cs2Req := httptest.NewRequest(http.MethodGet, "/inventory", nil)
	cs2RR := httptest.NewRecorder()
	handler.ServeHTTP(cs2RR, cs2Req)
	if cs2RR.Code != http.StatusOK {
		t.Fatalf("CS2 route regressed: status=%d body=%q", cs2RR.Code, cs2RR.Body.String())
	}
}

func TestUnknownMultiGameInventoryRouteIsRejected(t *testing.T) {
	service := app.NewService()
	handler := NewHandler(service)
	req := httptest.NewRequest(http.MethodGet, "/games/cs2/inventory", nil)
	rr := httptest.NewRecorder()
	handler.ServeHTTP(rr, req)
	if rr.Code != http.StatusNotFound {
		t.Fatalf("unknown game status=%d body=%q", rr.Code, rr.Body.String())
	}
}

func TestMultiGameRoutesEnforceReadOnlyHTTPMethods(t *testing.T) {
	service := app.NewService()
	handler := NewHandler(service)
	for _, test := range []struct{ method, path string }{{http.MethodPost, "/games/tf2/inventory"}, {http.MethodGet, "/games/tf2/inventory/refresh"}} {
		req := httptest.NewRequest(test.method, test.path, nil)
		rr := httptest.NewRecorder()
		handler.ServeHTTP(rr, req)
		if rr.Code != http.StatusMethodNotAllowed {
			t.Fatalf("%s %s status=%d", test.method, test.path, rr.Code)
		}
	}
}
