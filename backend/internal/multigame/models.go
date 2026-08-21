package multigame

import (
	"encoding/json"
	"fmt"
	"net/http"
	"strings"
	"sync"
	"time"

	"cs-inv-edit/backend/internal/domain"
	"cs-inv-edit/backend/internal/econ"
)

type Game struct {
	ID        string
	AppID     uint32
	ContextID uint32
}

var games = map[string]Game{"steam": {ID: "steam", AppID: 753, ContextID: 6}, "tf2": {ID: "tf2", AppID: 440, ContextID: 2}, "dota2": {ID: "dota2", AppID: 570, ContextID: 2}}

func ParseGame(value string) (Game, bool) {
	game, ok := games[strings.ToLower(strings.TrimSpace(value))]
	return game, ok
}

type Provider struct {
	client                                                  *http.Client
	communityBase, tf2ItemsURL, tf2EnglishURL, tf2QuestsURL string
	tf2Mu                                                   sync.Mutex
	tf2Definitions                                          map[uint32]econ.TF2Definition
	tf2Attributes                                           map[uint32]econ.TF2AttributeDefinition
	tf2SchemaRevision                                       string
	tf2SchemaLoaded                                         bool
	tf2Images                                               *econ.Provider
	overlayMu                                               sync.Mutex
	overlays                                                map[string]overlayCacheEntry
}
type overlayCacheEntry struct {
	snapshot  domain.GameInventorySnapshot
	expiresAt time.Time
}
type OwnedItem struct {
	ID, OriginalID                                                      uint64
	DefIndex, Quantity, Quality, Inventory, Level, Flags, Origin, Style uint32
	CustomName, CustomDesc                                              string
	Attributes                                                          map[uint32]uint32
	AttributeBytes                                                      map[uint32][]byte
	EquippedStates                                                      []domain.EquippedState
	InteriorItemID                                                      uint64
}

func NewProvider() *Provider {
	return &Provider{client: &http.Client{Timeout: 20 * time.Second}, communityBase: "https://steamcommunity.com", tf2ItemsURL: "https://raw.githubusercontent.com/SteamTracking/GameTracking-TF2/master/tf/scripts/items/items_game.txt", tf2EnglishURL: "https://raw.githubusercontent.com/SteamTracking/GameTracking-TF2/master/tf/resource/tf_english.txt", tf2QuestsURL: "https://raw.githubusercontent.com/SteamTracking/GameTracking-TF2/master/tf/resource/tf_quests_english.txt", overlays: make(map[string]overlayCacheEntry), tf2Images: econ.NewProvider()}
}

type page struct {
	Success      flexibleBool  `json:"success"`
	MoreItems    flexibleBool  `json:"more_items"`
	LastAssetID  string        `json:"last_assetid"`
	Assets       []asset       `json:"assets"`
	Descriptions []description `json:"descriptions"`
}
type asset struct {
	AppID      int64  `json:"appid"`
	ContextID  string `json:"contextid"`
	AssetID    string `json:"assetid"`
	ClassID    string `json:"classid"`
	InstanceID string `json:"instanceid"`
	Amount     string `json:"amount"`
}
type description struct {
	AppID             int64               `json:"appid"`
	ClassID           string              `json:"classid"`
	InstanceID        string              `json:"instanceid"`
	Name              string              `json:"name"`
	MarketName        string              `json:"market_name"`
	MarketHashName    string              `json:"market_hash_name"`
	IconURL           string              `json:"icon_url"`
	IconURLLarge      string              `json:"icon_url_large"`
	Type              string              `json:"type"`
	Tradable          int                 `json:"tradable"`
	Marketable        int                 `json:"marketable"`
	Tags              []tag               `json:"tags"`
	Descriptions      []descriptionLine   `json:"descriptions"`
	OwnerDescriptions []descriptionLine   `json:"owner_descriptions"`
	Actions           []descriptionAction `json:"actions"`
}
type descriptionAction struct {
	Link string `json:"link"`
}
type tag struct {
	Category         string `json:"category"`
	InternalName     string `json:"internal_name"`
	LocalizedTagName string `json:"localized_tag_name"`
}
type descriptionLine struct {
	Value string `json:"value"`
}
type flexibleBool bool

func (b *flexibleBool) UnmarshalJSON(data []byte) error {
	var boolean bool
	if err := json.Unmarshal(data, &boolean); err == nil {
		*b = flexibleBool(boolean)
		return nil
	}
	var number int
	if err := json.Unmarshal(data, &number); err == nil && (number == 0 || number == 1) {
		*b = flexibleBool(number == 1)
		return nil
	}
	return fmt.Errorf("expected boolean or 0/1")
}
