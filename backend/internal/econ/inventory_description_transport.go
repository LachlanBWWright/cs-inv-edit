package econ

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"net/url"
)

func (p *Provider) fetchInventoryPage(ctx context.Context, steamID string, startAssetID string) (inventoryPage, error) {
	values := url.Values{"count": {"2000"}, "l": {"english"}, "norender": {"1"}}
	if startAssetID != "" {
		values.Set("start_assetid", startAssetID)
	}
	endpoint := fmt.Sprintf("https://steamcommunity.com/inventory/%s/730/2?%s", url.PathEscape(steamID), values.Encode())
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, endpoint, nil)
	if err != nil {
		return inventoryPage{}, err
	}
	resp, err := p.client.Do(req)
	if err != nil {
		return inventoryPage{}, fmt.Errorf("fetch Steam inventory descriptions: %w", err)
	}
	defer resp.Body.Close()
	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		return inventoryPage{}, fmt.Errorf("fetch Steam inventory descriptions returned HTTP %d", resp.StatusCode)
	}
	var page inventoryPage
	if err := json.NewDecoder(resp.Body).Decode(&page); err != nil {
		return inventoryPage{}, fmt.Errorf("decode Steam inventory descriptions: %w", err)
	}
	if !page.Success.Bool() {
		return inventoryPage{}, fmt.Errorf("Steam inventory descriptions response was not successful")
	}
	return page, nil
}
