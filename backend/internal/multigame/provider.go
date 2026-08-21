package multigame

import (
	"context"
	"crypto/sha256"
	"fmt"
	"net/url"
	"regexp"
	"sort"
	"strconv"
	"strings"
	"time"

	"cs-inv-edit/backend/internal/domain"
	"cs-inv-edit/backend/internal/econ"
)

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
				item.InspectURL = tf2InspectAction(game.AppID, steamID, owned.ContextID, owned.AssetID, desc.Actions)
				item.Type = desc.Type
				item.Tradable = desc.Tradable != 0
				item.Marketable = desc.Marketable != 0
				item.TradableAfter = descriptionTradableAfter(append(append([]descriptionLine(nil), desc.Descriptions...), desc.OwnerDescriptions...))
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

func tf2InspectAction(appID uint32, steamID, contextID, assetID string, actions []descriptionAction) string {
	if appID != 440 {
		return ""
	}
	for _, action := range actions {
		link := strings.TrimSpace(action.Link)
		link = strings.NewReplacer("%owner_steamid%", steamID, "%contextid%", contextID, "%assetid%", assetID).Replace(link)
		parsed, err := url.Parse(link)
		if err == nil && parsed.Scheme == "steam" && strings.Contains(strings.ToLower(parsed.Path), "440") {
			return link
		}
	}
	return ""
}

var descriptionHTML = regexp.MustCompile(`<[^>]+>`)

