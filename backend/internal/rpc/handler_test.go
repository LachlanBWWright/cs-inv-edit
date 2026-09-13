package rpc

import (
	"bytes"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"cs-inv-edit/backend/internal/app"
)

func TestStoreRouteAlwaysSerializesOffersAsArray(t *testing.T) {
	service := app.NewService()
	handler := NewHandler(service)
	req := httptest.NewRequest(http.MethodGet, "/store", nil)
	rr := httptest.NewRecorder()
	handler.ServeHTTP(rr, req)
	if rr.Code != http.StatusOK {
		t.Fatalf("status=%d body=%q", rr.Code, rr.Body.String())
	}
	var payload struct {
		Offers  json.RawMessage `json:"offers"`
		Message string          `json:"message"`
	}
	if err := json.Unmarshal(rr.Body.Bytes(), &payload); err != nil {
		t.Fatal(err)
	}
	if string(payload.Offers) != "[]" {
		t.Fatalf("offers=%s, want []", payload.Offers)
	}
	if !strings.Contains(payload.Message, "Connect Steam") {
		t.Fatalf("message=%q, want connection guidance", payload.Message)
	}
}

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

func TestOperationRouteRejectsMalformedJSON(t *testing.T) {
	handler := NewHandler(app.NewService())
	req := httptest.NewRequest(http.MethodPost, "/operations/settings", bytes.NewBufferString("{"))
	requestRecorder := httptest.NewRecorder()
	handler.ServeHTTP(requestRecorder, req)
	if requestRecorder.Code != http.StatusBadRequest {
		t.Fatalf("unexpected status=%d body=%q", requestRecorder.Code, requestRecorder.Body.String())
	}
}

func TestDirectOperationRouteRejectsMalformedJSON(t *testing.T) {
	handler := NewHandler(app.NewService())
	req := httptest.NewRequest(http.MethodPost, "/armory/redeem", bytes.NewBufferString("{"))
	requestRecorder := httptest.NewRecorder()
	handler.ServeHTTP(requestRecorder, req)
	if requestRecorder.Code != http.StatusBadRequest {
		t.Fatalf("unexpected status=%d body=%q", requestRecorder.Code, requestRecorder.Body.String())
	}
}

func TestOperationRoutesRejectTrailingJSON(t *testing.T) {
	handler := NewHandler(app.NewService())
	req := httptest.NewRequest(http.MethodPost, "/operations/settings", strings.NewReader(`{} {}`))
	rr := httptest.NewRecorder()
	handler.ServeHTTP(rr, req)
	if rr.Code != http.StatusBadRequest {
		t.Fatalf("unexpected status=%d body=%q", rr.Code, rr.Body.String())
	}
}

func TestOperationRoutesRejectOversizedBodies(t *testing.T) {
	handler := NewHandler(app.NewService())
	req := httptest.NewRequest(
		http.MethodPost,
		"/operations/settings",
		strings.NewReader(`{"payload":"`+strings.Repeat("x", 256<<10)+`"}`),
	)
	rr := httptest.NewRecorder()
	handler.ServeHTTP(rr, req)
	if rr.Code != http.StatusBadRequest {
		t.Fatalf("unexpected status=%d body=%q", rr.Code, rr.Body.String())
	}
}

func TestCORSAllowsLocalOriginsAndRejectsUnknownOrigins(t *testing.T) {
	handler := NewHandler(app.NewService())
	for _, test := range []struct {
		origin string
		allow  string
	}{
		{origin: "http://localhost:5173", allow: "http://localhost:5173"},
		{origin: "http://localhost.evil.example:5173", allow: ""},
		{origin: "http://127.0.0.1.evil.example:5173", allow: ""},
		{origin: "https://untrusted.example", allow: ""},
	} {
		req := httptest.NewRequest(http.MethodGet, "/health", nil)
		req.Header.Set("Origin", test.origin)
		rr := httptest.NewRecorder()
		handler.ServeHTTP(rr, req)
		if got := rr.Header().Get("Access-Control-Allow-Origin"); got != test.allow {
			t.Fatalf("origin %q allow header=%q, want %q", test.origin, got, test.allow)
		}
	}
}

func TestReadRoutesReturnJSONWithoutSteamSession(t *testing.T) {
	handler := NewHandler(app.NewService())
	paths := []string{
		"/health",
		"/inventory",
		"/armory",
		"/store",
		"/games/tf2/inventory",
		"/games/tf2/store",
		"/games/tf2/features",
		"/games/cs2/features",
		"/trades",
		"/trade-accounts",
		"/operations",
		"/events",
		"/settings",
		"/steam/status",
		"/steam-inventory-service/games",
	}
	for _, path := range paths {
		req := httptest.NewRequest(http.MethodGet, path, nil)
		rr := httptest.NewRecorder()
		handler.ServeHTTP(rr, req)
		if rr.Code != http.StatusOK {
			t.Fatalf("%s status=%d body=%q", path, rr.Code, rr.Body.String())
		}
		if !strings.Contains(rr.Header().Get("Content-Type"), "application/json") {
			t.Fatalf("%s content-type=%q", path, rr.Header().Get("Content-Type"))
		}
		var payload any
		if err := json.Unmarshal(rr.Body.Bytes(), &payload); err != nil {
			t.Fatalf("%s returned invalid JSON: %v", path, err)
		}
	}
}

