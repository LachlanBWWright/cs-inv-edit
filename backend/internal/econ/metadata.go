package econ

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"strconv"
	"strings"
	"time"
)

const (
	itemsGameURL = "https://raw.githubusercontent.com/SteamDatabase/GameTracking-CS2/master/game/csgo/pak01_dir/scripts/items/items_game.txt"
	englishURL   = "https://raw.githubusercontent.com/SteamDatabase/GameTracking-CS2/master/game/csgo/pak01_dir/resource/csgo_english.txt"
)

type Provider struct {
	client *http.Client
}

type Metadata struct {
	Name            string
	MarketName      string
	Kind            string
	Rarity          string
	ImageURL        string
	MarketPrice     MarketPrice
	ToolType        string
	IsNameTagTool   bool
	Collection      string
	CollectionItems []RelatedItem
	ContainerItems  []RelatedItem
}

type RelatedItem struct {
	Name       string
	MarketName string
	Rarity     string
}

type MarketPrice struct {
	SellPrice     int
	SellPriceText string
	SalePriceText string
	SellListings  int
}

type InventoryDescription struct {
	AssetID        string
	ClassID        string
	InstanceID     string
	Name           string
	MarketName     string
	MarketHashName string
	IconURL        string
	IconURLLarge   string
	Type           string
	Tradable       bool
	Marketable     bool
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
	items            map[uint32]itemDefinition
	paintKits        map[uint32]paintKitDefinition
	stickerKits      map[uint32]stickerKitDefinition
	musicDefinitions map[uint32]musicDefinition
	keychains        map[uint32]keychainDefinition
	tokens           map[string]string
	collections      map[string]collectionDefinition
	collectionByItem map[string]string
	lootLists        map[string][]string
}

type collectionDefinition struct {
	Name  string
	Items []string
}

type itemDefinition struct {
	Name         string
	ItemName     string
	TypeName     string
	ItemClass    string
	Prefab       string
	Rarity       string
	Image        string
	ToolType     string
	Capabilities map[string]string
	LootList     string
}

type paintKitDefinition struct {
	Name        string
	Description string
	Rarity      string
}

type stickerKitDefinition struct {
	Name     string
	ItemName string
	Material string
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
}

func NewProvider() *Provider {
	return &Provider{client: &http.Client{Timeout: 15 * time.Second}}
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
		items:            make(map[uint32]itemDefinition),
		paintKits:        make(map[uint32]paintKitDefinition),
		stickerKits:      make(map[uint32]stickerKitDefinition),
		musicDefinitions: make(map[uint32]musicDefinition),
		keychains:        make(map[uint32]keychainDefinition),
		tokens:           parseTokens(englishRoot),
		collections:      make(map[string]collectionDefinition),
		collectionByItem: make(map[string]string),
		lootLists:        make(map[string][]string),
	}
	schema.parseItems(itemsRoot)
	if len(schema.items) == 0 {
		return nil, fmt.Errorf("CS2 items_game schema contained no item definitions")
	}
	return schema, nil
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
				ClassID:        desc.ClassID,
				InstanceID:     desc.InstanceID,
				Name:           desc.Name,
				MarketName:     desc.MarketName,
				MarketHashName: desc.MarketHashName,
				IconURL:        steamIconURL(desc.IconURL),
				IconURLLarge:   steamIconURL(desc.IconURLLarge),
				Type:           desc.Type,
				Tradable:       desc.Tradable != 0,
				Marketable:     desc.Marketable != 0,
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
		}
		if !page.MoreItems.Bool() || page.LastAssetID == "" {
			return out, nil
		}
		startAssetID = page.LastAssetID
	}
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
		desc, err := p.fetchMarketDescription(ctx, marketName)
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

func (p *Provider) fetchMarketDescription(ctx context.Context, marketName string) (MarketDescription, error) {
	var errs []string
	for _, query := range marketSearchQueries(marketName) {
		desc, err := p.fetchMarketDescriptionQuery(ctx, marketName, query)
		if err == nil {
			return desc, nil
		}
		errs = append(errs, fmt.Sprintf("%s: %v", query, err))
	}
	return MarketDescription{}, errors.New(strings.Join(errs, "; "))
}

