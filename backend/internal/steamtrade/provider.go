package steamtrade

import (
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"strconv"
	"strings"
	"time"
)

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
	Tradable, Marketable                                     bool
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
		Tradable       json.RawMessage `json:"tradable"`
		Marketable     json.RawMessage `json:"marketable"`
	}
	if err := json.Unmarshal(data, &w); err != nil {
		return err
	}
	*d = description{w.AppID, scalar(w.ClassID), scalar(w.InstanceID), w.Name, w.MarketHashName, w.Type, w.IconURL, boolean(w.Tradable), boolean(w.Marketable)}
	return nil
}

func boolean(raw json.RawMessage) bool {
	var value bool
	if json.Unmarshal(raw, &value) == nil {
		return value
	}
	numeric, err := strconv.ParseInt(scalar(raw), 10, 64)
	return err == nil && numeric != 0
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
	return &Provider{Client: client, BaseURL: "https://api.steampowered.com", CommunityBaseURL: "https://steamcommunity.com"}
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
	out := Snapshot{Status: "ready", Received: mapOffers(offersEnvelope.Response.Received, TradeDirectionReceived, desc), Sent: mapOffers(offersEnvelope.Response.Sent, TradeDirectionSent, desc), History: mapHistory(historyEnvelope.Response.Trades, desc), RefreshedAt: time.Now().UTC().Format(time.RFC3339)}
	if err := p.loadPartnerProfiles(ctx, accessToken, &out); err != nil {
		return Snapshot{}, err
	}
	return out, nil
}

func (p *Provider) loadPartnerProfiles(ctx context.Context, accessToken string, snapshot *Snapshot) error {
	partnerIDs := uniquePartnerIDs(snapshot)
	for start := 0; start < len(partnerIDs); start += 100 {
		end := min(start+100, len(partnerIDs))
		var envelope struct {
			Response struct {
				Players []playerSummary `json:"players"`
			} `json:"response"`
		}
		if err := p.get(ctx, "/ISteamUser/GetPlayerSummaries/v2/", accessToken, url.Values{"steamids": {strings.Join(partnerIDs[start:end], ",")}}, &envelope); err != nil {
			return fmt.Errorf("load Steam trade partner profiles: %w", err)
		}
		profiles := make(map[string]playerSummary, len(envelope.Response.Players))
		for _, profile := range envelope.Response.Players {
			profiles[profile.SteamID] = profile
		}
		applyPartnerProfiles(snapshot.Received, profiles)
		applyPartnerProfiles(snapshot.Sent, profiles)
		applyPartnerProfiles(snapshot.History, profiles)
	}
	return nil
}

func uniquePartnerIDs(snapshot *Snapshot) []string {
	seen := make(map[string]struct{})
	ids := make([]string, 0)
	for _, trades := range [][]Trade{snapshot.Received, snapshot.Sent, snapshot.History} {
		for _, trade := range trades {
			if trade.PartnerSteamID == "" {
				continue
			}
			if _, exists := seen[trade.PartnerSteamID]; exists {
				continue
			}
			seen[trade.PartnerSteamID] = struct{}{}
			ids = append(ids, trade.PartnerSteamID)
		}
	}
	return ids
}

