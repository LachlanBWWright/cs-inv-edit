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
	"strconv"
	"strings"
	"sync"
	"time"
)

const (
	itemsGameURL  = "https://raw.githubusercontent.com/SteamTracking/GameTracking-CS2/master/game/csgo/pak01_dir/scripts/items/items_game.txt"
	englishURL    = "https://raw.githubusercontent.com/SteamTracking/GameTracking-CS2/master/game/csgo/pak01_dir/resource/csgo_english.txt"
	imageIndexURL = "https://raw.githubusercontent.com/ByMykel/counter-strike-image-tracker/refs/heads/main/static/images.json"
	crateIndexURL = "https://raw.githubusercontent.com/ByMykel/CSGO-API/main/public/api/en/crates.json"
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
	var crateIndex string
	var wait sync.WaitGroup
	wait.Add(4)
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
	go func() {
		defer wait.Done()
		// The public items_game omits the expanded members of rare-special
		// pools. This live, game-derived index supplies only that missing join.
		crateIndex, _ = p.fetch(ctx, crateIndexURL)
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
		items:                   make(map[uint32]itemDefinition),
		paintKits:               make(map[uint32]paintKitDefinition),
		stickerKits:             make(map[uint32]stickerKitDefinition),
		musicDefinitions:        make(map[uint32]musicDefinition),
		keychains:               make(map[uint32]keychainDefinition),
		tokens:                  parseTokens(englishRoot),
		collections:             make(map[string]collectionDefinition),
		collectionByItem:        make(map[string]string),
		lootLists:               make(map[string][]string),
		revolvingLootLists:      make(map[string]string),
		rareSpecialByContainer:  make(map[uint32][]RelatedItem),
		rareSpecialByCollection: make(map[string][]RelatedItem),
		rareSpecialQualities:    make(map[string]map[string]bool),
		imageURLs:               imageURLs,
		attributes:              make(map[uint32]econAttributeDefinition),
		quests:                  make(map[uint32]QuestDefinition),
	}
	schema.parseItems(itemsRoot)
	schema.applyRareSpecialIndex(crateIndex)
	schema.parseQuests(itemsRoot.object("items_game"))
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
