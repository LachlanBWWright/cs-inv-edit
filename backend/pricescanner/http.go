package pricescanner

import (
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"strings"

	"github.com/andybalholm/brotli"
)

type HTTPDoer interface {
	Do(*http.Request) (*http.Response, error)
}

func getJSON(ctx context.Context, client HTTPDoer, url string, headers map[string]string, target any) error {
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, url, nil)
	if err != nil {
		return fmt.Errorf("build request: %w", err)
	}
	for key, value := range headers {
		req.Header.Set(key, value)
	}
	response, err := client.Do(req)
	if err != nil {
		return fmt.Errorf("request: %w", err)
	}
	defer response.Body.Close()
	if response.StatusCode < 200 || response.StatusCode >= 300 {
		body, _ := io.ReadAll(io.LimitReader(response.Body, 512))
		return fmt.Errorf("HTTP %d: %s", response.StatusCode, string(body))
	}
	var body io.Reader = response.Body
	if strings.EqualFold(response.Header.Get("Content-Encoding"), "br") {
		body = brotli.NewReader(response.Body)
	}
	if err := json.NewDecoder(io.LimitReader(body, 32<<20)).Decode(target); err != nil {
		return fmt.Errorf("decode response: %w", err)
	}
	return nil
}
