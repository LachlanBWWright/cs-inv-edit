package transport

import (
	"context"
	"io"
	"net/http"
	"strings"
	"testing"

	"github.com/Lucino772/envelop/pkg/steam/steampb"
	"google.golang.org/protobuf/proto"
)

type roundTripFunc func(*http.Request) (*http.Response, error)

func (fn roundTripFunc) RoundTrip(request *http.Request) (*http.Response, error) {
	return fn(request)
}

func TestPutSteamCloudUGCPreservesRequest(t *testing.T) {
	client := NewSteamGCClient()
	client.httpClient = &http.Client{Transport: roundTripFunc(func(request *http.Request) (*http.Response, error) {
		if request.Method != http.MethodPut || request.URL.String() != "https://uploads.example.test/signed/object?token=a%2Fb" {
			t.Fatalf("request = %s %s", request.Method, request.URL)
		}
		if request.Header.Values("X-Signed")[0] != "one" || request.Header.Values("X-Signed")[1] != "two" {
			t.Fatalf("headers = %#v", request.Header)
		}
		body, err := io.ReadAll(request.Body)
		if err != nil {
			t.Fatal(err)
		}
		if string(body) != "png bytes" || request.ContentLength != int64(len(body)) {
			t.Fatalf("body/content length = %q/%d", body, request.ContentLength)
		}
		return &http.Response{StatusCode: http.StatusNoContent, Body: io.NopCloser(strings.NewReader("")), Header: make(http.Header)}, nil
	})}
	begin := &steampb.CCloud_BeginUGCUpload_Response{
		UseHttps: proto.Bool(true),
		UrlHost:  proto.String("uploads.example.test"),
		UrlPath:  proto.String("/signed/object?token=a%2Fb"),
		RequestHeaders: []*steampb.CCloud_BeginUGCUpload_Response_HTTPHeaders{
			{Name: proto.String("X-Signed"), Value: proto.String("one")},
			{Name: proto.String("X-Signed"), Value: proto.String("two")},
		},
	}
	if err := client.putSteamCloudUGC(context.Background(), begin, []byte("png bytes")); err != nil {
		t.Fatal(err)
	}
}

func TestPutSteamCloudUGCRejectsUnsafeEndpointAndStatus(t *testing.T) {
	client := NewSteamGCClient()
	if err := client.putSteamCloudUGC(context.Background(), &steampb.CCloud_BeginUGCUpload_Response{UseHttps: proto.Bool(false)}, nil); err == nil {
		t.Fatal("non-HTTPS endpoint was accepted")
	}
	client.httpClient = &http.Client{Transport: roundTripFunc(func(_ *http.Request) (*http.Response, error) {
		return &http.Response{StatusCode: http.StatusForbidden, Body: io.NopCloser(strings.NewReader("denied")), Header: make(http.Header)}, nil
	})}
	begin := &steampb.CCloud_BeginUGCUpload_Response{UseHttps: proto.Bool(true), UrlHost: proto.String("uploads.example.test"), UrlPath: proto.String("/object")}
	if err := client.putSteamCloudUGC(context.Background(), begin, []byte("x")); err == nil || !strings.Contains(err.Error(), "403") {
		t.Fatalf("non-2xx error = %v", err)
	}
}

func TestValidatedSteamUploadURL(t *testing.T) {
	valid, err := validatedSteamUploadURL("uploads.example.test", "/object?a=b%2Fc")
	if err != nil || valid != "https://uploads.example.test/object?a=b%2Fc" {
		t.Fatalf("valid URL = %q, %v", valid, err)
	}
	for _, input := range [][2]string{{"user@host", "/x"}, {"host:443", "/x"}, {"host", "x"}, {"host", "/x#fragment"}} {
		if _, err := validatedSteamUploadURL(input[0], input[1]); err == nil {
			t.Fatalf("unsafe endpoint accepted: %#v", input)
		}
	}
}
