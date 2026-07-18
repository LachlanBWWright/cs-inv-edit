package multigame

import (
	"context"
	"crypto/sha256"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"strconv"
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

var games = map[string]Game{
	"steam": {ID: "steam", AppID: 753, ContextID: 6},
	"tf2":   {ID: "tf2", AppID: 440, ContextID: 2},
	"dota2": {ID: "dota2", AppID: 570, ContextID: 2},
}

func ParseGame(value string) (Game, bool) {
	game, ok := games[strings.ToLower(strings.TrimSpace(value))]
	return game, ok
}

type Provider struct {
	client            *http.Client
	communityBase     string
	tf2ItemsURL       string
	tf2EnglishURL     string
	tf2Mu             sync.Mutex
	tf2Definitions    map[uint32]econ.TF2Definition
	tf2SchemaRevision string
	tf2SchemaLoaded   bool
	overlayMu         sync.Mutex
	overlays          map[string]overlayCacheEntry
}

type overlayCacheEntry struct {
	snapshot  domain.GameInventorySnapshot
	expiresAt time.Time
}

type OwnedItem struct {
	ID             uint64
	OriginalID     uint64
	DefIndex       uint32
	Quantity       uint32
	Quality        uint32
	Inventory      uint32
	Level          uint32
	Flags          uint32
	Origin         uint32
	Style          uint32
	CustomName     string
	CustomDesc     string
	Attributes     map[uint32]uint32
	AttributeBytes map[uint32][]byte
	EquippedStates []domain.EquippedState
	InteriorItemID uint64
}

func NewProvider() *Provider {
	return &Provider{
		client:        &http.Client{Timeout: 20 * time.Second},
		communityBase: "https://steamcommunity.com",
		tf2ItemsURL:   "https://raw.githubusercontent.com/SteamTracking/GameTracking-TF2/master/tf/scripts/items/items_game.txt",
		tf2EnglishURL: "https://raw.githubusercontent.com/SteamTracking/GameTracking-TF2/master/tf/resource/tf_english.txt",
		overlays:      make(map[string]overlayCacheEntry),
	}
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
	AppID          int64             `json:"appid"`
	ClassID        string            `json:"classid"`
	InstanceID     string            `json:"instanceid"`
	Name           string            `json:"name"`
	MarketName     string            `json:"market_name"`
	MarketHashName string            `json:"market_hash_name"`
	IconURL        string            `json:"icon_url"`
	IconURLLarge   string            `json:"icon_url_large"`
	Type           string            `json:"type"`
	Tradable       int               `json:"tradable"`
	Marketable     int               `json:"marketable"`
	Tags           []tag             `json:"tags"`
	Descriptions   []descriptionLine `json:"descriptions"`
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

func (p *Provider) Load(ctx context.Context, steamID string, game Game) (domain.GameInventorySnapshot, error) {
	return p.load(ctx, steamID, game, "")
}

func (p *Provider) LoadAuthenticated(ctx context.Context, steamID string, game Game, webAccessToken string) (domain.GameInventorySnapshot, error) {
	return p.load(ctx, steamID, game, strings.TrimSpace(webAccessToken))
}

func (p *Provider) load(ctx context.Context, steamID string, game Game, webAccessToken string) (domain.GameInventorySnapshot, error) {
	if strings.TrimSpace(steamID) == "" {
		return domain.GameInventorySnapshot{}, fmt.Errorf("SteamID is required")
	}
	if _, ok := ParseGame(game.ID); !ok {
		return domain.GameInventorySnapshot{}, fmt.Errorf("unsupported economy game %q", game.ID)
	}
	cacheKey := steamID + "\x00" + game.ID
	p.overlayMu.Lock()
	if cached, ok := p.overlays[cacheKey]; ok && time.Now().Before(cached.expiresAt) {
		snapshot := cloneGameSnapshot(cached.snapshot)
		p.overlayMu.Unlock()
		return snapshot, nil
	}
	p.overlayMu.Unlock()

	items := make([]domain.EconomyInventoryItem, 0)
	startAssetID := ""
	for {
		current, err := p.fetchPage(ctx, steamID, game, startAssetID, webAccessToken)
		if err != nil {
			return domain.GameInventorySnapshot{}, err
		}
		descriptions := make(map[string]description, len(current.Descriptions))
		for _, desc := range current.Descriptions {
			if desc.AppID != 0 && uint32(desc.AppID) != game.AppID {
				return domain.GameInventorySnapshot{}, fmt.Errorf("Steam description AppID %d did not match requested AppID %d", desc.AppID, game.AppID)
			}
			descriptions[desc.ClassID+"_"+desc.InstanceID] = desc
		}
		for _, owned := range current.Assets {
			if owned.AssetID == "" || owned.ClassID == "" {
				return domain.GameInventorySnapshot{}, fmt.Errorf("Steam inventory asset omitted required identity")
			}
			if owned.AppID != 0 && uint32(owned.AppID) != game.AppID {
				return domain.GameInventorySnapshot{}, fmt.Errorf("Steam asset AppID %d did not match requested AppID %d", owned.AppID, game.AppID)
			}
			if owned.ContextID != "" && owned.ContextID != strconv.FormatUint(uint64(game.ContextID), 10) {
				return domain.GameInventorySnapshot{}, fmt.Errorf("Steam asset %s context %s did not match requested context %d", owned.AssetID, owned.ContextID, game.ContextID)
			}
			quantity, err := strconv.ParseUint(owned.Amount, 10, 64)
			if err != nil || quantity == 0 {
				return domain.GameInventorySnapshot{}, fmt.Errorf("Steam asset %s has invalid amount %q", owned.AssetID, owned.Amount)
			}
			desc, matched := descriptions[owned.ClassID+"_"+owned.InstanceID]
			item := domain.EconomyInventoryItem{
				Game: game.ID, AppID: game.AppID, ContextID: owned.ContextID, AssetID: owned.AssetID,
				ClassID: owned.ClassID, InstanceID: owned.InstanceID, Quantity: quantity,
				Tags: []domain.EconomyTag{}, Details: domain.EconomyItemDetails{Game: game.ID, Attributes: map[string]uint32{}, AttributeBytes: map[string]string{}},
			}
			if matched {
				item.Name = desc.Name
				item.MarketName = firstNonEmpty(desc.MarketHashName, desc.MarketName)
				item.ImageURL = steamIconURL(firstNonEmpty(desc.IconURLLarge, desc.IconURL))
				item.Type = desc.Type
				item.Tradable = desc.Tradable != 0
				item.Marketable = desc.Marketable != 0
				for _, sourceTag := range desc.Tags {
					item.Tags = append(item.Tags, domain.EconomyTag{Category: sourceTag.Category, InternalName: sourceTag.InternalName, Name: sourceTag.LocalizedTagName})
					switch strings.ToLower(sourceTag.Category) {
					case "rarity":
						item.Rarity = sourceTag.LocalizedTagName
					case "quality":
						item.Quality = sourceTag.LocalizedTagName
					case "hero":
						item.Details.Hero = sourceTag.LocalizedTagName
					case "slot":
						item.Details.Slot = sourceTag.LocalizedTagName
					}
				}
				for _, line := range desc.Descriptions {
					if value := strings.TrimSpace(line.Value); value != "" {
						item.Descriptions = append(item.Descriptions, value)
					}
				}
			} else {
				item.Name = "Unknown item"
			}
			items = append(items, item)
		}
		if !bool(current.MoreItems) || current.LastAssetID == "" {
			break
		}
		startAssetID = current.LastAssetID
	}

	snapshot := domain.GameInventorySnapshot{
		Game: game.ID, AppID: game.AppID, Items: items, Status: "ready", RefreshedAt: time.Now().UTC().Format(time.RFC3339Nano),
		Diagnostics: []string{communityInventoryDiagnostic(game)},
	}
	p.overlayMu.Lock()
	p.overlays[cacheKey] = overlayCacheEntry{snapshot: cloneGameSnapshot(snapshot), expiresAt: time.Now().Add(5 * time.Minute)}
	p.overlayMu.Unlock()
	return snapshot, nil
}

func communityInventoryDiagnostic(game Game) string {
	if game.ID == "steam" {
		return "Steam Community AppID 753 context 6 is the authoritative source for owned Steam Community items."
	}
	return "Steam Community descriptions loaded as a metadata overlay; Community assets are not accepted as authoritative ownership."
}

func (p *Provider) EnrichOwned(ctx context.Context, steamID string, game Game, owned []OwnedItem) domain.GameInventorySnapshot {
	var tf2Definitions map[uint32]econ.TF2Definition
	var schemaRevision string
	var schemaErr error
	if game.ID == "tf2" {
		tf2Definitions, schemaRevision, schemaErr = p.loadTF2Definitions(ctx)
	}
	overlay, overlayErr := p.Load(ctx, steamID, game)
	byID := make(map[string]domain.EconomyInventoryItem, len(overlay.Items))
	for _, item := range overlay.Items {
		byID[item.AssetID] = item
	}
	items := make([]domain.EconomyInventoryItem, 0, len(owned))
	matched := 0
	unresolvedNames := 0
	missingImages := 0
	unresolvedMarketNames := 0
	for _, source := range owned {
		assetID := strconv.FormatUint(source.ID, 10)
		item, ok := byID[assetID]
		if !ok && source.OriginalID != 0 {
			item, ok = byID[strconv.FormatUint(source.OriginalID, 10)]
		}
		if ok {
			matched++
		} else {
			item = domain.EconomyInventoryItem{Game: game.ID, AppID: game.AppID, AssetID: assetID, Name: fmt.Sprintf("Definition %d", source.DefIndex), Tags: []domain.EconomyTag{}, Details: domain.EconomyItemDetails{Game: game.ID, Attributes: map[string]uint32{}, AttributeBytes: map[string]string{}}}
		}
		item.Details.Game = game.ID
		if item.Details.Attributes == nil {
			item.Details.Attributes = map[string]uint32{}
		}
		if item.Details.AttributeBytes == nil {
			item.Details.AttributeBytes = map[string]string{}
		}
		if definition, present := tf2Definitions[source.DefIndex]; present {
			if item.Name == "" || strings.HasPrefix(item.Name, "Definition ") {
				item.Name = definition.Name
			}
			if item.Type == "" {
				item.Type = definition.Type
			}
			item.Details.SchemaQuality = definition.Quality
			item.Details.EquipSlot = definition.Slot
			item.Details.UsableClasses = append([]string(nil), definition.UsedByClass...)
			item.Details.Capabilities = make(map[string]string, len(definition.Capabilities))
			for capability, value := range definition.Capabilities {
				item.Details.Capabilities[capability] = value
			}
		}
		definitionID := source.DefIndex
		item.Game, item.AppID, item.AssetID, item.DefinitionID = game.ID, game.AppID, assetID, &definitionID
		item.Quantity = uint64(source.Quantity)
		if item.Quantity == 0 {
			item.Quantity = 1
		}
		item.Details.Level = source.Level
		item.Details.QualityID = source.Quality
		item.Details.InventoryPosition = source.Inventory
		item.Details.OriginID = source.Origin
		item.Details.Style = source.Style
		item.Details.Flags = source.Flags
		item.Details.CustomName = source.CustomName
		item.Details.CustomDescription = source.CustomDesc
		for id, value := range source.Attributes {
			item.Details.Attributes[strconv.FormatUint(uint64(id), 10)] = value
		}
		for id, value := range source.AttributeBytes {
			item.Details.AttributeBytes[strconv.FormatUint(uint64(id), 10)] = fmt.Sprintf("%x", value)
		}
		item.Details.EquippedStates = append([]domain.EquippedState(nil), source.EquippedStates...)
		if source.InteriorItemID != 0 {
			item.Details.InteriorItemID = strconv.FormatUint(source.InteriorItemID, 10)
		}
		if item.Name == "" || strings.HasPrefix(item.Name, "Definition ") {
			unresolvedNames++
		}
		if item.ImageURL == "" {
			missingImages++
		}
		if item.MarketName == "" {
			unresolvedMarketNames++
		}
		items = append(items, item)
	}
	diagnostics := []string{fmt.Sprintf("GC SOCache is authoritative for %d owned %s items; Steam descriptions matched %d.", len(items), game.ID, matched)}
	diagnostics = append(diagnostics, fmt.Sprintf("Metadata resolution: unresolved_names=%d missing_images=%d missing_market_names=%d.", unresolvedNames, missingImages, unresolvedMarketNames))
	if overlayErr != nil {
		diagnostics = append(diagnostics, "Steam description overlay unavailable: "+overlayErr.Error())
	}
	if game.ID != "tf2" {
		schemaRevision = ""
	}
	if game.ID == "tf2" {
		if schemaErr != nil {
			diagnostics = append(diagnostics, "TF2 schema unavailable: "+schemaErr.Error())
		} else {
			diagnostics = append(diagnostics, fmt.Sprintf("Live TF2 items_game resolved %d definitions.", len(tf2Definitions)))
		}
	} else {
		diagnostics = append(diagnostics, "Dota 2 definition names currently require the exact Steam description overlay; Valve's schema URL endpoint requires credentials and the tracked client files do not contain a cosmetic items_game schema.")
	}
	return domain.GameInventorySnapshot{Game: game.ID, AppID: game.AppID, Items: items, RefreshedAt: time.Now().UTC().Format(time.RFC3339Nano), Status: "ready", SchemaRevision: schemaRevision, Diagnostics: diagnostics}
}

func (p *Provider) loadTF2Definitions(ctx context.Context) (map[uint32]econ.TF2Definition, string, error) {
	p.tf2Mu.Lock()
	defer p.tf2Mu.Unlock()
	if p.tf2SchemaLoaded {
		return p.tf2Definitions, p.tf2SchemaRevision, nil
	}
	items, err := p.fetchText(ctx, p.tf2ItemsURL)
	if err != nil {
		return nil, "", err
	}
	english, err := p.fetchText(ctx, p.tf2EnglishURL)
	if err != nil {
		return nil, "", err
	}
	definitions, err := econ.ParseTF2Definitions(items, english)
	if err != nil {
		return nil, "", err
	}
	digest := sha256.Sum256([]byte(items + "\x00" + english))
	p.tf2Definitions, p.tf2SchemaRevision, p.tf2SchemaLoaded = definitions, fmt.Sprintf("gametracking-tf2-sha256:%x", digest[:8]), true
	return definitions, p.tf2SchemaRevision, nil
}

func (p *Provider) fetchText(ctx context.Context, endpoint string) (string, error) {
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, endpoint, nil)
	if err != nil {
		return "", err
	}
	resp, err := p.do(req)
	if err != nil {
		return "", err
	}
	defer resp.Body.Close()
	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		return "", fmt.Errorf("%s returned HTTP %d", endpoint, resp.StatusCode)
	}
	body, err := io.ReadAll(resp.Body)
	if err != nil {
		return "", err
	}
	return string(body), nil
}

