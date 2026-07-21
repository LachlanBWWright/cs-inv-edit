package steamtrade

import (
	"context"
	"io"
	"net/http"
	"strings"
	"testing"
)

type roundTripFunc func(*http.Request) (*http.Response, error)

func (fn roundTripFunc) Do(req *http.Request) (*http.Response, error) { return fn(req) }

func TestLoadMapsPendingOffersAndHistory(t *testing.T) {
	client := roundTripFunc(func(req *http.Request) (*http.Response, error) {
		if req.URL.Query().Get("access_token") != "secret" {
			t.Fatal("missing access token")
		}
		body := `{"response":{"trades":[{"tradeid":"99","steamid_other":"76561198000000000","time_init":1700000000,"status":3,"assets_given":[],"assets_received":[]}],"descriptions":[]}}`
		if strings.Contains(req.URL.Path, "GetTradeOffers") {
			body = `{"response":{"trade_offers_received":[{"tradeofferid":"42","accountid_other":123,"message":"hello","trade_offer_state":2,"time_created":1700000000,"items_to_give":[{"appid":730,"contextid":"2","assetid":"7","classid":"10","instanceid":"0","amount":"1"}],"items_to_receive":[]}],"trade_offers_sent":[],"descriptions":[{"appid":730,"classid":"10","instanceid":"0","name":"Item","market_hash_name":"Item (Factory New)","icon_url":"token","tradable":true,"marketable":1}]}}`
		} else if strings.Contains(req.URL.Path, "GetPlayerSummaries") {
			body = `{"response":{"players":[{"steamid":"76561197960265851","personaname":"Trade Partner","profileurl":"https://steamcommunity.com/profiles/76561197960265851/","avatarfull":"https://avatars.steamstatic.com/partner_full.jpg"},{"steamid":"76561198000000000","personaname":"History Partner","profileurl":"https://steamcommunity.com/profiles/76561198000000000/","avatarfull":"https://avatars.steamstatic.com/history_full.jpg"}]}}`
		}
		return &http.Response{StatusCode: 200, Body: io.NopCloser(strings.NewReader(body)), Header: make(http.Header)}, nil
	})
	provider := NewProvider(client)
	snapshot, err := provider.Load(context.Background(), "secret")
	if err != nil {
		t.Fatal(err)
	}
	if len(snapshot.Received) != 1 || snapshot.Received[0].Direction != "received" || snapshot.Received[0].PartnerSteamID != "76561197960265851" {
		t.Fatalf("offer = %#v", snapshot.Received)
	}
	if got := snapshot.Received[0].ItemsToGive[0]; got.MarketName != "Item (Factory New)" || got.ImageURL == "" || !got.Tradable || !got.Marketable {
		t.Fatalf("item = %#v", got)
	}
	if len(snapshot.History) != 1 || snapshot.History[0].State != "accepted" {
		t.Fatalf("history = %#v", snapshot.History)
	}
	if snapshot.Received[0].PartnerName != "Trade Partner" || snapshot.Received[0].PartnerAvatarURL == "" || snapshot.History[0].PartnerName != "History Partner" {
		t.Fatalf("partner profiles were not resolved: %#v %#v", snapshot.Received[0], snapshot.History[0])
	}
}
