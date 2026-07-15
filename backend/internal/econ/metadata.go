package econ

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"html"
	"io"
	"net/http"
	"net/url"
	"regexp"
	"sort"
	"strconv"
	"strings"
	"sync"
	"time"
)

const (
	itemsGameURL = "https://raw.githubusercontent.com/SteamDatabase/GameTracking-CS2/master/game/csgo/pak01_dir/scripts/items/items_game.txt"
	englishURL   = "https://raw.githubusercontent.com/SteamDatabase/GameTracking-CS2/master/game/csgo/pak01_dir/resource/csgo_english.txt"
)

type Provider struct {
	client       *http.Client
	previewMu    sync.Mutex
	previewCache map[string]MarketDescription
}

type Metadata struct {
	Name              string
	MarketName        string
	Kind              string
	Rarity            string
	ImageURL          string
	MarketPrice       MarketPrice
	ToolType          string
	IsNameTagTool     bool
	Collection        string
	CollectionItems   []RelatedItem
	TradeUpItems      []RelatedItem
	ContainerItems    []RelatedItem
	AppliedItemImages []string
	Tradable          *bool
	TradableAfter     string
	PaintWearMin      *float64
	PaintWearMax      *float64
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
}

type AppliedItem struct {
	Kind string
	Slot uint32
	ID   uint32
	Name string
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

type itemDefinition struct {
	Name              string
	ItemName          string
	TypeName          string
	ItemClass         string
	Prefab            string
	Rarity            string
	Image             string
	ToolType          string
	Capabilities      map[string]string
	LootList          string
	SupplyCrateSeries string
}

type paintKitDefinition struct {
	Name        string
	Description string
	Rarity      string
	WearMin     *float64
	WearMax     *float64
}

type stickerKitDefinition struct {
	Name     string
	ItemName string
	Material string
	Rarity   string
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
	itemsText, err := p.fetch(ctx, itemsGameURL)
	if err != nil {
		return nil, fmt.Errorf("fetch CS2 items_game schema: %w", err)
	}
	englishText, err := p.fetch(ctx, englishURL)
	if err != nil {
		return nil, fmt.Errorf("fetch CS2 English localization: %w", err)
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
	}
	schema.parseItems(itemsRoot)
	schema.armoryOffers = parseArmoryOffers(itemsText, schema)
	if len(schema.items) == 0 {
		return nil, fmt.Errorf("CS2 items_game schema contained no item definitions")
	}
	return schema, nil
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
	for redeemID, match := range matches {
		object, err := parseKeyValues(match[1])
		if err != nil {
			continue
		}
		cost, err := strconv.ParseUint(object.string("points"), 10, 32)
		if err != nil || cost == 0 {
			continue
		}
		itemName := object.string("item_name")
		name := schema.localize(object.string("callout"))
		if name == "" {
			name = humanizeIdentifier(strings.TrimPrefix(itemName, "lootlist:"))
		}
		lootListName := schema.armoryLootListName(itemName)
		offers = append(offers, ArmoryOffer{CampaignID: uint32(campaignID), RedeemID: uint32(redeemID), ExpectedCost: uint32(cost), ItemName: itemName, Name: name, Category: object.string("ui_order"), Items: schema.lootListItems(lootListName, nil)})
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

func (p *Provider) LoadInventoryDescriptions(ctx context.Context, steamID string) (map[string]InventoryDescription, error) {
	if steamID == "" {
		return nil, nil
	}
	if p.client == nil {
		p.client = &http.Client{Timeout: 15 * time.Second}
	}
	out := make(map[string]InventoryDescription)
	startAssetID := ""
	for {
		page, err := p.fetchInventoryPage(ctx, steamID, startAssetID)
		if err != nil {
			return nil, err
		}
		descriptions := make(map[string]InventoryDescription, len(page.Descriptions))
		for _, desc := range page.Descriptions {
			key := desc.ClassID + "_" + desc.InstanceID
			descriptions[key] = InventoryDescription{
				ClassID:           desc.ClassID,
				InstanceID:        desc.InstanceID,
				Name:              desc.Name,
				MarketName:        desc.MarketName,
				MarketHashName:    desc.MarketHashName,
				IconURL:           steamIconURL(desc.IconURL),
				IconURLLarge:      steamIconURL(desc.IconURLLarge),
				Type:              desc.Type,
				Tradable:          desc.Tradable != 0,
				Marketable:        desc.Marketable != 0,
				AppliedItemImages: appliedItemImages(desc.Descriptions),
				TradableAfter:     tradableAfter(desc.Descriptions),
			}
		}
		for _, asset := range page.Assets {
			key := asset.ClassID + "_" + asset.InstanceID
			desc, ok := descriptions[key]
			if !ok {
				continue
			}
			desc.AssetID = asset.AssetID
			out[asset.AssetID] = desc
			for _, name := range []string{desc.MarketHashName, desc.MarketName, desc.Name} {
				for _, key := range inventoryDescriptionNameKeys(name) {
					if _, ambiguous := out["ambiguous:"+key]; ambiguous {
						continue
					}
					if existing, present := out[key]; !present || sameInventoryDescription(existing, desc) {
						out[key] = desc
					} else {
						// Ambiguous names must never be used as a fallback join.
						delete(out, key)
						out["ambiguous:"+key] = InventoryDescription{}
					}
				}
			}
		}
		if !page.MoreItems.Bool() || page.LastAssetID == "" {
			return out, nil
		}
		startAssetID = page.LastAssetID
	}
}

func inventoryDescriptionNameKey(name string) string {
	name = strings.ToLower(strings.TrimSpace(name))
	if name == "" {
		return ""
	}
	return "name:" + name
}

func inventoryDescriptionNameKeys(name string) []string {
	exact := inventoryDescriptionNameKey(name)
	if exact == "" {
		return nil
	}
	keys := []string{exact}
	normalized := strings.TrimSpace(name)
	if cut := strings.LastIndex(normalized, " ("); cut > 0 && strings.HasSuffix(normalized, ")") {
		base := inventoryDescriptionNameKey(normalized[:cut])
		if base != "" && base != exact {
			keys = append(keys, base)
		}
	}
	return keys
}

func sameInventoryDescription(a InventoryDescription, b InventoryDescription) bool {
	return a.ClassID == b.ClassID && a.InstanceID == b.InstanceID
}

func (p *Provider) LoadMarketDescriptions(ctx context.Context, marketNames []string) (map[string]MarketDescription, error) {
	if len(marketNames) == 0 {
		return nil, nil
	}
	if p.client == nil {
		p.client = &http.Client{Timeout: 15 * time.Second}
	}
	out := make(map[string]MarketDescription)
	var errs []string
	seen := make(map[string]bool)
	for _, marketName := range marketNames {
		marketName = strings.TrimSpace(marketName)
		if marketName == "" || seen[marketName] {
			continue
		}
		seen[marketName] = true
		desc, err := p.fetchMarketDescription(ctx, marketName, false)
		if err != nil {
			errs = append(errs, fmt.Sprintf("%s: %v", marketName, err))
			continue
		}
		if desc.IconURL != "" || desc.IconURLLarge != "" {
			out[marketName] = desc
			if desc.HashName != "" {
				out[desc.HashName] = desc
			}
			if desc.MarketHashName != "" {
				out[desc.MarketHashName] = desc
			}
			if desc.MarketName != "" {
				out[desc.MarketName] = desc
			}
		}
	}
	if len(errs) > 0 && len(out) == 0 {
		return out, fmt.Errorf("fetch Steam market descriptions: %s", strings.Join(errs, "; "))
	}
	return out, nil
}

func (p *Provider) LoadPreviewDescriptions(ctx context.Context, marketNames []string) (map[string]MarketDescription, error) {
	if p.client == nil {
		p.client = &http.Client{Timeout: 15 * time.Second}
	}
	out := make(map[string]MarketDescription)
	seen := make(map[string]bool)
	unique := make([]string, 0, len(marketNames))
	for _, marketName := range marketNames {
		marketName = strings.TrimSpace(marketName)
		if marketName == "" || seen[marketName] {
			continue
		}
		seen[marketName] = true
		p.previewMu.Lock()
		cached, ok := p.previewCache[marketName]
		p.previewMu.Unlock()
		if ok {
			out[marketName] = cached
			continue
		}
		unique = append(unique, marketName)
	}
	var mu sync.Mutex
	var wait sync.WaitGroup
	var errs []string
	// Steam's public market search throttles short high-concurrency bursts.
	// Keep this deliberately small; the session cache prevents repeat work.
	workers := make(chan struct{}, 3)
	for _, marketName := range unique {
		wait.Add(1)
		go func(name string) {
			defer wait.Done()
			select {
			case workers <- struct{}{}:
			case <-ctx.Done():
				return
			}
			defer func() { <-workers }()
			desc, err := p.fetchMarketDescription(ctx, name, true)
			mu.Lock()
			defer mu.Unlock()
			if err != nil {
				errs = append(errs, fmt.Sprintf("%s: %v", name, err))
				return
			}
			out[name] = desc
			p.previewMu.Lock()
			if p.previewCache == nil {
				p.previewCache = make(map[string]MarketDescription)
			}
			p.previewCache[name] = desc
			p.previewMu.Unlock()
		}(marketName)
	}
	wait.Wait()
	if len(errs) > 0 {
		return out, fmt.Errorf("fetch Steam preview descriptions: %s", strings.Join(errs, "; "))
	}
	return out, nil
}

func (p *Provider) fetchMarketDescription(ctx context.Context, marketName string, allowExteriorVariant bool) (MarketDescription, error) {
	var errs []string
	for _, query := range marketSearchQueries(marketName) {
		desc, err := p.fetchMarketDescriptionQuery(ctx, marketName, query, allowExteriorVariant)
		if err == nil {
			return desc, nil
		}
		errs = append(errs, fmt.Sprintf("%s: %v", query, err))
	}
	return MarketDescription{}, errors.New(strings.Join(errs, "; "))
}

func (p *Provider) fetchMarketDescriptionQuery(ctx context.Context, marketName string, query string, allowExteriorVariant bool) (MarketDescription, error) {
	var lastErr error
	for attempt := 0; attempt < 3; attempt++ {
		if attempt > 0 {
			delay := time.Duration(attempt*500) * time.Millisecond
			select {
			case <-time.After(delay):
			case <-ctx.Done():
				return MarketDescription{}, ctx.Err()
			}
		}
		description, err := p.fetchMarketDescriptionQueryOnce(ctx, marketName, query, allowExteriorVariant)
		if err == nil {
			return description, nil
		}
		lastErr = err
		if !isTransientSteamMarketError(err) {
			break
		}
	}
	return MarketDescription{}, lastErr
}

func isTransientSteamMarketError(err error) bool {
	if err == nil {
		return false
	}
	message := strings.ToLower(err.Error())
	return strings.Contains(message, "http 429") || strings.Contains(message, "http 5") || strings.Contains(message, "timeout") || strings.Contains(message, "connection reset") || strings.Contains(message, "eof")
}

func (p *Provider) fetchMarketDescriptionQueryOnce(ctx context.Context, marketName string, query string, allowExteriorVariant bool) (MarketDescription, error) {
	values := url.Values{}
	values.Set("appid", "730")
	values.Set("norender", "1")
	values.Set("count", "10")
	values.Set("query", query)
	endpoint := "https://steamcommunity.com/market/search/render/?" + values.Encode()
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, endpoint, nil)
	if err != nil {
		return MarketDescription{}, err
	}
	req.Header.Set("User-Agent", "Mozilla/5.0 (compatible; cs-inv-edit/0.0; Steam metadata lookup)")
	resp, err := p.client.Do(req)
	if err != nil {
		return MarketDescription{}, err
	}
	defer resp.Body.Close()
	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		return MarketDescription{}, fmt.Errorf("HTTP %d", resp.StatusCode)
	}
	var page marketSearchPage
	if err := json.NewDecoder(resp.Body).Decode(&page); err != nil {
		return MarketDescription{}, err
	}
	if !page.Success {
		return MarketDescription{}, fmt.Errorf("response was not successful")
	}
	var cheapestVariant *MarketDescription
	for _, result := range page.Results {
		desc := result.AssetDescription
		hashName := firstNonEmpty(result.HashName, desc.MarketHashName, desc.MarketName, result.Name)
		exactMatch := marketNameMatches(marketName, hashName) || marketNameMatches(marketName, desc.MarketName) || marketNameMatches(marketName, result.Name)
		variantMatch := allowExteriorVariant && strings.HasPrefix(strings.ToLower(hashName), strings.ToLower(strings.TrimSpace(marketName))+" (")
		if !exactMatch && !variantMatch {
			continue
		}
		price := MarketPrice{
			SellPrice:     result.SellPrice,
			SellPriceText: result.SellPriceText,
			SalePriceText: result.SalePriceText,
			SellListings:  result.SellListings,
		}
		candidate := MarketDescription{
			Name:           firstNonEmpty(desc.Name, result.Name),
			HashName:       result.HashName,
			MarketName:     desc.MarketName,
			MarketHashName: desc.MarketHashName,
			IconURL:        steamIconURL(desc.IconURL),
			IconURLLarge:   steamIconURL(desc.IconURLLarge),
			Type:           desc.Type,
			Price:          price,
		}
		if exactMatch {
			return candidate, nil
		}
		if cheapestVariant == nil || (result.SellPrice > 0 && (cheapestVariant.Price.SellPrice <= 0 || result.SellPrice < cheapestVariant.Price.SellPrice)) {
			candidate.Price.SellPriceText = "From " + candidate.Price.SellPriceText
			cheapestVariant = &candidate
		}
	}
	if cheapestVariant != nil {
		return *cheapestVariant, nil
	}
	return MarketDescription{}, fmt.Errorf("no exact market result")
}

func marketSearchQueries(marketName string) []string {
	marketName = strings.TrimSpace(marketName)
	queries := make([]string, 0, 2)
	if _, after, ok := strings.Cut(marketName, "|"); ok {
		unqualifiedName := strings.TrimSpace(after)
		if unqualifiedName != "" {
			queries = append(queries, unqualifiedName)
		}
	}
	if marketName != "" && !containsStringFold(queries, marketName) {
		queries = append(queries, marketName)
	}
	return queries
}

func containsStringFold(values []string, target string) bool {
	for _, value := range values {
		if strings.EqualFold(strings.TrimSpace(value), strings.TrimSpace(target)) {
			return true
		}
	}
	return false
}

func (p *Provider) fetchInventoryPage(ctx context.Context, steamID string, startAssetID string) (inventoryPage, error) {
	values := url.Values{}
	values.Set("l", "english")
	values.Set("count", "5000")
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

func (s *Schema) Metadata(defIndex uint32, paintKit uint32, attributes map[uint32]uint32) Metadata {
	item, ok := s.items[defIndex]
	if !ok {
		name := fmt.Sprintf("Unknown CS2 item #%d", defIndex)
		return Metadata{Name: name, MarketName: name, Kind: "unknown"}
	}
	name := s.localize(item.ItemName)
	if name == "" {
		name = item.Name
	}
	if name == "" {
		name = fmt.Sprintf("CS2 item #%d", defIndex)
	}
	kind := itemKind(item)
	marketName := name
	rarity := item.Rarity
	var wearMin, wearMax *float64
	if paintKit != 0 {
		if paint, ok := s.paintKits[paintKit]; ok {
			wearMin, wearMax = paint.WearMin, paint.WearMax
			rarity = firstNonEmpty(paint.Rarity, rarity)
			paintName := s.localize(paint.Description)
			if paintName == "" {
				paintName = paint.Name
			}
			if paintName != "" && isWeaponItem(item) {
				marketName = fmt.Sprintf("%s | %s", name, paintName)
				kind = "weapon_skin"
			}
		}
	}
	if sticker := s.matchStickerKit(attributes); sticker != nil && isGenericGraffitiItem(item, name) {
		rarity = firstNonEmpty(sticker.Rarity, rarity)
		graffitiName := s.localize(sticker.ItemName)
		if graffitiName == "" {
			graffitiName = humanizeIdentifier(sticker.Name)
		}
		if graffitiName != "" {
			prefix := "Graffiti"
			if strings.Contains(strings.ToLower(name), "sealed") || item.ToolType == "spray" {
				prefix = "Sealed Graffiti"
			}
			name = graffitiName
			marketName = prefix + " | " + graffitiName
			kind = "tool_item"
		}
	}
	if sticker := s.matchStickerKit(attributes); sticker != nil && isGenericStickerItem(item, name) {
		rarity = firstNonEmpty(sticker.Rarity, rarity)
		stickerName := s.localize(sticker.ItemName)
		if stickerName == "" {
			stickerName = humanizeIdentifier(sticker.Name)
		}
		if stickerName != "" {
			name = stickerName
			marketName = "Sticker | " + stickerName
			kind = "sticker_item"
		}
	}
	if music := s.matchMusicDefinition(attributes); music != nil && isGenericMusicItem(item, name) {
		musicName := s.localize(music.ItemName)
		if musicName == "" {
			musicName = humanizeIdentifier(music.Name)
		}
		if musicName != "" {
			name = musicName
			marketName = "Music Kit | " + musicName
			kind = "cs2_econ_item"
		}
	}
	if keychain := s.matchKeychain(attributes); keychain != nil && isGenericKeychainItem(item, name) {
		keychainName := s.localize(keychain.ItemName)
		if keychainName == "" {
			keychainName = humanizeIdentifier(keychain.Name)
		}
		if keychainName != "" {
			name = keychainName
			marketName = "Charm | " + keychainName
			kind = "tool_item"
		}
	}
	return s.metadataResult(item, name, marketName, kind, rarity, paintKit, attributes, wearMin, wearMax)
}

func (s *Schema) metadataResult(item itemDefinition, name string, marketName string, kind string, rarity string, paintKit uint32, attributes map[uint32]uint32, wearMin *float64, wearMax *float64) Metadata {
	return Metadata{
		Name:            name,
		MarketName:      marketName,
		Kind:            kind,
		Rarity:          rarity,
		ToolType:        item.ToolType,
		IsNameTagTool:   strings.EqualFold(name, "Name Tag") || strings.Contains(strings.ToLower(item.Name), "name_tag"),
		Collection:      s.collectionNameFor(item.Name, paintKit),
		CollectionItems: s.collectionItemsFor(item.Name, paintKit),
		TradeUpItems:    s.tradeUpItemsFor(item.Name, paintKit, rarity),
		ContainerItems:  s.lootListItems(item.LootList, nil),
		Tradable:        schemaTradable(item),
		PaintWearMin:    wearMin,
		PaintWearMax:    wearMax,
	}
}

func schemaTradable(item itemDefinition) *bool {
	// items_game capabilities are authoritative for definitions that can never
	// be traded. A positive capability does not override an instance trade lock.
	if value := strings.TrimSpace(item.Capabilities["can_trade"]); value == "0" {
		tradable := false
		return &tradable
	}
	return nil
}

func (s *Schema) AppliedItems(defIndex uint32, attributes map[uint32]uint32) []AppliedItem {
	item := s.items[defIndex]
	itemName := s.localize(item.ItemName)
	// Attribute 113 identifies the sticker item itself on generic sticker
	// definitions; it is only an applied slot on weapons and agents.
	if isGenericStickerItem(item, itemName) || isGenericGraffitiItem(item, itemName) {
		return nil
	}
	isAgent := strings.Contains(strings.ToLower(item.Prefab+" "+item.ItemClass+" "+item.Name), "customplayer")
	out := make([]AppliedItem, 0, 7)
	for slot := uint32(0); slot < 6; slot++ {
		id := attributes[113+slot*4]
		if id == 0 {
			continue
		}
		sticker, ok := s.stickerKits[id]
		name := fmt.Sprintf("Sticker #%d", id)
		if ok {
			name = firstNonEmpty(s.localize(sticker.ItemName), humanizeIdentifier(sticker.Name), name)
		}
		kind := "sticker"
		if isAgent {
			kind = "patch"
		}
		out = append(out, AppliedItem{Kind: kind, Slot: slot, ID: id, Name: name})
	}
	if id := attributes[299]; id != 0 && !isGenericKeychainItem(item, itemName) {
		keychain, ok := s.keychains[id]
		name := fmt.Sprintf("Charm #%d", id)
		if ok {
			name = firstNonEmpty(s.localize(keychain.ItemName), humanizeIdentifier(keychain.Name), name)
		}
		out = append(out, AppliedItem{Kind: "charm", ID: id, Name: name})
	}
	return out
}

func (m Metadata) WithInventoryDescription(desc InventoryDescription) Metadata {
	m.AppliedItemImages = append([]string(nil), desc.AppliedItemImages...)
	tradable := desc.Tradable
	m.Tradable = &tradable
	m.TradableAfter = desc.TradableAfter
	if desc.Name != "" {
		m.Name = desc.Name
	}
	marketName := firstNonEmpty(desc.MarketHashName, desc.MarketName)
	if marketName != "" && !wouldDiscardWeaponFinish(m, marketName) {
		m.MarketName = marketName
	}
	if desc.IconURLLarge != "" {
		m.ImageURL = desc.IconURLLarge
	} else if desc.IconURL != "" {
		m.ImageURL = desc.IconURL
	}
	if desc.Type != "" && m.Kind == "unknown" {
		m.Kind = kindFromSteamType(desc.Type)
	}
	return m
}

// Steam occasionally returns an asset description containing only the base
// weapon name. The GC paint kit plus items_game schema still identifies the
// actual finish in that case, so keep the richer schema-derived market name.
// This also lets the subsequent market-description lookup fetch the skin icon.
func wouldDiscardWeaponFinish(metadata Metadata, replacement string) bool {
	return metadata.Kind == "weapon_skin" &&
		strings.Contains(metadata.MarketName, " | ") &&
		!strings.Contains(replacement, " | ")
}

func (m Metadata) WithMarketDescription(desc MarketDescription) Metadata {
	if desc.Name != "" && (m.Name == "" || strings.HasPrefix(m.Name, "CS2 item #") || strings.EqualFold(m.Name, "Sticker") || strings.EqualFold(m.Name, "Music Kit")) {
		m.Name = desc.Name
	}
	if desc.MarketHashName != "" {
		m.MarketName = desc.MarketHashName
	} else if desc.MarketName != "" {
		m.MarketName = desc.MarketName
	} else if desc.HashName != "" {
		m.MarketName = desc.HashName
	}
	if desc.IconURLLarge != "" {
		m.ImageURL = desc.IconURLLarge
	} else if desc.IconURL != "" {
		m.ImageURL = desc.IconURL
	}
	if desc.Type != "" && (m.Kind == "" || m.Kind == "unknown") {
		m.Kind = kindFromSteamType(desc.Type)
	}
	m.MarketPrice = desc.Price
	return m
}

func (s *Schema) parseItems(root kvObject) {
	itemsGame := root.object("items_game")
	prefabs := itemsGame.object("prefabs")
	for key, node := range itemsGame.object("items") {
		defIndex, err := strconv.ParseUint(key, 10, 32)
		if err != nil {
			continue
		}
		merged := mergePrefab(node.objectValue(), prefabs, nil)
		s.items[uint32(defIndex)] = itemDefinition{
			Name:              merged.string("name"),
			ItemName:          merged.string("item_name"),
			TypeName:          merged.string("item_type_name"),
			ItemClass:         merged.string("item_class"),
			Prefab:            merged.string("prefab"),
			Rarity:            merged.string("item_rarity"),
			Image:             merged.string("image_inventory"),
			ToolType:          merged.object("tool").string("type"),
			Capabilities:      merged.object("capabilities").strings(),
			LootList:          merged.string("loot_list_name"),
			SupplyCrateSeries: merged.object("attributes").object("set supply crate series").string("value"),
		}
	}
	for key, node := range itemsGame.object("paint_kits") {
		paintKit, err := strconv.ParseUint(key, 10, 32)
		if err != nil {
			continue
		}
		paint := node.objectValue()
		s.paintKits[uint32(paintKit)] = paintKitDefinition{
			Name:        paint.string("name"),
			Description: paint.string("description_tag"),
			Rarity:      itemsGame.object("paint_kits_rarity").string(paint.string("name")),
			WearMin:     optionalFloat(paint.string("wear_remap_min")),
			WearMax:     optionalFloat(paint.string("wear_remap_max")),
		}
	}
	for key, node := range itemsGame.object("sticker_kits") {
		stickerKit, err := strconv.ParseUint(key, 10, 32)
		if err != nil {
			continue
		}
		sticker := node.objectValue()
		s.stickerKits[uint32(stickerKit)] = stickerKitDefinition{
			Name:     sticker.string("name"),
			ItemName: sticker.string("item_name"),
			Material: sticker.string("sticker_material"),
			Rarity:   sticker.string("item_rarity"),
		}
	}
	for key, node := range itemsGame.object("music_definitions") {
		musicID, err := strconv.ParseUint(key, 10, 32)
		if err != nil {
			continue
		}
		music := node.objectValue()
		s.musicDefinitions[uint32(musicID)] = musicDefinition{
			Name:     music.string("name"),
			ItemName: music.string("loc_name"),
			Image:    music.string("image_inventory"),
		}
	}
	for key, node := range itemsGame.object("keychain_definitions") {
		keychainID, err := strconv.ParseUint(key, 10, 32)
		if err != nil {
			continue
		}
		keychain := node.objectValue()
		s.keychains[uint32(keychainID)] = keychainDefinition{
			Name:     keychain.string("name"),
			ItemName: keychain.string("loc_name"),
			Image:    keychain.string("image_inventory"),
			Rarity:   keychain.string("item_rarity"),
		}
	}
	s.parseCollections(itemsGame)
}

func optionalFloat(value string) *float64 {
	parsed, err := strconv.ParseFloat(strings.TrimSpace(value), 64)
	if err != nil {
		return nil
	}
	return &parsed
}

func (s *Schema) parseCollections(itemsGame kvObject) {
	if s.collections == nil {
		s.collections = make(map[string]collectionDefinition)
	}
	if s.collectionByItem == nil {
		s.collectionByItem = make(map[string]string)
	}
	if s.lootLists == nil {
		s.lootLists = make(map[string][]string)
	}
	for key, node := range itemsGame.object("item_sets") {
		set := node.objectValue()
		definition := collectionDefinition{Name: s.localize(set.string("name"))}
		if definition.Name == "" {
			definition.Name = humanizeIdentifier(key)
		}
		for itemKey := range set.object("items") {
			definition.Items = append(definition.Items, itemKey)
			s.collectionByItem[itemKey] = key
		}
		s.collections[key] = definition
	}
	for key, node := range itemsGame.object("client_loot_lists") {
		for entry := range node.objectValue() {
			s.lootLists[key] = append(s.lootLists[key], entry)
		}
	}
	for series, node := range itemsGame.object("revolving_loot_lists") {
		if node.value != "" {
			s.revolvingLootLists[series] = node.value
		}
	}
}

func (s *Schema) armoryLootListName(itemName string) string {
	if strings.HasPrefix(itemName, "lootlist:") {
		return strings.TrimPrefix(itemName, "lootlist:")
	}
	for _, item := range s.items {
		if item.Name != itemName {
			continue
		}
		if item.LootList != "" {
			return item.LootList
		}
		if item.SupplyCrateSeries != "" {
			return s.revolvingLootLists[item.SupplyCrateSeries]
		}
	}
	return ""
}

func schemaItemKey(itemName string, paintKit uint32, paintKits map[uint32]paintKitDefinition) string {
	if paint, ok := paintKits[paintKit]; ok && paint.Name != "" {
		return "[" + paint.Name + "]" + itemName
	}
	return itemName
}

func (s *Schema) collectionNameFor(itemName string, paintKit uint32) string {
	key := schemaItemKey(itemName, paintKit, s.paintKits)
	setKey := s.collectionByItem[key]
	return s.collections[setKey].Name
}

func (s *Schema) collectionItemsFor(itemName string, paintKit uint32) []RelatedItem {
	key := schemaItemKey(itemName, paintKit, s.paintKits)
	setKey := s.collectionByItem[key]
	return s.relatedItems(s.collections[setKey].Items)
}

func (s *Schema) tradeUpItemsFor(itemName string, paintKit uint32, rarity string) []RelatedItem {
	targetRank := rarityRank(rarity) + 1
	if targetRank == 7 {
		return s.rareSpecialTradeUpItems(schemaItemKey(itemName, paintKit, s.paintKits))
	}
	if targetRank <= 1 || targetRank > 6 {
		return nil
	}
	var out []RelatedItem
	for _, item := range s.collectionItemsFor(itemName, paintKit) {
		if rarityRank(item.Rarity) == targetRank {
			out = append(out, item)
		}
	}
	return out
}

func (s *Schema) rareSpecialTradeUpItems(inputKey string) []RelatedItem {
	seenItems := make(map[string]bool)
	var out []RelatedItem
	for lootList := range s.lootLists {
		if !s.lootListContains(lootList, inputKey, nil) {
			continue
		}
		for _, item := range s.lootListItems(lootList, nil) {
			key := item.MarketName
			if rarityRank(item.Rarity) != 7 || key == "" || seenItems[key] {
				continue
			}
			seenItems[key] = true
			out = append(out, item)
		}
	}
	sort.SliceStable(out, func(i, j int) bool { return out[i].MarketName < out[j].MarketName })
	return out
}

func (s *Schema) lootListContains(name string, target string, seen map[string]bool) bool {
	if seen == nil {
		seen = make(map[string]bool)
	}
	if seen[name] {
		return false
	}
	seen[name] = true
	for _, entry := range s.lootLists[name] {
		if entry == target {
			return true
		}
		if _, nested := s.lootLists[entry]; nested && s.lootListContains(entry, target, seen) {
			return true
		}
	}
	return false
}

func (s *Schema) relatedItems(keys []string) []RelatedItem {
	items := make([]RelatedItem, 0, len(keys))
	for _, key := range keys {
		paintName, itemName := splitSchemaItemKey(key)
		if related, ok := s.relatedSpecialItem(paintName, itemName); ok {
			items = append(items, related)
			continue
		}
		var item itemDefinition
		for _, candidate := range s.items {
			if candidate.Name == itemName {
				item = candidate
				break
			}
		}
		if item.Name == "" {
			continue
		}
		baseName := firstNonEmpty(s.localize(item.ItemName), item.Name)
		related := RelatedItem{Name: baseName, MarketName: baseName, Kind: itemKind(item), Rarity: item.Rarity}
		for _, paint := range s.paintKits {
			if paint.Name == paintName {
				paintDisplay := firstNonEmpty(s.localize(paint.Description), paint.Name)
				related.MarketName = baseName + " | " + paintDisplay
				related.Rarity = firstNonEmpty(paint.Rarity, related.Rarity)
				related.WearMin = paint.WearMin
				related.WearMax = paint.WearMax
				break
			}
		}
		items = append(items, related)
	}
	sort.SliceStable(items, func(i, j int) bool {
		left, right := rarityRank(items[i].Rarity), rarityRank(items[j].Rarity)
		if left != right {
			return left > right
		}
		return items[i].MarketName < items[j].MarketName
	})
	return items
}

func (s *Schema) relatedSpecialItem(variantName string, itemName string) (RelatedItem, bool) {
	if variantName == "" {
		return RelatedItem{}, false
	}
	if itemName == "sticker" || itemName == "spray" || itemName == "patch" {
		for _, sticker := range s.stickerKits {
			if sticker.Name != variantName {
				continue
			}
			name := firstNonEmpty(s.localize(sticker.ItemName), humanizeIdentifier(sticker.Name))
			prefix := "Sticker | "
			if itemName == "patch" || strings.HasPrefix(sticker.Name, "patch_") {
				prefix = "Patch | "
			} else if itemName == "spray" || strings.HasPrefix(sticker.Name, "spray_") {
				prefix = "Sealed Graffiti | "
			}
			return RelatedItem{Name: name, MarketName: prefix + name, Kind: itemName, Rarity: sticker.Rarity}, true
		}
	}
	if itemName == "keychain" {
		for _, keychain := range s.keychains {
			if keychain.Name != variantName {
				continue
			}
			name := firstNonEmpty(s.localize(keychain.ItemName), humanizeIdentifier(keychain.Name))
			return RelatedItem{Name: name, MarketName: "Charm | " + name, Kind: "keychain", Rarity: keychain.Rarity}, true
		}
	}
	return RelatedItem{}, false
}

func rarityRank(rarity string) int {
	switch strings.ToLower(strings.TrimSpace(rarity)) {
	case "immortal", "contraband", "contraband (discontinued)", "clandestine":
		return 8
	case "exceedingly rare", "rare special (★)", "rare special item", "knife", "gloves", "unusual":
		return 7
	case "ancient", "covert", "extraordinary", "master":
		return 6
	case "legendary", "classified", "exotic", "superior":
		return 5
	case "mythical", "restricted", "remarkable", "exceptional":
		return 4
	case "rare", "mil-spec", "mil-spec grade", "high grade", "distinguished":
		return 3
	case "uncommon", "industrial grade", "medium grade":
		return 2
	case "common", "consumer grade", "base grade":
		return 1
	default:
		return 0
	}
}

func RelatedItemMarketNames(items []RelatedItem) []string {
	names := make([]string, 0, len(items))
	for _, item := range items {
		if item.MarketName != "" {
			names = append(names, item.MarketName)
		}
	}
	return names
}

func ApplyRelatedItemDescriptions(items []RelatedItem, descriptions map[string]MarketDescription) []RelatedItem {
	out := append([]RelatedItem(nil), items...)
	for index := range out {
		if description, ok := descriptions[out[index].MarketName]; ok {
			out[index].ImageURL = firstNonEmpty(description.IconURLLarge, description.IconURL)
			out[index].Price = description.Price.SellPriceText
			out[index].ListingName = firstNonEmpty(description.HashName, description.MarketHashName, description.MarketName)
		}
	}
	return out
}

func splitSchemaItemKey(key string) (string, string) {
	if strings.HasPrefix(key, "[") {
		if end := strings.IndexByte(key, ']'); end > 1 {
			return key[1:end], key[end+1:]
		}
	}
	return "", key
}

func (s *Schema) lootListItems(name string, seen map[string]bool) []RelatedItem {
	if name == "" {
		return nil
	}
	if seen == nil {
		seen = make(map[string]bool)
	}
	if seen[name] {
		return nil
	}
	seen[name] = true
	var keys []string
	for _, entry := range s.lootLists[name] {
		if _, nested := s.lootLists[entry]; nested {
			keys = append(keys, s.relatedItemKeysFromLootList(entry, seen)...)
			continue
		}
		keys = append(keys, entry)
	}
	return s.relatedItems(keys)
}

func (s *Schema) relatedItemKeysFromLootList(name string, seen map[string]bool) []string {
	if seen[name] {
		return nil
	}
	seen[name] = true
	var keys []string
	for _, entry := range s.lootLists[name] {
		if _, nested := s.lootLists[entry]; nested {
			keys = append(keys, s.relatedItemKeysFromLootList(entry, seen)...)
		} else {
			keys = append(keys, entry)
		}
	}
	return keys
}

func parseTokens(root kvObject) map[string]string {
	out := make(map[string]string)
	for key, node := range root.object("lang").object("Tokens") {
		if node.value != "" {
			out[strings.ToLower(key)] = node.value
		}
	}
	return out
}

func mergePrefab(base kvObject, prefabs kvObject, seen map[string]bool) kvObject {
	out := make(kvObject)
	for key, value := range base {
		out[key] = value
	}
	if seen == nil {
		seen = make(map[string]bool)
	}
	for _, prefabName := range strings.Fields(base.string("prefab")) {
		if seen[prefabName] {
			continue
		}
		seen[prefabName] = true
		parent := prefabs.object(prefabName)
		if len(parent) == 0 {
			continue
		}
		mergedParent := mergePrefab(parent, prefabs, seen)
		for key, value := range mergedParent {
			if _, exists := out[key]; !exists {
				out[key] = value
			}
		}
	}
	return out
}

func (s *Schema) localize(token string) string {
	token = strings.TrimPrefix(token, "#")
	if token == "" {
		return ""
	}
	return s.tokens[strings.ToLower(token)]
}

func (s *Schema) matchStickerKit(attributes map[uint32]uint32) *stickerKitDefinition {
	for _, value := range attributes {
		if sticker, ok := s.stickerKits[value]; ok {
			return &sticker
		}
	}
	return nil
}

func (s *Schema) matchMusicDefinition(attributes map[uint32]uint32) *musicDefinition {
	for _, value := range attributes {
		if music, ok := s.musicDefinitions[value]; ok {
			return &music
		}
	}
	return nil
}

func (s *Schema) matchKeychain(attributes map[uint32]uint32) *keychainDefinition {
	for _, value := range attributes {
		if keychain, ok := s.keychains[value]; ok {
			return &keychain
		}
	}
	return nil
}

func isGenericStickerItem(item itemDefinition, name string) bool {
	lowerName := strings.ToLower(name)
	return item.ToolType == "sticker" || lowerName == "sticker" || strings.Contains(strings.ToLower(item.Prefab), "sticker")
}

func isGenericGraffitiItem(item itemDefinition, name string) bool {
	lower := strings.ToLower(item.Name + " " + item.ToolType + " " + item.Prefab + " " + name)
	return strings.Contains(lower, "spray") || strings.Contains(lower, "graffiti")
}

func isGenericMusicItem(item itemDefinition, name string) bool {
	lowerName := strings.ToLower(name)
	return strings.Contains(strings.ToLower(item.Prefab), "musickit") || strings.Contains(strings.ToLower(item.Name), "musickit") || lowerName == "music kit"
}

func isGenericKeychainItem(item itemDefinition, name string) bool {
	lower := strings.ToLower(item.Name + " " + item.ToolType + " " + item.Prefab + " " + name)
	return strings.Contains(lower, "keychain") || strings.Contains(lower, "charm")
}

func humanizeIdentifier(value string) string {
	value = strings.TrimSpace(value)
	if value == "" {
		return ""
	}
	replacer := strings.NewReplacer("_", " ", "-", " ")
	words := strings.Fields(replacer.Replace(value))
	for i, word := range words {
		if len(word) == 0 {
			continue
		}
		words[i] = strings.ToUpper(word[:1]) + word[1:]
	}
	return strings.Join(words, " ")
}

func itemKind(item itemDefinition) string {
	itemClass := strings.ToLower(item.ItemClass)
	prefab := strings.ToLower(item.Prefab)
	typeName := strings.ToLower(item.TypeName)
	switch {
	case strings.Contains(itemClass, "supply_crate") || strings.Contains(prefab, "crate") || strings.Contains(prefab, "capsule") || strings.Contains(typeName, "weaponcase") || strings.Contains(typeName, "capsule"):
		return "container"
	case strings.Contains(itemClass, "sticker") || strings.Contains(prefab, "sticker"):
		return "sticker_item"
	case strings.Contains(itemClass, "tool") || item.ToolType != "":
		return "tool_item"
	case isWeaponItem(item):
		return "weapon_skin"
	default:
		return "cs2_econ_item"
	}
}

func kindFromSteamType(typeName string) string {
	lower := strings.ToLower(typeName)
	switch {
	case strings.Contains(lower, "container") || strings.Contains(lower, "case") || strings.Contains(lower, "capsule"):
		return "container"
	case strings.Contains(lower, "sticker"):
		return "sticker_item"
	case strings.Contains(lower, "tool") || strings.Contains(lower, "tag"):
		return "tool_item"
	case strings.Contains(lower, "rifle") || strings.Contains(lower, "pistol") || strings.Contains(lower, "sniper") || strings.Contains(lower, "shotgun") || strings.Contains(lower, "smg"):
		return "weapon_skin"
	default:
		return "cs2_econ_item"
	}
}

func isWeaponItem(item itemDefinition) bool {
	itemClass := strings.ToLower(item.ItemClass)
	prefab := strings.ToLower(item.Prefab)
	return strings.HasPrefix(itemClass, "weapon_") || strings.Contains(prefab, "weapon")
}

func steamIconURL(icon string) string {
	if icon == "" {
		return ""
	}
	if strings.HasPrefix(icon, "http://") || strings.HasPrefix(icon, "https://") {
		return icon
	}
	return "https://community.fastly.steamstatic.com/economy/image/" + strings.TrimPrefix(icon, "/")
}

func firstNonEmpty(values ...string) string {
	for _, value := range values {
		if strings.TrimSpace(value) != "" {
			return value
		}
	}
	return ""
}

func marketNameMatches(want string, got string) bool {
	return strings.EqualFold(strings.TrimSpace(want), strings.TrimSpace(got))
}

type marketSearchPage struct {
	Success bool                 `json:"success"`
	Results []marketSearchResult `json:"results"`
}

type marketSearchResult struct {
	Name             string                 `json:"name"`
	HashName         string                 `json:"hash_name"`
	SellListings     int                    `json:"sell_listings"`
	SellPrice        int                    `json:"sell_price"`
	SellPriceText    string                 `json:"sell_price_text"`
	SalePriceText    string                 `json:"sale_price_text"`
	AssetDescription marketAssetDescription `json:"asset_description"`
}

type marketAssetDescription struct {
	Name           string `json:"name"`
	MarketName     string `json:"market_name"`
	MarketHashName string `json:"market_hash_name"`
	IconURL        string `json:"icon_url"`
	IconURLLarge   string `json:"icon_url_large"`
	Type           string `json:"type"`
}

type inventoryPage struct {
	Success      flexibleBool           `json:"success"`
	MoreItems    flexibleBool           `json:"more_items"`
	LastAssetID  string                 `json:"last_assetid"`
	Assets       []inventoryAsset       `json:"assets"`
	Descriptions []inventoryDescription `json:"descriptions"`
}

type inventoryAsset struct {
	AssetID    string `json:"assetid"`
	ClassID    string `json:"classid"`
	InstanceID string `json:"instanceid"`
}

type inventoryDescription struct {
	ClassID        string                     `json:"classid"`
	InstanceID     string                     `json:"instanceid"`
	Name           string                     `json:"name"`
	MarketName     string                     `json:"market_name"`
	MarketHashName string                     `json:"market_hash_name"`
	IconURL        string                     `json:"icon_url"`
	IconURLLarge   string                     `json:"icon_url_large"`
	Type           string                     `json:"type"`
	Tradable       int                        `json:"tradable"`
	Marketable     int                        `json:"marketable"`
	Descriptions   []inventoryDescriptionLine `json:"descriptions"`
}

type inventoryDescriptionLine struct {
	Value string `json:"value"`
}

var descriptionImagePattern = regexp.MustCompile(`(?i)<img[^>]+src=["']([^"']+)["']`)

func appliedItemImages(lines []inventoryDescriptionLine) []string {
	var images []string
	for _, line := range lines {
		for _, match := range descriptionImagePattern.FindAllStringSubmatch(line.Value, -1) {
			if len(match) < 2 {
				continue
			}
			imageURL := html.UnescapeString(match[1])
			lower := strings.ToLower(imageURL)
			if strings.HasPrefix(lower, "https://") && (strings.Contains(lower, "/stickers/") || strings.Contains(lower, "/patches/") || strings.Contains(lower, "/keychains/") || strings.Contains(lower, "/economy/image/")) {
				images = append(images, imageURL)
			}
		}
	}
	return images
}

var tradableAfterPattern = regexp.MustCompile(`(?i)Tradable After\s+([A-Za-z]{3}\s+\d{1,2},\s+\d{4}\s+\(\d{1,2}:\d{2}:\d{2}\)\s+GMT)`)

func tradableAfter(lines []inventoryDescriptionLine) string {
	for _, line := range lines {
		match := tradableAfterPattern.FindStringSubmatch(line.Value)
		if len(match) < 2 {
			continue
		}
		value := strings.NewReplacer("(", "", ")", "").Replace(match[1])
		if parsed, err := time.Parse("Jan 2, 2006 15:04:05 MST", value); err == nil {
			return parsed.UTC().Format(time.RFC3339)
		}
	}
	return ""
}

type flexibleBool bool

func (b *flexibleBool) UnmarshalJSON(data []byte) error {
	switch strings.TrimSpace(string(data)) {
	case "true", "1":
		*b = true
	case "false", "0", "null", "":
		*b = false
	default:
		return fmt.Errorf("invalid boolean value %s", string(data))
	}
	return nil
}

func (b flexibleBool) Bool() bool {
	return bool(b)
}
