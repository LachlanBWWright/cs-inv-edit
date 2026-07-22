package econ

import (
	"bytes"
	"compress/gzip"
	"context"
	_ "embed"
	"encoding/json"
	"fmt"
	"hash/crc32"
	"io"
	"net/http"
	"regexp"
	"sort"
	"strconv"
	"strings"
	"sync"
	"time"
)

const (
	itemsGameURL  = "https://raw.githubusercontent.com/SteamTracking/GameTracking-CS2/master/game/csgo/pak01_dir/scripts/items/items_game.txt"
	englishURL    = "https://raw.githubusercontent.com/SteamTracking/GameTracking-CS2/master/game/csgo/pak01_dir/resource/csgo_english.txt"
	imageIndexURL = "https://raw.githubusercontent.com/ByMykel/counter-strike-image-tracker/refs/heads/main/static/images.json"
)

// fallbackImageIndex is generated from the pinned counter-strike-image-tracker
// submodule so packaged builds retain images when the live index is unavailable.
//
//go:embed assets/counter-strike-images.json.gz
var fallbackImageIndex []byte

type Provider struct {
	client       *http.Client
	previewMu    sync.Mutex
	previewCache map[string]MarketDescription
}

type Metadata struct {
	Name                  string
	MarketName            string
	Kind                  string
	Rarity                string
	ImageURL              string
	ImageSource           string
	ImageKey              string
	MarketPrice           MarketPrice
	ToolType              string
	RequiredKeyDefIndexes []uint32
	IsNameTagTool         bool
	Collection            string
	CollectionItems       []RelatedItem
	TradeUpItems          []RelatedItem
	ContainerItems        []RelatedItem
	AppliedItemImages     []string
	Tradable              *bool
	Marketable            *bool
	TradableAfter         string
	PaintWearMin          *float64
	PaintWearMax          *float64
}

type RelatedItem struct {
	Name        string
	MarketName  string
	ListingName string
	Kind        string
	Rarity      string
	ImageURL    string
	Price       string
	PaintWear   *float64
	WearMin     *float64
	WearMax     *float64
	Items       []RelatedItem
}

type AppliedItem struct {
	Kind     string
	Slot     uint32
	ID       uint32
	Name     string
	ImageURL string
	Wear     *float64
}

type MarketPrice struct {
	SellPrice     int
	SellPriceText string
	SalePriceText string
	SellListings  int
}

type InventoryDescription struct {
	AssetID           string
	ClassID           string
	InstanceID        string
	Name              string
	MarketName        string
	MarketHashName    string
	IconURL           string
	IconURLLarge      string
	Type              string
	Tradable          bool
	Marketable        bool
	AppliedItemImages []string
	TradableAfter     string
	InspectURL        string
}

type MarketDescription struct {
	Name           string
	HashName       string
	MarketName     string
	MarketHashName string
	IconURL        string
	IconURLLarge   string
	Type           string
	Price          MarketPrice
}

type Schema struct {
	items              map[uint32]itemDefinition
	paintKits          map[uint32]paintKitDefinition
	stickerKits        map[uint32]stickerKitDefinition
	musicDefinitions   map[uint32]musicDefinition
	keychains          map[uint32]keychainDefinition
	tokens             map[string]string
	collections        map[string]collectionDefinition
	collectionByItem   map[string]string
	lootLists          map[string][]string
	revolvingLootLists map[string]string
	imageURLs          map[string]string
	armoryOffers       []ArmoryOffer
}

type ArmoryOffer struct {
	CampaignID   uint32
	RedeemID     uint32
	ExpectedCost uint32
	ItemName     string
	Name         string
	Category     string
	Items        []RelatedItem
}

type collectionDefinition struct {
	Name  string
	Items []string
}

type Collection struct {
	Name  string
	Items []RelatedItem
}

func (s *Schema) Collections() []Collection {
	collections := make([]Collection, 0, len(s.collections))
	for _, definition := range s.collections {
		if definition.Name == "" || len(definition.Items) == 0 {
			continue
		}
		collections = append(collections, Collection{Name: definition.Name, Items: s.relatedItems(definition.Items)})
	}
	sort.Slice(collections, func(i, j int) bool { return collections[i].Name < collections[j].Name })
	return collections
}

type itemDefinition struct {
	Name                  string
	ItemName              string
	TypeName              string
	ItemClass             string
	Prefab                string
	Rarity                string
	Image                 string
	ToolType              string
	Capabilities          map[string]string
	LootList              string
	SupplyCrateSeries     string
	RequiredKeyDefIndexes []uint32
}

func (s *Schema) MetadataByItemName(itemName string) (uint32, Metadata, bool) {
	for defIndex, item := range s.items {
		if item.Name == itemName {
			return defIndex, s.Metadata(defIndex, 0, nil), true
		}
	}
	return 0, Metadata{}, false
}

type paintKitDefinition struct {
	Name        string
	Description string
	Rarity      string
	WearMin     *float64
	WearMax     *float64
}

type stickerKitDefinition struct {
	Name          string
	ItemName      string
	Material      string
	PatchMaterial string
	Rarity        string
}

type musicDefinition struct {
	Name     string
	ItemName string
	Image    string
}

type keychainDefinition struct {
	Name     string
	ItemName string
	Image    string
	Rarity   string
}

func NewProvider() *Provider {
	return &Provider{client: &http.Client{Timeout: 15 * time.Second}, previewCache: make(map[string]MarketDescription)}
}