func (p *Provider) fetchMarketDescriptionQuery(ctx context.Context, marketName string, query string) (MarketDescription, error) {
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
	for _, result := range page.Results {
		desc := result.AssetDescription
		hashName := firstNonEmpty(result.HashName, desc.MarketHashName, desc.MarketName, result.Name)
		if !marketNameMatches(marketName, hashName) && !marketNameMatches(marketName, desc.MarketName) && !marketNameMatches(marketName, result.Name) {
			continue
		}
		return MarketDescription{
			Name:           firstNonEmpty(desc.Name, result.Name),
			HashName:       result.HashName,
			MarketName:     desc.MarketName,
			MarketHashName: desc.MarketHashName,
			IconURL:        steamIconURL(desc.IconURL),
			IconURLLarge:   steamIconURL(desc.IconURLLarge),
			Type:           desc.Type,
			Price: MarketPrice{
				SellPrice:     result.SellPrice,
				SellPriceText: result.SellPriceText,
				SalePriceText: result.SalePriceText,
				SellListings:  result.SellListings,
			},
		}, nil
	}
	return MarketDescription{}, fmt.Errorf("no exact market result")
}

func marketSearchQueries(marketName string) []string {
	marketName = strings.TrimSpace(marketName)
	queries := []string{marketName}
	if before, after, ok := strings.Cut(marketName, "|"); ok && strings.EqualFold(strings.TrimSpace(before), "Sticker") {
		stickerName := strings.TrimSpace(after)
		if stickerName != "" && !containsStringFold(queries, stickerName) {
			queries = append(queries, stickerName)
		}
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
	if paintKit != 0 {
		if paint, ok := s.paintKits[paintKit]; ok {
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
	return Metadata{
		Name:            name,
		MarketName:      marketName,
		Kind:            kind,
		Rarity:          rarity,
		ToolType:        item.ToolType,
		IsNameTagTool:   strings.EqualFold(name, "Name Tag") || strings.Contains(strings.ToLower(item.Name), "name_tag"),
		Collection:      s.collectionNameFor(item.Name, paintKit),
		CollectionItems: s.collectionItemsFor(item.Name, paintKit),
		ContainerItems:  s.lootListItems(item.LootList, nil),
	}
}

func (m Metadata) WithInventoryDescription(desc InventoryDescription) Metadata {
	if desc.Name != "" {
		m.Name = desc.Name
	}
	if desc.MarketHashName != "" {
		m.MarketName = desc.MarketHashName
	} else if desc.MarketName != "" {
		m.MarketName = desc.MarketName
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
			Name:         merged.string("name"),
			ItemName:     merged.string("item_name"),
			TypeName:     merged.string("item_type_name"),
			ItemClass:    merged.string("item_class"),
			Prefab:       merged.string("prefab"),
			Rarity:       merged.string("item_rarity"),
			Image:        merged.string("image_inventory"),
			ToolType:     merged.object("tool").string("type"),
			Capabilities: merged.object("capabilities").strings(),
			LootList:     merged.string("loot_list_name"),
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
		}
	}
	s.parseCollections(itemsGame)
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

func (s *Schema) relatedItems(keys []string) []RelatedItem {
	items := make([]RelatedItem, 0, len(keys))
	for _, key := range keys {
		paintName, itemName := splitSchemaItemKey(key)
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
		related := RelatedItem{Name: baseName, MarketName: baseName, Rarity: item.Rarity}
		for _, paint := range s.paintKits {
			if paint.Name == paintName {
				paintDisplay := firstNonEmpty(s.localize(paint.Description), paint.Name)
				related.MarketName = baseName + " | " + paintDisplay
				related.Rarity = firstNonEmpty(paint.Rarity, related.Rarity)
				break
			}
		}
		items = append(items, related)
	}
	return items
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
	ClassID        string `json:"classid"`
	InstanceID     string `json:"instanceid"`
	Name           string `json:"name"`
	MarketName     string `json:"market_name"`
	MarketHashName string `json:"market_hash_name"`
	IconURL        string `json:"icon_url"`
	IconURLLarge   string `json:"icon_url_large"`
	Type           string `json:"type"`
	Tradable       int    `json:"tradable"`
	Marketable     int    `json:"marketable"`
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
