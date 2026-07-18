package steamtrade

import (
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"strconv"
	"time"
)

const steamIDIndividualBase uint64 = 76561197960265728

type HTTPDoer interface {
	Do(*http.Request) (*http.Response, error)
}

type Provider struct {
	Client  HTTPDoer
	BaseURL string
}

type Snapshot struct {
	Status      string  `json:"status"`
	Received    []Trade `json:"received"`
	Sent        []Trade `json:"sent"`
	History     []Trade `json:"history"`
	RefreshedAt string  `json:"refreshedAt"`
	Message     string  `json:"message,omitempty"`
}

type Trade struct {
	ID             string `json:"id"`
	Direction      string `json:"direction"`
	PartnerSteamID string `json:"partnerSteamId"`
	Message        string `json:"message,omitempty"`
	State          string `json:"state"`
	CreatedAt      string `json:"createdAt,omitempty"`
	UpdatedAt      string `json:"updatedAt,omitempty"`
	ExpiresAt      string `json:"expiresAt,omitempty"`
	ItemsToGive    []Item `json:"itemsToGive"`
	ItemsToReceive []Item `json:"itemsToReceive"`
}

type Item struct {
	AppID      uint32 `json:"appId"`
	ContextID  string `json:"contextId"`
	AssetID    string `json:"assetId"`
	Amount     uint64 `json:"amount"`
	Name       string `json:"name"`
	MarketName string `json:"marketName,omitempty"`
	Type       string `json:"type,omitempty"`
	ImageURL   string `json:"imageUrl,omitempty"`
	Tradable   bool   `json:"tradable"`
	Marketable bool   `json:"marketable"`
}

type apiAsset struct {
	AppID                                   uint32 `json:"appid"`
	ContextID, AssetID, ClassID, InstanceID string
	Amount                                  json.Number `json:"amount"`
}

func (a *apiAsset) UnmarshalJSON(data []byte) error {
	type alias apiAsset
	var wire struct {
		AppID      uint32          `json:"appid"`
		ContextID  json.RawMessage `json:"contextid"`
		AssetID    json.RawMessage `json:"assetid"`
		ClassID    json.RawMessage `json:"classid"`
		InstanceID json.RawMessage `json:"instanceid"`
		Amount     json.RawMessage `json:"amount"`
	}
	if err := json.Unmarshal(data, &wire); err != nil {
		return err
	}
	a.AppID = wire.AppID
	a.ContextID = scalar(wire.ContextID)
	a.AssetID = scalar(wire.AssetID)
	a.ClassID = scalar(wire.ClassID)
	a.InstanceID = scalar(wire.InstanceID)
	amount, _ := strconv.ParseUint(scalar(wire.Amount), 10, 64)
	a.Amount = json.Number(strconv.FormatUint(amount, 10))
	return nil
}
func scalar(raw json.RawMessage) string {
	var s string
	if json.Unmarshal(raw, &s) == nil {
		return s
	}
	var n json.Number
	if json.Unmarshal(raw, &n) == nil {
		return n.String()
	}
	return ""
}

type description struct {
	AppID                                                    uint32 `json:"appid"`
	ClassID, InstanceID, Name, MarketHashName, Type, IconURL string
	Tradable, Marketable                                     int
}

func (d *description) UnmarshalJSON(data []byte) error {
	type plain description
	var w struct {
		AppID          uint32          `json:"appid"`
		ClassID        json.RawMessage `json:"classid"`
		InstanceID     json.RawMessage `json:"instanceid"`
		Name           string          `json:"name"`
		MarketHashName string          `json:"market_hash_name"`
		Type           string          `json:"type"`
		IconURL        string          `json:"icon_url"`
		Tradable       int             `json:"tradable"`
		Marketable     int             `json:"marketable"`
	}
	if err := json.Unmarshal(data, &w); err != nil {
		return err
	}
	*d = description{w.AppID, scalar(w.ClassID), scalar(w.InstanceID), w.Name, w.MarketHashName, w.Type, w.IconURL, w.Tradable, w.Marketable}
	return nil
}

type offer struct {
	ID                        string `json:"tradeofferid"`
	AccountOther              uint32 `json:"accountid_other"`
	Message                   string `json:"message"`
	State                     int    `json:"trade_offer_state"`
	Created, Updated, Expires uint64
	Give                      []apiAsset `json:"items_to_give"`
	Receive                   []apiAsset `json:"items_to_receive"`
}

func (o *offer) UnmarshalJSON(data []byte) error {
	var w struct {
		ID           json.RawMessage `json:"tradeofferid"`
		AccountOther uint32          `json:"accountid_other"`
		Message      string          `json:"message"`
		State        int             `json:"trade_offer_state"`
		Created      uint64          `json:"time_created"`
		Updated      uint64          `json:"time_updated"`
		Expires      uint64          `json:"expiration_time"`
		Give         []apiAsset      `json:"items_to_give"`
		Receive      []apiAsset      `json:"items_to_receive"`
	}
	if err := json.Unmarshal(data, &w); err != nil {
		return err
	}
	*o = offer{scalar(w.ID), w.AccountOther, w.Message, w.State, w.Created, w.Updated, w.Expires, w.Give, w.Receive}
	return nil
}

type historyTrade struct {
	ID      json.RawMessage `json:"tradeid"`
	Partner json.RawMessage `json:"steamid_other"`
	Time    uint64          `json:"time_init"`
	Status  int             `json:"status"`
	Give    []apiAsset      `json:"assets_given"`
	Receive []apiAsset      `json:"assets_received"`
}

func NewProvider(client HTTPDoer) *Provider {
	if client == nil {
		client = &http.Client{Timeout: 15 * time.Second}
	}
	return &Provider{Client: client, BaseURL: "https://api.steampowered.com"}
}