func (p *Provider) fetchPage(ctx context.Context, steamID string, game Game, startAssetID, webAccessToken string) (page, error) {
	values := url.Values{}
	values.Set("l", "english")
	values.Set("count", "5000")
	if startAssetID != "" {
		values.Set("start_assetid", startAssetID)
	}
	endpoint := fmt.Sprintf("%s/inventory/%s/%d/%d?%s", strings.TrimRight(p.communityBase, "/"), url.PathEscape(steamID), game.AppID, game.ContextID, values.Encode())
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, endpoint, nil)
	if err != nil {
		return page{}, err
	}
	req.Header.Set("User-Agent", "Mozilla/5.0 (compatible; cs-inv-edit/0.0; multi-game inventory lookup)")
	if webAccessToken != "" {
		req.AddCookie(&http.Cookie{Name: "steamLoginSecure", Value: steamID + "||" + webAccessToken, Path: "/", Secure: true, HttpOnly: true})
	}
	resp, err := p.do(req)
	if err != nil {
		return page{}, fmt.Errorf("fetch %s inventory: %w", game.ID, err)
	}
	defer resp.Body.Close()
	if resp.StatusCode == http.StatusForbidden {
		return page{}, fmt.Errorf("%s Steam Community inventory is private or unavailable", game.ID)
	}
	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		return page{}, fmt.Errorf("fetch %s inventory returned HTTP %d", game.ID, resp.StatusCode)
	}
	decoder := json.NewDecoder(resp.Body)
	var result page
	if err := decoder.Decode(&result); err != nil {
		return page{}, fmt.Errorf("decode %s inventory: %w", game.ID, err)
	}
	if !bool(result.Success) {
		return page{}, fmt.Errorf("Steam returned an unsuccessful %s inventory response", game.ID)
	}
	if result.Assets == nil {
		result.Assets = []asset{}
	}
	if result.Descriptions == nil {
		result.Descriptions = []description{}
	}
	return result, nil
}