func descriptionTradableAfter(lines []descriptionLine) string {
	for _, line := range lines {
		value := strings.TrimSpace(descriptionHTML.ReplaceAllString(line.Value, ""))
		index := strings.Index(strings.ToLower(value), "tradable after ")
		if index < 0 {
			continue
		}
		date := strings.TrimSpace(value[index+len("tradable after "):])
		for _, layout := range []string{"Jan 2, 2006 (15:04:05) MST", "Jan 2, 2006 (15:04:05)", "2 Jan, 2006 (15:04:05) MST"} {
			parsed, err := time.Parse(layout, date)
			if err == nil {
				return parsed.UTC().Format(time.RFC3339)
			}
		}
	}
	return ""
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
	tf2Images, tf2ImageErr, omittedTF2Images := p.loadTF2ContainerImages(ctx, owned, tf2Definitions)
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
			if definition.Name != "" {
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
			item.Details.ItemKind = definition.ItemKind
			item.Details.ItemClass = definition.ItemClass
			item.Details.CraftClass = definition.CraftClass
			item.Details.CraftMaterialType = definition.CraftMaterialType
			item.Details.ToolType = definition.ToolType
			item.Details.Description = definition.Description
			item.Details.Collection = definition.Collection
			item.Details.EquipRegions = append([]string(nil), definition.EquipRegions...)
			item.Details.SchemaTags = append([]string(nil), definition.Tags...)
			item.Details.MinLevel = definition.MinLevel
			item.Details.MaxLevel = definition.MaxLevel
			item.Details.ProperName = definition.ProperName
			item.Details.BaseItem = definition.BaseItem
			item.Details.Hidden = definition.Hidden
			item.Details.StaticAttributes = make(map[string]string, len(definition.StaticAttributes))
			for name, value := range definition.StaticAttributes {
				item.Details.StaticAttributes[name] = value
			}
			item.Details.Rarity = definition.Rarity
			item.Details.EquipConflicts = append([]string(nil), definition.EquipConflicts...)
			item.Details.LoadoutSlots = copyMap(definition.LoadoutSlots)
			item.Details.PrefabChain = append([]string(nil), definition.PrefabChain...)
			item.Details.ContainerItems = make([]domain.TF2RelatedItem, len(definition.ContainerItems))
			for index, related := range definition.ContainerItems {
				imageURL := related.ImageURL
				if description, ok := tf2Images[related.Name]; ok {
					imageURL = firstNonEmpty(description.IconURLLarge, description.IconURL)
				}
				item.Details.ContainerItems[index] = domain.TF2RelatedItem{DefIndex: related.DefIndex, Name: related.Name, Rarity: related.Rarity, PoolKind: related.PoolKind, ImageURL: imageURL}
			}
			item.Details.TradeUpItems = make([]domain.TF2RelatedItem, len(definition.TradeUpItems))
			for index, related := range definition.TradeUpItems {
				item.Details.TradeUpItems[index] = domain.TF2RelatedItem{
					DefIndex: related.DefIndex, Name: related.Name,
					Rarity: related.Rarity, PoolKind: related.PoolKind,
				}
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
		for _, decoded := range econ.DecodeTF2Attributes(source.Attributes, source.AttributeBytes, p.tf2Attributes) {
			item.Details.DecodedAttributes = append(item.Details.DecodedAttributes, domain.TF2Attribute{DefIndex: decoded.DefIndex, Name: decoded.Name, Value: decoded.Value, EffectType: decoded.EffectType, Hidden: decoded.Hidden, AttributeClass: decoded.AttributeClass})
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
		if tf2ImageErr != nil {
			diagnostics = append(diagnostics, "Some TF2 preview images were unavailable from exact Steam market descriptions: "+tf2ImageErr.Error())
		}
		if omittedTF2Images > 0 {
			diagnostics = append(diagnostics, fmt.Sprintf("TF2 preview image lookup was bounded; %d candidate names were left for a later refresh.", omittedTF2Images))
		}
	} else {
		diagnostics = append(diagnostics, "Dota 2 definition names currently require the exact Steam description overlay; Valve's schema URL endpoint requires credentials and the tracked client files do not contain a cosmetic items_game schema.")
	}
	return domain.GameInventorySnapshot{Game: game.ID, AppID: game.AppID, Items: items, RefreshedAt: time.Now().UTC().Format(time.RFC3339Nano), Status: "ready", SchemaRevision: schemaRevision, Diagnostics: diagnostics}
}

const maxTF2ContainerImageLookups = 48

func (p *Provider) loadTF2ContainerImages(ctx context.Context, owned []OwnedItem, definitions map[uint32]econ.TF2Definition) (map[string]econ.MarketDescription, error, int) {
	if len(definitions) == 0 || p.tf2Images == nil {
		return nil, nil, 0
	}
	seen := make(map[string]bool)
	var names []string
	for _, item := range owned {
		for _, related := range definitions[item.DefIndex].ContainerItems {
			if related.PoolKind == domain.TF2PoolKindUnresolved || related.Name == "" || seen[related.Name] {
				continue
			}
			seen[related.Name] = true
			names = append(names, related.Name)
		}
	}
	sort.Strings(names)
	omitted := 0
	if len(names) > maxTF2ContainerImageLookups {
		omitted = len(names) - maxTF2ContainerImageLookups
		names = names[:maxTF2ContainerImageLookups]
	}
	images, err := p.tf2Images.LoadMarketDescriptionsForApp(ctx, 440, names)
	return images, err, omitted
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
	if quests, questErr := p.fetchText(ctx, p.tf2QuestsURL); questErr == nil {
		_ = econ.ApplyTF2QuestLocalization(definitions, quests)
	}
	attributes, err := econ.ParseTF2AttributeDefinitions(items)
	if err != nil {
		return nil, "", err
	}
	digest := sha256.Sum256([]byte(items + "\x00" + english))
	p.tf2Definitions, p.tf2Attributes, p.tf2SchemaRevision, p.tf2SchemaLoaded = definitions, attributes, fmt.Sprintf("gametracking-tf2-sha256:%x", digest[:8]), true
	return definitions, p.tf2SchemaRevision, nil
}

func (p *Provider) TF2Definitions(ctx context.Context) (map[uint32]econ.TF2Definition, string, error) {
	definitions, revision, err := p.loadTF2Definitions(ctx)
	if err != nil {
		return nil, "", err
	}
	copyDefinitions := make(map[uint32]econ.TF2Definition, len(definitions))
	for defIndex, definition := range definitions {
		copyDefinitions[defIndex] = definition
	}
	return copyDefinitions, revision, nil
}

func (p *Provider) TF2StoreImages(ctx context.Context, names []string) (map[string]econ.MarketDescription, error) {
	return p.tf2Images.LoadMarketDescriptionsForApp(ctx, 440, names)
}