func applyPartnerProfiles(trades []Trade, profiles map[string]playerSummary) {
	for index := range trades {
		profile, ok := profiles[trades[index].PartnerSteamID]
		if !ok {
			continue
		}
		trades[index].PartnerName = profile.Name
		trades[index].PartnerAvatarURL = profile.AvatarURL
		trades[index].PartnerProfileURL = profile.ProfileURL
	}
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

func (p *Provider) Create(ctx context.Context, steamID, accessToken string, input CreateRequest) (MutationResult, error) {
	if steamID == "" || accessToken == "" {
		return MutationResult{}, fmt.Errorf("authenticated Steam Community session is unavailable; sign in again")
	}
	if input.PartnerSteamID == "" || len(input.ItemsToGive)+len(input.ItemsToReceive) == 0 {
		return MutationResult{}, fmt.Errorf("trade partner and at least one asset are required")
	}
	trade := map[string]any{"newversion": true, "version": 2, "me": map[string]any{"assets": wireAssets(input.ItemsToGive), "currency": []any{}, "ready": false}, "them": map[string]any{"assets": wireAssets(input.ItemsToReceive), "currency": []any{}, "ready": false}}
	if input.CounteredTradeOfferID != "" {
		trade["tradeofferid_countered"] = input.CounteredTradeOfferID
	}
	tradeJSON, err := json.Marshal(trade)
	if err != nil {
		return MutationResult{}, fmt.Errorf("encode Steam trade offer: %w", err)
	}
	createParams, err := json.Marshal(map[string]string{"trade_offer_access_token": input.TradeToken})
	if err != nil {
		return MutationResult{}, fmt.Errorf("encode Steam trade parameters: %w", err)
	}
	values := url.Values{"sessionid": {communitySessionID(steamID)}, "serverid": {"1"}, "partner": {input.PartnerSteamID}, "tradeoffermessage": {input.Message}, "json_tradeoffer": {string(tradeJSON)}, "captcha": {""}, "trade_offer_create_params": {string(createParams)}}
	var response struct {
		TradeOfferID            string `json:"tradeofferid"`
		NeedsMobileConfirmation bool   `json:"needs_mobile_confirmation"`
		Error                   string `json:"strError"`
	}
	if err := p.communityPost(ctx, steamID, accessToken, "/tradeoffer/new/send", values, &response); err != nil {
		return MutationResult{}, err
	}
	if response.Error != "" {
		return MutationResult{}, fmt.Errorf("Steam rejected the trade offer: %s", response.Error)
	}
	if response.TradeOfferID == "" {
		return MutationResult{}, fmt.Errorf("Steam did not return a trade offer ID")
	}
	return MutationResult{Status: "submitted", TradeOfferID: response.TradeOfferID, NeedsMobileConfirmation: response.NeedsMobileConfirmation, Message: mutationMessage(response.NeedsMobileConfirmation)}, nil
}

func (p *Provider) Accept(ctx context.Context, steamID, accessToken, tradeOfferID, partnerSteamID string) (MutationResult, error) {
	if steamID == "" || accessToken == "" {
		return MutationResult{}, fmt.Errorf("authenticated Steam Community session is unavailable; sign in again")
	}
	if tradeOfferID == "" || partnerSteamID == "" {
		return MutationResult{}, fmt.Errorf("trade offer and partner are required")
	}
	values := url.Values{"sessionid": {communitySessionID(steamID)}, "serverid": {"1"}, "tradeofferid": {tradeOfferID}, "partner": {partnerSteamID}, "captcha": {""}}
	var response struct {
		TradeID                 string `json:"tradeid"`
		NeedsMobileConfirmation bool   `json:"needs_mobile_confirmation"`
		Error                   string `json:"strError"`
	}
	if err := p.communityPost(ctx, steamID, accessToken, "/tradeoffer/"+url.PathEscape(tradeOfferID)+"/accept", values, &response); err != nil {
		return MutationResult{}, err
	}
	if response.Error != "" {
		return MutationResult{}, fmt.Errorf("Steam rejected the trade acceptance: %s", response.Error)
	}
	return MutationResult{Status: "accepted", TradeOfferID: tradeOfferID, NeedsMobileConfirmation: response.NeedsMobileConfirmation, Message: mutationMessage(response.NeedsMobileConfirmation)}, nil
}

func wireAssets(assets []MutationAsset) []map[string]any {
	out := make([]map[string]any, 0, len(assets))
	for _, asset := range assets {
		out = append(out, map[string]any{"appid": asset.AppID, "contextid": asset.ContextID, "assetid": asset.AssetID, "amount": asset.Amount})
	}
	return out
}

func communitySessionID(steamID string) string { return "csinvedit-" + steamID }

func mutationMessage(needsConfirmation bool) string {
	if needsConfirmation {
		return "Steam mobile confirmation is required to complete this trade."
	}
	return "Steam accepted the trade request."
}

func (p *Provider) communityPost(ctx context.Context, steamID, accessToken, path string, values url.Values, out any) error {
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, strings.TrimRight(p.CommunityBaseURL, "/")+path, strings.NewReader(values.Encode()))
	if err != nil {
		return err
	}
	req.Header.Set("Content-Type", "application/x-www-form-urlencoded; charset=UTF-8")
	req.Header.Set("Referer", "https://steamcommunity.com/tradeoffer/")
	req.Header.Set("X-Requested-With", "XMLHttpRequest")
	req.AddCookie(&http.Cookie{Name: "sessionid", Value: communitySessionID(steamID), Path: "/", Secure: true})
	req.AddCookie(&http.Cookie{Name: "steamLoginSecure", Value: url.QueryEscape(steamID + "||" + accessToken), Path: "/", Secure: true, HttpOnly: true})
	resp, err := p.Client.Do(req)
	if err != nil {
		return fmt.Errorf("Steam Community trade request failed: %w", err)
	}
	defer resp.Body.Close()
	body, err := io.ReadAll(io.LimitReader(resp.Body, 1<<20))
	if err != nil {
		return err
	}
	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		return fmt.Errorf("Steam Community trade API returned HTTP %d", resp.StatusCode)
	}
	if err := json.Unmarshal(body, out); err != nil {
		return fmt.Errorf("decode Steam Community trade response: %w", err)
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
		out = append(out, Item{a.AppID, a.ContextID, a.AssetID, amount, d.Name, d.MarketHashName, d.Type, image, d.Tradable, d.Marketable})
	}
	return out
}
func mapOffers(in []offer, direction TradeDirection, d map[string]description) []Trade {
	out := make([]Trade, 0, len(in))
	for _, o := range in {
		out = append(out, Trade{ID: o.ID, Direction: direction, PartnerSteamID: strconv.FormatUint(steamIDIndividualBase+uint64(o.AccountOther), 10), Message: o.Message, State: offerState(o.State), CreatedAt: stamp(o.Created), UpdatedAt: stamp(o.Updated), ExpiresAt: stamp(o.Expires), ItemsToGive: mapAssets(o.Give, d), ItemsToReceive: mapAssets(o.Receive, d)})
	}
	return out
}
func mapHistory(in []historyTrade, d map[string]description) []Trade {
	out := make([]Trade, 0, len(in))
	for _, t := range in {
		out = append(out, Trade{ID: scalar(t.ID), Direction: TradeDirectionHistory, PartnerSteamID: scalar(t.Partner), State: historyState(t.Status), CreatedAt: stamp(t.Time), ItemsToGive: mapAssets(t.Give, d), ItemsToReceive: mapAssets(t.Receive, d)})
	}
	return out
}
func stamp(v uint64) string {
	if v == 0 {
		return ""
	}
	return time.Unix(int64(v), 0).UTC().Format(time.RFC3339)
}
func offerState(v int) TradeState {
	if state := map[int]string{1: "invalid", 2: "active", 3: "accepted", 4: "countered", 5: "expired", 6: "cancelled", 7: "declined", 8: "invalid_items", 9: "confirmation_required", 10: "cancelled_by_secondary_factor", 11: "state_in_escrow"}[v]; state != "" {
		return TradeState(state)
	}
	return TradeState(fmt.Sprintf("state_%d", v))
}
func historyState(v int) TradeState {
	if state := map[int]string{0: "invalid", 1: "initiated", 2: "precommitted", 3: "accepted", 4: "failed", 5: "partial", 6: "rollback", 7: "rollback_failed", 8: "state_in_escrow"}[v]; state != "" {
		return TradeState(state)
	}
	return TradeState(fmt.Sprintf("status_%d", v))
}
