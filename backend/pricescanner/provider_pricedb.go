package pricescanner

import (
	"context"
	"fmt"
	"net/http"
	"net/url"
	"time"
)

type PriceDBProvider struct {
	Client  HTTPDoer
	BaseURL string
}

func NewPriceDBProvider(client HTTPDoer) *PriceDBProvider {
	return &PriceDBProvider{Client: client, BaseURL: "https://pricedb.io/api/search"}
}

func (*PriceDBProvider) ID() string { return "backpacktf" }

func (p *PriceDBProvider) Scan(ctx context.Context, query Query) ([]Quote, error) {
	if query.AppID != 440 {
		return []Quote{}, nil
	}
	client := p.Client
	if client == nil {
		client = &http.Client{Timeout: 15 * time.Second}
	}
	quotes := make([]Quote, 0, len(query.MarketNames))
	for _, name := range query.MarketNames {
		var payload struct {
			Success bool `json:"success"`
			Data    struct {
				Results []struct {
					Name   string `json:"name"`
					Source string `json:"source"`
					Buy    struct {
						Keys  float64 `json:"keys"`
						Metal float64 `json:"metal"`
					} `json:"buy"`
					Sell struct {
						Keys  float64 `json:"keys"`
						Metal float64 `json:"metal"`
					} `json:"sell"`
				} `json:"results"`
			} `json:"data"`
		}
		params := url.Values{"q": {name}}
		if err := getJSON(ctx, client, p.BaseURL+"?"+params.Encode(), nil, &payload); err != nil {
			return nil, fmt.Errorf("%s: %w", name, err)
		}
		if !payload.Success {
			return nil, fmt.Errorf("%s: PriceDB request failed", name)
		}
		for _, item := range payload.Data.Results {
			if item.Name != name || item.Source != "bptf" {
				continue
			}
			quotes = append(quotes, Quote{Source: p.ID(), MarketName: name, Currency: "TF2", DisplayPrice: formatTF2Range(item.Buy.Keys, item.Buy.Metal, item.Sell.Keys, item.Sell.Metal), ObservedAt: nowRFC3339()})
			break
		}
	}
	return quotes, nil
}