func (p *Provider) do(req *http.Request) (*http.Response, error) {
	var lastErr error
	for attempt := 0; attempt < 3; attempt++ {
		clone := req.Clone(req.Context())
		resp, err := p.client.Do(clone)
		if err == nil && resp.StatusCode != http.StatusTooManyRequests && resp.StatusCode < 500 {
			return resp, nil
		}
		if resp != nil {
			_ = resp.Body.Close()
			lastErr = fmt.Errorf("%s returned HTTP %d", req.URL.String(), resp.StatusCode)
		} else {
			lastErr = err
		}
		if attempt == 2 {
			break
		}
		timer := time.NewTimer(time.Duration(250*(1<<attempt)) * time.Millisecond)
		select {
		case <-req.Context().Done():
			timer.Stop()
			return nil, req.Context().Err()
		case <-timer.C:
		}
	}
	return nil, lastErr
}

func cloneGameSnapshot(snapshot domain.GameInventorySnapshot) domain.GameInventorySnapshot {
	clone := snapshot
	clone.Diagnostics = append([]string{}, snapshot.Diagnostics...)
	clone.Items = make([]domain.EconomyInventoryItem, len(snapshot.Items))
	for index, item := range snapshot.Items {
		clone.Items[index] = item
		clone.Items[index].Tags = append([]domain.EconomyTag(nil), item.Tags...)
		clone.Items[index].Descriptions = append([]string(nil), item.Descriptions...)
		clone.Items[index].Details.Attributes = copyMap(item.Details.Attributes)
		clone.Items[index].Details.AttributeBytes = copyMap(item.Details.AttributeBytes)
		clone.Items[index].Details.Capabilities = copyMap(item.Details.Capabilities)
		clone.Items[index].Details.UsableClasses = append([]string(nil), item.Details.UsableClasses...)
		clone.Items[index].Details.EquippedStates = append([]domain.EquippedState(nil), item.Details.EquippedStates...)
	}
	return clone
}

func copyMap[K comparable, V any](source map[K]V) map[K]V {
	if source == nil {
		return nil
	}
	result := make(map[K]V, len(source))
	for key, value := range source {
		result[key] = value
	}
	return result
}

func steamIconURL(token string) string {
	token = strings.TrimSpace(token)
	if token == "" {
		return ""
	}
	if strings.HasPrefix(token, "https://") || strings.HasPrefix(token, "http://") {
		return token
	}
	return "https://community.fastly.steamstatic.com/economy/image/" + token
}

func firstNonEmpty(values ...string) string {
	for _, value := range values {
		if strings.TrimSpace(value) != "" {
			return value
		}
	}
	return ""
}
