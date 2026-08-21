package econ

import (
	"context"
	"io"
	"net/http"
	"strings"
	"testing"
)

func TestInventoryDescriptionLookupUsesAcceptedPageSizeAndExpandsInspectURL(t *testing.T) {
	provider := NewProvider()
	provider.client = &http.Client{Transport: marketRoundTripFunc(func(request *http.Request) (*http.Response, error) {
		if got := request.URL.Query().Get("count"); got != "2000" {
			t.Fatalf("inventory page count = %q, want 2000", got)
		}
		if got := request.URL.Query().Get("norender"); got != "1" {
			t.Fatalf("norender = %q, want 1", got)
		}
		body := `{"success":1,"assets":[{"assetid":"38122655128","classid":"10","instanceid":"20"}],"asset_properties":[{"assetid":"38122655128","asset_properties":[{"propertyid":6,"string_value":"MASKED-CERTIFICATE"}]}],"descriptions":[{"classid":"10","instanceid":"20","name":"Zeus x27","actions":[{"name":"Inspect in Game...","link":"steam://run/730//+csgo_econ_action_preview%20%propid:6%"}]}]}`
		return &http.Response{StatusCode: http.StatusOK, Header: http.Header{}, Body: io.NopCloser(strings.NewReader(body))}, nil
	})}
	descriptions, err := provider.LoadInventoryDescriptions(context.Background(), "76561198000000000")
	if err != nil {
		t.Fatal(err)
	}
	want := "steam://run/730//+csgo_econ_action_preview%20MASKED-CERTIFICATE"
	if got := descriptions["38122655128"].InspectURL; got != want {
		t.Fatalf("inspect URL = %q, want %q", got, want)
	}
}