func (p *Provider) Load(ctx context.Context) (*Schema, error) {
	if p.client == nil {
		p.client = &http.Client{Timeout: 15 * time.Second}
	}
	var itemsText, englishText string
	var itemsErr, englishErr error
	var imageURLs map[string]string
	var wait sync.WaitGroup
	wait.Add(3)
	go func() {
		defer wait.Done()
		itemsText, itemsErr = p.fetch(ctx, itemsGameURL)
	}()
	go func() {
		defer wait.Done()
		englishText, englishErr = p.fetch(ctx, englishURL)
	}()
	go func() {
		defer wait.Done()
		imageURLs = p.loadImageURLs(ctx)
	}()
	wait.Wait()
	if itemsErr != nil {
		return nil, fmt.Errorf("fetch CS2 items_game schema: %w", itemsErr)
	}
	if englishErr != nil {
		return nil, fmt.Errorf("fetch CS2 English localization: %w", englishErr)
	}
	itemsRoot, err := parseKeyValues(itemsText)
	if err != nil {
		return nil, fmt.Errorf("parse CS2 items_game schema: %w", err)
	}
	englishRoot, err := parseKeyValues(englishText)
	if err != nil {
		return nil, fmt.Errorf("parse CS2 English localization: %w", err)
	}
	schema := &Schema{
		items:              make(map[uint32]itemDefinition),
		paintKits:          make(map[uint32]paintKitDefinition),
		stickerKits:        make(map[uint32]stickerKitDefinition),
		musicDefinitions:   make(map[uint32]musicDefinition),
		keychains:          make(map[uint32]keychainDefinition),
		tokens:             parseTokens(englishRoot),
		collections:        make(map[string]collectionDefinition),
		collectionByItem:   make(map[string]string),
		lootLists:          make(map[string][]string),
		revolvingLootLists: make(map[string]string),
		imageURLs:          imageURLs,
	}
	schema.parseItems(itemsRoot)
	schema.armoryOffers = parseArmoryOffers(itemsText, schema)
	if len(schema.items) == 0 {
		return nil, fmt.Errorf("CS2 items_game schema contained no item definitions")
	}
	return schema, nil
}

func (p *Provider) loadImageURLs(ctx context.Context) map[string]string {
	if imageText, err := p.fetch(ctx, imageIndexURL); err == nil {
		return preferredImageURLs(imageText)
	}
	return preferredImageURLs("")
}

func preferredImageURLs(liveImageIndex string) map[string]string {
	if liveImageIndex != "" {
		if imageURLs, err := decodeImageURLs(strings.NewReader(liveImageIndex)); err == nil {
			return imageURLs
		}
	}
	reader, err := gzip.NewReader(bytes.NewReader(fallbackImageIndex))
	if err != nil {
		return make(map[string]string)
	}
	defer reader.Close()
	imageURLs, err := decodeImageURLs(reader)
	if err != nil {
		return make(map[string]string)
	}
	return imageURLs
}

func decodeImageURLs(source io.Reader) (map[string]string, error) {
	imageURLs := make(map[string]string)
	if err := json.NewDecoder(source).Decode(&imageURLs); err != nil {
		return nil, err
	}
	return imageURLs, nil
}

func (s *Schema) ArmoryOffers() []ArmoryOffer {
	return append([]ArmoryOffer(nil), s.armoryOffers...)
}

var armoryGoodsPattern = regexp.MustCompile(`(?s)"operational_point_redeemable"\s*\{([^{}]*)\}`)

func parseArmoryOffers(itemsText string, schema *Schema) []ArmoryOffer {
	marker := regexp.MustCompile(`(?i)"redeemable_goods"\s+"xpshop"`).FindStringIndex(itemsText)
	if marker == nil {
		return nil
	}
	campaignID := uint64(0)
	prefix := itemsText[:marker[0]]
	if operationStart := strings.LastIndex(prefix, `"seasonaloperations"`); operationStart >= 0 {
		match := regexp.MustCompile(`"([0-9]+)"\s*\{`).FindStringSubmatch(prefix[operationStart:])
		if len(match) == 2 {
			campaignID, _ = strconv.ParseUint(match[1], 10, 32)
		}
	}
	if campaignID == 0 {
		return nil
	}
	section := itemsText[marker[1]:]
	if end := strings.Index(section, `"pro_event_results"`); end >= 0 {
		section = section[:end]
	}
	matches := armoryGoodsPattern.FindAllStringSubmatch(section, -1)
	offers := make([]ArmoryOffer, 0, len(matches))
	for _, match := range matches {
		object, err := parseKeyValues(match[1])
		if err != nil {
			continue
		}
		cost, err := strconv.ParseUint(object.string("points"), 10, 32)
		if err != nil || cost == 0 {
			continue
		}
		itemName := object.string("item_name")
		if itemName == "" {
			continue
		}
		name := schema.localize(object.string("callout"))
		if name == "" {
			name = humanizeIdentifier(strings.TrimPrefix(itemName, "lootlist:"))
		}
		lootListName := schema.armoryLootListName(itemName)
		offers = append(offers, ArmoryOffer{CampaignID: uint32(campaignID), RedeemID: crc32.ChecksumIEEE([]byte(itemName)), ExpectedCost: uint32(cost), ItemName: itemName, Name: name, Category: object.string("ui_order"), Items: schema.lootListItems(lootListName, nil)})
	}
	return offers
}

func (p *Provider) fetch(ctx context.Context, url string) (string, error) {
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, url, nil)
	if err != nil {
		return "", err
	}
	resp, err := p.client.Do(req)
	if err != nil {
		return "", err
	}
	defer resp.Body.Close()
	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		return "", fmt.Errorf("%s returned HTTP %d", url, resp.StatusCode)
	}
	body, err := io.ReadAll(resp.Body)
	if err != nil {
		return "", err
	}
	return string(body), nil
}
