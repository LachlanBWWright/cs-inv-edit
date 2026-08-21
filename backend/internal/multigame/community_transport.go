package multigame

import (
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"strings"
	"time"
)

func (p *Provider) fetchText(ctx context.Context, endpoint string) (string, error) {
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, endpoint, nil)
	if err != nil {
		return "", err
	}
	resp, err := p.do(req)
	if err != nil {
		return "", err
	}
	defer resp.Body.Close()
	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		return "", fmt.Errorf("%s returned HTTP %d", endpoint, resp.StatusCode)
	}
	body, err := io.ReadAll(resp.Body)
	if err != nil {
		return "", err
	}
	return string(body), nil
}

func (p *Provider) fetchPage(ctx context.Context, steamID string, game Game, startAssetID, webAccessToken string) (page, error) {
	values := url.Values{"l": {"english"}, "count": {"2000"}}
	if startAssetID != "" {
		values.Set("start_assetid", startAssetID)
	}
	endpoint := fmt.Sprintf("%s/inventory/%s/%d/%d?%s", strings.TrimRight(p.communityBase, "/"), url.PathEscape(steamID), game.AppID, game.ContextID, values.Encode())
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, endpoint, nil)
	if err != nil {
		return page{}, err
	}
	req.Header.Set("User-Agent", "Mozilla/5.0 (compatible; cs-inv-edit/0.0; multi-game inventory lookup)")
	if webAccessToken != "" {
		req.AddCookie(&http.Cookie{Name: "steamLoginSecure", Value: url.QueryEscape(steamID + "||" + webAccessToken), Path: "/", Secure: true, HttpOnly: true})
	}
	resp, err := p.do(req)
	if err != nil {
		return page{}, fmt.Errorf("fetch %s inventory: %w", game.ID, err)
	}
	defer resp.Body.Close()
	if resp.StatusCode == http.StatusForbidden {
		return page{}, fmt.Errorf("%s Steam Community inventory is private or unavailable", game.ID)
	}
	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		return page{}, fmt.Errorf("fetch %s inventory returned HTTP %d", game.ID, resp.StatusCode)
	}
	var result page
	if err := json.NewDecoder(resp.Body).Decode(&result); err != nil {
		return page{}, fmt.Errorf("decode %s inventory: %w", game.ID, err)
	}
	if !bool(result.Success) {
		return page{}, fmt.Errorf("Steam returned an unsuccessful %s inventory response", game.ID)
	}
	if result.Assets == nil {
		result.Assets = []asset{}
	}
	if result.Descriptions == nil {
		result.Descriptions = []description{}
	}
	return result, nil
}

func (p *Provider) do(req *http.Request) (*http.Response, error) {
	var lastErr error
	for attempt := 0; attempt < 3; attempt++ {
		resp, err := p.client.Do(req.Clone(req.Context()))
		if err == nil && resp.StatusCode != http.StatusTooManyRequests && resp.StatusCode < 500 {
			return resp, nil
		}
		if resp != nil {
			_ = resp.Body.Close()
			lastErr = fmt.Errorf("%s returned HTTP %d", req.URL.String(), resp.StatusCode)
		} else {
			lastErr = err
		}
		if attempt == 2 {
			break
		}
		timer := time.NewTimer(time.Duration(250*(1<<attempt)) * time.Millisecond)
		select {
		case <-req.Context().Done():
			timer.Stop()
			return nil, req.Context().Err()
		case <-timer.C:
		}
	}
	return nil, lastErr
}
