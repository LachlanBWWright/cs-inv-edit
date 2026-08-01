package econ

import (
	_ "embed"
	"sort"
	"strconv"
	"strings"
)

func (s *Schema) parseItems(root kvObject) {
	itemsGame := root.object("items_game")
	if s.attributes == nil {
		s.attributes = make(map[uint32]econAttributeDefinition)
	}
	for key, node := range itemsGame.object("attributes") {
		index, err := strconv.ParseUint(key, 10, 32)
		if err != nil {
			continue
		}
		attribute := node.objectValue()
		s.attributes[uint32(index)] = econAttributeDefinition{Name: attribute.string("name"), AttributeClass: attribute.string("attribute_class"), AttributeType: attribute.string("attribute_type"), DescriptionFormat: attribute.string("description_format"), StoredAsInteger: schemaBool(attribute.string("stored_as_integer"))}
	}
	prefabs := itemsGame.object("prefabs")
	for key, node := range itemsGame.object("items") {
		defIndex, err := strconv.ParseUint(key, 10, 32)
		if err != nil {
			continue
		}
		merged := mergePrefab(node.objectValue(), prefabs, nil)
		requiredKeyDefIndexes := numericObjectKeys(merged.object("associated_items"))
		if associatedItem, associatedErr := strconv.ParseUint(merged.string("associated_item"), 10, 32); associatedErr == nil && associatedItem != 0 {
			requiredKeyDefIndexes = append(requiredKeyDefIndexes, uint32(associatedItem))
		}
		s.items[uint32(defIndex)] = itemDefinition{
			Name:                  merged.string("name"),
			ItemName:              merged.string("item_name"),
			TypeName:              merged.string("item_type_name"),
			ItemClass:             merged.string("item_class"),
			Prefab:                merged.string("prefab"),
			Rarity:                merged.string("item_rarity"),
			Image:                 merged.string("image_inventory"),
			ToolType:              merged.object("tool").string("type"),
			Capabilities:          merged.object("capabilities").strings(),
			LootList:              merged.string("loot_list_name"),
			SupplyCrateSeries:     merged.object("attributes").object("set supply crate series").string("value"),
			IsVolatileContainer:   schemaBool(merged.object("attributes").object("volatile container").string("value")),
			RequiredKeyDefIndexes: requiredKeyDefIndexes,
		}
	}
	for key, node := range itemsGame.object("paint_kits") {
		paintKit, err := strconv.ParseUint(key, 10, 32)
		if err != nil {
			continue
		}
		paint := node.objectValue()
		paintKitRarities := itemsGame.object("paint_kits_rarity")
		s.paintKits[uint32(paintKit)] = paintKitDefinition{
			Name:        paint.string("name"),
			Description: paint.string("description_tag"),
			// Live items_game indexes this table by the paint-kit name. Some
			// schema snapshots index it by the numeric paint-kit id instead, so
			// accept both representations rather than silently falling back to
			// the base weapon's rarity for collection contents.
			Rarity:  firstNonEmpty(paintKitRarities.string(paint.string("name")), paintKitRarities.string(key)),
			WearMin: optionalFloat(paint.string("wear_remap_min")),
			WearMax: optionalFloat(paint.string("wear_remap_max")),
		}
	}
	for key, node := range itemsGame.object("sticker_kits") {
		stickerKit, err := strconv.ParseUint(key, 10, 32)
		if err != nil {
			continue
		}
		sticker := node.objectValue()
		s.stickerKits[uint32(stickerKit)] = stickerKitDefinition{
			Name:          sticker.string("name"),
			ItemName:      sticker.string("item_name"),
			Material:      sticker.string("sticker_material"),
			PatchMaterial: sticker.string("patch_material"),
			Rarity:        sticker.string("item_rarity"),
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

func numericObjectKeys(object kvObject) []uint32 {
	values := make([]uint32, 0, len(object))
	for key := range object {
		value, err := strconv.ParseUint(key, 10, 32)
		if err == nil && value != 0 {
			values = append(values, uint32(value))
		}
	}
	sort.Slice(values, func(i, j int) bool { return values[i] < values[j] })
	return values
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
	if s.revolvingLootLists == nil {
		s.revolvingLootLists = make(map[string]string)
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
	s.applyCollectionLootListRarities()
}

// A paint kit can appear in multiple collections at different grades. Valve's
// paint_kits_rarity is therefore not sufficient for a case collection preview;
// the case's tiered client_loot_lists are authoritative for that context.
func (s *Schema) applyCollectionLootListRarities() {
	for setKey, definition := range s.collections {
		members := make(map[string]bool, len(definition.Items))
		for _, itemKey := range definition.Items {
			members[itemKey] = true
		}
		rarities := make(map[string]string)
		ambiguous := make(map[string]bool)
		for parent, entries := range s.lootLists {
			for _, child := range entries {
				rarity := nestedLootListRarity(parent, child)
				if rarity == "" {
					continue
				}
				for _, itemKey := range s.lootLists[child] {
					if !members[itemKey] || ambiguous[itemKey] {
						continue
					}
					if existing := rarities[itemKey]; existing != "" && existing != rarity {
						delete(rarities, itemKey)
						ambiguous[itemKey] = true
						continue
					}
					rarities[itemKey] = rarity
				}
			}
		}
		definition.Rarities = rarities
		s.collections[setKey] = definition
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

func (s *Schema) containerLootListName(item itemDefinition) string {
	if item.LootList != "" {
		return item.LootList
	}
	return s.revolvingLootLists[item.SupplyCrateSeries]
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
	definition := s.collections[setKey]
	return s.relatedItemsWithRarities(definition.Items, definition.Rarities)
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
			if len(item.Items) > 0 {
				for _, special := range item.Items {
					key := special.MarketName
					if key == "" || seenItems[key] {
						continue
					}
					seenItems[key] = true
					out = append(out, special)
				}
				continue
			}
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
	return s.relatedItemsWithRarities(keys, nil)
}

func (s *Schema) relatedItemsWithRarities(keys []string, rarities map[string]string) []RelatedItem {
	items := make([]RelatedItem, 0, len(keys))
	for _, key := range keys {
		paintName, itemName := splitSchemaItemKey(key)
		if related, ok := s.relatedSpecialItem(paintName, itemName); ok {
			items = append(items, related)
			continue
		}
		var item itemDefinition
		var itemDefIndex uint32
		for defIndex, candidate := range s.items {
			if candidate.Name == itemName {
				item = candidate
				itemDefIndex = defIndex
				break
			}
		}
		if item.Name == "" {
			continue
		}
		baseName := firstNonEmpty(s.localize(item.ItemName), item.Name)
		related := RelatedItem{DefIndex: itemDefIndex, Name: baseName, MarketName: baseName, Kind: itemKind(item), Rarity: item.Rarity, ImageURL: s.itemImageURL(item, 0, nil)}
		for paintKit, paint := range s.paintKits {
			if paint.Name == paintName {
				related.PaintKit = paintKit
				paintDisplay := firstNonEmpty(s.localize(paint.Description), paint.Name)
				related.MarketName = baseName + " | " + paintDisplay
				related.Rarity = firstNonEmpty(paint.Rarity, related.Rarity)
				related.WearMin = paint.WearMin
				related.WearMax = paint.WearMax
				related.ImageURL = firstNonEmpty(s.itemImageURL(item, paintKit, nil), related.ImageURL)
				break
			}
		}
		if rarity := rarities[key]; rarity != "" {
			related.Rarity = rarity
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
			imageURL := s.imageURL("econ/stickers/" + strings.TrimPrefix(sticker.Material, "econ/stickers/"))
			return RelatedItem{Name: name, MarketName: prefix + name, Kind: itemName, Rarity: sticker.Rarity, ImageURL: imageURL}, true
		}
	}
	if itemName == "keychain" {
		for _, keychain := range s.keychains {
			if keychain.Name != variantName {
				continue
			}
			name := firstNonEmpty(s.localize(keychain.ItemName), humanizeIdentifier(keychain.Name))
			return RelatedItem{Name: name, MarketName: "Charm | " + name, Kind: "keychain", Rarity: keychain.Rarity, ImageURL: s.imageURL(keychain.Image)}, true
		}
	}
	return RelatedItem{}, false
}

func (s *Schema) imageURL(key string) string {
	imageURL := s.imageURLs[strings.TrimSpace(key)]
	if validTrackedImageURL(imageURL) {
		return imageURL
	}
	return ""
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
