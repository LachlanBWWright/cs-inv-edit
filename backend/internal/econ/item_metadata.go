package econ

import (
	_ "embed"
	"fmt"
	"math"
	"net/url"
	"strings"
)

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
	imageURL, imageKey := s.itemImageLookup(item, paintKit, attributes)
	return Metadata{
		Name:                  name,
		MarketName:            marketName,
		Kind:                  kind,
		Rarity:                rarity,
		ImageURL:              imageURL,
		ImageSource:           imageSource(imageURL, "counter-strike-image-tracker"),
		ImageKey:              imageKey,
		ToolType:              item.ToolType,
		RequiredKeyDefIndexes: append([]uint32(nil), item.RequiredKeyDefIndexes...),
		IsNameTagTool:         strings.EqualFold(name, "Name Tag") || strings.Contains(strings.ToLower(item.Name), "name_tag"),
		Collection:            s.collectionNameFor(item.Name, paintKit),
		CollectionItems:       s.collectionItemsFor(item.Name, paintKit),
		TradeUpItems:          s.tradeUpItemsFor(item.Name, paintKit, rarity),
		ContainerItems:        s.lootListItems(s.containerLootListName(item), nil),
		Tradable:              schemaTradable(item),
		PaintWearMin:          wearMin,
		PaintWearMax:          wearMax,
	}
}

func (s *Schema) itemImageURL(item itemDefinition, paintKit uint32, attributes map[uint32]uint32) string {
	imageURL, _ := s.itemImageLookup(item, paintKit, attributes)
	return imageURL
}

func (s *Schema) itemImageLookup(item itemDefinition, paintKit uint32, attributes map[uint32]uint32) (string, string) {
	var candidates []string
	itemName := s.localize(item.ItemName)
	if paint, ok := s.paintKits[paintKit]; ok && paintKit != 0 && strings.HasPrefix(item.Name, "weapon_") {
		prefix := "econ/default_generated/" + item.Name + "_" + paint.Name + "_"
		tiers := []string{"light", "medium", "heavy"}
		if wearBits, ok := attributes[8]; ok {
			wear := math.Float32frombits(wearBits)
			switch {
			case wear >= 0.38:
				tiers = []string{"heavy", "medium", "light"}
			case wear >= 0.15:
				tiers = []string{"medium", "light", "heavy"}
			}
		}
		for _, tier := range tiers {
			candidates = append(candidates, prefix+tier)
		}
	}
	if sticker := s.matchStickerKit(attributes); sticker != nil && (isGenericStickerItem(item, itemName) || isGenericGraffitiItem(item, itemName)) {
		candidates = append(candidates, "econ/stickers/"+strings.TrimPrefix(sticker.Material, "econ/stickers/"))
	}
	if music := s.matchMusicDefinition(attributes); music != nil && isGenericMusicItem(item, itemName) {
		candidates = append(candidates, music.Image)
	}
	if keychain := s.matchKeychain(attributes); keychain != nil && isGenericKeychainItem(item, itemName) {
		candidates = append(candidates, keychain.Image)
	}
	candidates = append(candidates, item.Image)
	for _, key := range candidates {
		if imageURL := s.imageURLs[strings.TrimSpace(key)]; validTrackedImageURL(imageURL) {
			return imageURL, strings.TrimSpace(key)
		}
	}
	return "", ""
}

func imageSource(imageURL string, source string) string {
	if imageURL == "" {
		return ""
	}
	return source
}

func validTrackedImageURL(imageURL string) bool {
	parsed, err := url.Parse(strings.TrimSpace(imageURL))
	return err == nil && parsed.Scheme == "https" && parsed.Host != ""
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
	if itemKind(item) == "container" {
		return nil
	}
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
	marketable := desc.Marketable
	m.Marketable = &marketable
	m.TradableAfter = desc.TradableAfter
	if desc.Name != "" {
		m.Name = desc.Name
	}
	marketName := firstNonEmpty(desc.MarketHashName, desc.MarketName)
	if marketName != "" && !wouldDiscardWeaponFinish(m, marketName) {
		m.MarketName = marketName
	}
	if m.ImageURL == "" && desc.IconURLLarge != "" {
		m.ImageURL = desc.IconURLLarge
		m.ImageSource = "steam-inventory-description"
	} else if m.ImageURL == "" && desc.IconURL != "" {
		m.ImageURL = desc.IconURL
		m.ImageSource = "steam-inventory-description"
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
	if m.ImageURL == "" && desc.IconURLLarge != "" {
		m.ImageURL = desc.IconURLLarge
		m.ImageSource = "steam-market-description"
	} else if m.ImageURL == "" && desc.IconURL != "" {
		m.ImageURL = desc.IconURL
		m.ImageSource = "steam-market-description"
	}
	if desc.Type != "" && (m.Kind == "" || m.Kind == "unknown") {
		m.Kind = kindFromSteamType(desc.Type)
	}
	m.MarketPrice = desc.Price
	return m
}
