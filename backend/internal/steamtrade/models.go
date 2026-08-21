package steamtrade

import "net/http"

const steamIDIndividualBase uint64 = 76561197960265728

type HTTPDoer interface {
	Do(*http.Request) (*http.Response, error)
}

type Provider struct {
	Client           HTTPDoer
	BaseURL          string
	CommunityBaseURL string
}

type Snapshot struct {
	Status      string  `json:"status"`
	Received    []Trade `json:"received"`
	Sent        []Trade `json:"sent"`
	History     []Trade `json:"history"`
	RefreshedAt string  `json:"refreshedAt"`
	Message     string  `json:"message,omitempty"`
}

// AccountSnapshot keeps the account identity attached to the data it owns.
type AccountSnapshot struct {
	SteamID     string   `json:"steamId"`
	AccountName string   `json:"accountName"`
	AvatarURL   string   `json:"avatarUrl,omitempty"`
	Snapshot    Snapshot `json:"snapshot"`
}

type AccountSnapshots struct {
	Accounts    []AccountSnapshot `json:"accounts"`
	RefreshedAt string            `json:"refreshedAt"`
}

type TradeDirection string

const (
	TradeDirectionReceived TradeDirection = "received"
	TradeDirectionSent     TradeDirection = "sent"
	TradeDirectionHistory  TradeDirection = "history"
)

type TradeState string

const (
	TradeStateActive   TradeState = "active"
	TradeStateAccepted TradeState = "accepted"
)

type Trade struct {
	ID                string         `json:"id"`
	Direction         TradeDirection `json:"direction"`
	PartnerSteamID    string         `json:"partnerSteamId"`
	PartnerName       string         `json:"partnerName,omitempty"`
	PartnerAvatarURL  string         `json:"partnerAvatarUrl,omitempty"`
	PartnerProfileURL string         `json:"partnerProfileUrl,omitempty"`
	Message           string         `json:"message,omitempty"`
	State             TradeState     `json:"state"`
	CreatedAt         string         `json:"createdAt,omitempty"`
	UpdatedAt         string         `json:"updatedAt,omitempty"`
	ExpiresAt         string         `json:"expiresAt,omitempty"`
	ItemsToGive       []Item         `json:"itemsToGive"`
	ItemsToReceive    []Item         `json:"itemsToReceive"`
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

type MutationAsset struct {
	AppID     uint32 `json:"appId"`
	ContextID string `json:"contextId"`
	AssetID   string `json:"assetId"`
	Amount    uint64 `json:"amount"`
}
type CreateRequest struct {
	PartnerSteamID        string          `json:"partnerSteamId"`
	Message               string          `json:"message,omitempty"`
	ItemsToGive           []MutationAsset `json:"itemsToGive"`
	ItemsToReceive        []MutationAsset `json:"itemsToReceive"`
	CounteredTradeOfferID string          `json:"counteredTradeOfferId,omitempty"`
	TradeToken            string          `json:"tradeToken,omitempty"`
}
type MutationResult struct {
	Status                  string `json:"status"`
	TradeOfferID            string `json:"tradeOfferId,omitempty"`
	NeedsMobileConfirmation bool   `json:"needsMobileConfirmation,omitempty"`
	Message                 string `json:"message,omitempty"`
}

type playerSummary struct {
	SteamID    string `json:"steamid"`
	Name       string `json:"personaname"`
	AvatarURL  string `json:"avatarfull"`
	ProfileURL string `json:"profileurl"`
}