func TestMutationRoutesRemainSafeWithoutSteamSession(t *testing.T) {
	handler := NewHandler(app.NewService())
	requests := []struct {
		method string
		path   string
		body   string
	}{
		{http.MethodPost, "/inventory/refresh", "{}"},
		{http.MethodPost, "/games/tf2/inventory/refresh", "{}"},
		{http.MethodPost, "/armory/refresh", "{}"},
		{http.MethodPost, "/store/refresh", "{}"},
		{http.MethodPost, "/games/tf2/store/refresh", "{}"},
		{http.MethodPost, "/steam/disconnect", "{}"},
		{http.MethodPost, "/nametags/apply", `{"itemId":"fixture-item","name":"fixture"}`},
	}
	for _, test := range requests {
		req := httptest.NewRequest(test.method, test.path, strings.NewReader(test.body))
		req.Header.Set("Content-Type", "application/json")
		rr := httptest.NewRecorder()
		handler.ServeHTTP(rr, req)
		if rr.Code < http.StatusOK || rr.Code >= http.StatusInternalServerError {
			t.Fatalf("%s %s status=%d body=%q", test.method, test.path, rr.Code, rr.Body.String())
		}
	}
}

func TestCORSPreflightDoesNotReachService(t *testing.T) {
	handler := NewHandler(app.NewService())
	req := httptest.NewRequest(http.MethodOptions, "/health", nil)
	req.Header.Set("Origin", "http://127.0.0.1:5173")
	rr := httptest.NewRecorder()
	handler.ServeHTTP(rr, req)
	if rr.Code != http.StatusNoContent {
		t.Fatalf("preflight status=%d body=%q", rr.Code, rr.Body.String())
	}
	if got := rr.Header().Get("Access-Control-Allow-Methods"); got != "GET,POST,OPTIONS" {
		t.Fatalf("allow methods=%q", got)
	}
}

func TestBackendAuthRejectsMissingAndInvalidTokens(t *testing.T) {
	t.Setenv("CS2_BACKEND_AUTH_TOKEN", "test-token")
	handler := NewHandler(app.NewService())
	for _, token := range []string{"", "wrong-token"} {
		req := httptest.NewRequest(http.MethodGet, "/health", nil)
		if token != "" {
			req.Header.Set("Authorization", "Bearer "+token)
		}
		rr := httptest.NewRecorder()
		handler.ServeHTTP(rr, req)
		if rr.Code != http.StatusUnauthorized {
			t.Fatalf("token %q status=%d, want unauthorized", token, rr.Code)
		}
	}
}

func TestBackendAuthAcceptsBearerAndWebSocketTokens(t *testing.T) {
	t.Setenv("CS2_BACKEND_AUTH_TOKEN", "test-token")
	handler := NewHandler(app.NewService())
	for _, request := range []*http.Request{
		httptest.NewRequest(http.MethodGet, "/health", nil),
		httptest.NewRequest(http.MethodGet, "/health?token=test-token", nil),
	} {
		if request.URL.Query().Get("token") == "" {
			request.Header.Set("Authorization", "Bearer test-token")
		}
		rr := httptest.NewRecorder()
		handler.ServeHTTP(rr, request)
		if rr.Code != http.StatusOK {
			t.Fatalf("authenticated status=%d body=%q", rr.Code, rr.Body.String())
		}
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
	settings := service.Settings()
	settings.FeatureFlags.EnableTF2Inventory = false
	service.UpdateSettings(settings)
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

func TestTF2InventoryDefaultsEnabledAndSerializesDiagnosticsAsArray(t *testing.T) {
	service := app.NewService()
	handler := NewHandler(service)
	req := httptest.NewRequest(http.MethodGet, "/games/tf2/inventory", nil)
	rr := httptest.NewRecorder()
	handler.ServeHTTP(rr, req)
	if rr.Code != http.StatusOK {
		t.Fatalf("TF2 status=%d body=%q", rr.Code, rr.Body.String())
	}
	var payload struct {
		Diagnostics json.RawMessage `json:"diagnostics"`
	}
	if err := json.Unmarshal(rr.Body.Bytes(), &payload); err != nil {
		t.Fatal(err)
	}
	if string(payload.Diagnostics) != "[]" {
		t.Fatalf("diagnostics=%s, want []", payload.Diagnostics)
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

func TestSteamInventoryServiceRouteValidatesAppID(t *testing.T) {
	handler := NewHandler(app.NewService())
	for _, path := range []string{"/steam-inventory-service/0", "/steam-inventory-service/not-a-number"} {
		req := httptest.NewRequest(http.MethodGet, path, nil)
		rr := httptest.NewRecorder()
		handler.ServeHTTP(rr, req)
		if rr.Code != http.StatusBadRequest {
			t.Fatalf("%s status=%d body=%q", path, rr.Code, rr.Body.String())
		}
	}
}

func TestSteamInventoryServiceDisconnectedSnapshotIsDistinct(t *testing.T) {
	handler := NewHandler(app.NewService())
	req := httptest.NewRequest(http.MethodGet, "/steam-inventory-service/480", nil)
	rr := httptest.NewRecorder()
	handler.ServeHTTP(rr, req)
	if rr.Code != http.StatusOK {
		t.Fatalf("status=%d body=%q", rr.Code, rr.Body.String())
	}
	var payload struct {
		Game  string `json:"game"`
		AppID uint32 `json:"appId"`
		Items []any  `json:"items"`
	}
	if err := json.Unmarshal(rr.Body.Bytes(), &payload); err != nil {
		t.Fatal(err)
	}
	if payload.Game != "steam-service" || payload.AppID != 480 || len(payload.Items) != 0 {
		t.Fatalf("payload=%#v", payload)
	}
}