func (p *Provider) Load(ctx context.Context, accessToken string) (Snapshot, error) {
	if accessToken == "" {
		return Snapshot{}, fmt.Errorf("Steam web access token is unavailable; sign in again")
	}
	var offersEnvelope struct {
		Response struct {
			Sent         []offer       `json:"trade_offers_sent"`
			Received     []offer       `json:"trade_offers_received"`
			Descriptions []description `json:"descriptions"`
		} `json:"response"`
	}
	if err := p.get(ctx, "/IEconService/GetTradeOffers/v1/", accessToken, url.Values{"get_sent_offers": {"true"}, "get_received_offers": {"true"}, "get_descriptions": {"true"}, "language": {"english"}, "active_only": {"true"}, "historical_only": {"false"}, "time_historical_cutoff": {"0"}}, &offersEnvelope); err != nil {
		return Snapshot{}, err
	}
	var historyEnvelope struct {
		Response struct {
			Trades       []historyTrade `json:"trades"`
			Descriptions []description  `json:"descriptions"`
		} `json:"response"`
	}
	if err := p.get(ctx, "/IEconService/GetTradeHistory/v1/", accessToken, url.Values{"max_trades": {"100"}, "get_descriptions": {"true"}, "language": {"english"}, "include_failed": {"true"}, "include_total": {"true"}}, &historyEnvelope); err != nil {
		return Snapshot{}, err
	}
	desc := descriptionMap(append(offersEnvelope.Response.Descriptions, historyEnvelope.Response.Descriptions...))
	out := Snapshot{Status: "ready", Received: mapOffers(offersEnvelope.Response.Received, "received", desc), Sent: mapOffers(offersEnvelope.Response.Sent, "sent", desc), History: mapHistory(historyEnvelope.Response.Trades, desc), RefreshedAt: time.Now().UTC().Format(time.RFC3339)}
	return out, nil
}

func (p *Provider) get(ctx context.Context, path, token string, values url.Values, out any) error {
	values.Set("access_token", token)
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, p.BaseURL+path+"?"+values.Encode(), nil)
	if err != nil {
		return err
	}
	resp, err := p.Client.Do(req)
	if err != nil {
		return fmt.Errorf("Steam trades request failed: %w", err)
	}
	defer resp.Body.Close()
	body, err := io.ReadAll(io.LimitReader(resp.Body, 4<<20))
	if err != nil {
		return err
	}
	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		return fmt.Errorf("Steam trades API returned HTTP %d", resp.StatusCode)
	}
	if err := json.Unmarshal(body, out); err != nil {
		return fmt.Errorf("decode Steam trades response: %w", err)
	}
	return nil
}
func descriptionMap(in []description) map[string]description {
	out := map[string]description{}
	for _, d := range in {
		out[fmt.Sprintf("%d/%s/%s", d.AppID, d.ClassID, d.InstanceID)] = d
	}
	return out
}
func mapAssets(in []apiAsset, desc map[string]description) []Item {
	out := make([]Item, 0, len(in))
	for _, a := range in {
		d := desc[fmt.Sprintf("%d/%s/%s", a.AppID, a.ClassID, a.InstanceID)]
		amount, _ := strconv.ParseUint(a.Amount.String(), 10, 64)
		image := ""
		if d.IconURL != "" {
			image = "https://community.cloudflare.steamstatic.com/economy/image/" + d.IconURL
		}
		out = append(out, Item{a.AppID, a.ContextID, a.AssetID, amount, d.Name, d.MarketHashName, d.Type, image, d.Tradable != 0, d.Marketable != 0})
	}
	return out
}
func mapOffers(in []offer, direction string, d map[string]description) []Trade {
	out := make([]Trade, 0, len(in))
	for _, o := range in {
		out = append(out, Trade{ID: o.ID, Direction: direction, PartnerSteamID: strconv.FormatUint(steamIDIndividualBase+uint64(o.AccountOther), 10), Message: o.Message, State: offerState(o.State), CreatedAt: stamp(o.Created), UpdatedAt: stamp(o.Updated), ExpiresAt: stamp(o.Expires), ItemsToGive: mapAssets(o.Give, d), ItemsToReceive: mapAssets(o.Receive, d)})
	}
	return out
}
func mapHistory(in []historyTrade, d map[string]description) []Trade {
	out := make([]Trade, 0, len(in))
	for _, t := range in {
		out = append(out, Trade{ID: scalar(t.ID), Direction: "history", PartnerSteamID: scalar(t.Partner), State: historyState(t.Status), CreatedAt: stamp(t.Time), ItemsToGive: mapAssets(t.Give, d), ItemsToReceive: mapAssets(t.Receive, d)})
	}
	return out
}
func stamp(v uint64) string {
	if v == 0 {
		return ""
	}
	return time.Unix(int64(v), 0).UTC().Format(time.RFC3339)
}
func offerState(v int) string {
	if state := map[int]string{1: "invalid", 2: "active", 3: "accepted", 4: "countered", 5: "expired", 6: "cancelled", 7: "declined", 8: "invalid_items", 9: "confirmation_required", 10: "cancelled_by_secondary_factor", 11: "state_in_escrow"}[v]; state != "" {
		return state
	}
	return fmt.Sprintf("state_%d", v)
}
func historyState(v int) string {
	if state := map[int]string{0: "invalid", 1: "initiated", 2: "precommitted", 3: "accepted", 4: "failed", 5: "partial", 6: "rollback", 7: "rollback_failed", 8: "state_in_escrow"}[v]; state != "" {
		return state
	}
	return fmt.Sprintf("status_%d", v)
}
