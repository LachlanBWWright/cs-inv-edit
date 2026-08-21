package econ

import (
	_ "embed"
	"html"
	"sort"
	"strings"

	"cs-inv-edit/backend/internal/domain"
)

func RelatedItemMarketNames(items []RelatedItem) []string {
	names := make([]string, 0, len(items))
	for _, item := range items {
		if item.MarketName != "" {
			names = append(names, item.MarketName)
		}
		names = append(names, RelatedItemMarketNames(item.Items)...)
	}
	return names
}

func ApplyRelatedItemDescriptions(items []RelatedItem, descriptions map[string]MarketDescription) []RelatedItem {
	out := append([]RelatedItem(nil), items...)
	for index := range out {
		if description, ok := descriptions[out[index].MarketName]; ok {
			out[index].ImageURL = firstNonEmpty(out[index].ImageURL, description.IconURLLarge, description.IconURL)
			out[index].Price = description.Price.SellPriceText
			out[index].ListingName = firstNonEmpty(description.HashName, description.MarketHashName, description.MarketName)
		}
		out[index].Items = ApplyRelatedItemDescriptions(out[index].Items, descriptions)
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
	var items []RelatedItem
	for _, entry := range s.lootLists[name] {
		if _, nested := s.lootLists[entry]; nested {
			nestedItems := s.lootListItems(entry, seen)
			if rarity := nestedLootListRarity(name, entry); rarity != "" {
				for index := range nestedItems {
					nestedItems[index].Rarity = rarity
				}
				if rarity == "unusual" {
					items = append(items, rareSpecialCollection(nestedItems))
					continue
				}
			}
			items = append(items, nestedItems...)
			continue
		}
		if strings.HasSuffix(strings.ToLower(entry), "_unusual") {
			collectionItems := s.relatedItems(s.collections[entry].Items)
			if len(collectionItems) > 0 {
				items = append(items, rareSpecialCollection(collectionItems))
			}
			continue
		}
		items = append(items, s.relatedItems([]string{entry})...)
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

func rareSpecialCollection(items []RelatedItem) RelatedItem {
	return RelatedItem{Name: "Rare Special Items", Kind: domain.ItemKindItemCollection, Rarity: "unusual", Items: items}
}

func nestedLootListRarity(parent string, child string) string {
	parent = strings.ToLower(parent)
	child = strings.ToLower(child)
	parent = strings.TrimSuffix(parent, "_lootlist")
	if !strings.HasPrefix(child, parent+"_") {
		return ""
	}
	for _, rarity := range []string{"common", "uncommon", "rare", "mythical", "legendary", "ancient", "unusual"} {
		if strings.HasSuffix(child, "_"+rarity) {
			return rarity
		}
	}
	return ""
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
	if sticker, ok := s.stickerKits[attributes[113]]; ok {
		return &sticker
	}
	return nil
}

func (s *Schema) matchMusicDefinition(attributes map[uint32]uint32) *musicDefinition {
	if music, ok := s.musicDefinitions[attributes[166]]; ok {
		return &music
	}
	return nil
}

func (s *Schema) matchKeychain(attributes map[uint32]uint32) *keychainDefinition {
	if keychain, ok := s.keychains[attributes[299]]; ok {
		return &keychain
	}
	return nil
}

func isGenericStickerItem(item itemDefinition, name string) bool {
	// Capsule definitions inherit sticker prefabs and may carry attribute 113 as
	// container metadata. They are containers, not individual sticker items.
	if itemKind(item) == domain.ItemKindContainer {
		return false
	}
	lowerName := strings.ToLower(name)
	return item.ToolType == "sticker" || lowerName == "sticker" || strings.Contains(strings.ToLower(item.Prefab), "sticker")
}

func isGenericGraffitiItem(item itemDefinition, name string) bool {
	// Graffiti boxes/capsules also contain "spray" or "graffiti" in their
	// schema identity. Do not let their attributes replace the container name.
	if itemKind(item) == domain.ItemKindContainer {
		return false
	}
	lower := strings.ToLower(item.Name + " " + item.ToolType + " " + item.Prefab + " " + name)
	return strings.Contains(lower, "spray") || strings.Contains(lower, "graffiti")
}

func isGenericPatchItem(item itemDefinition, name string) bool {
	if itemKind(item) == domain.ItemKindContainer {
		return false
	}
	lower := strings.ToLower(item.Name + " " + item.ToolType + " " + item.Prefab + " " + name)
	return strings.Contains(lower, "patch")
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

func itemKind(item itemDefinition) domain.ItemKind {
	itemClass := strings.ToLower(item.ItemClass)
	prefab := strings.ToLower(item.Prefab)
	typeName := strings.ToLower(item.TypeName)
	switch {
	case strings.Contains(itemClass, "supply_crate") || strings.Contains(prefab, "crate") || strings.Contains(prefab, "capsule") || strings.Contains(typeName, "weaponcase") || strings.Contains(typeName, "capsule"):
		return domain.ItemKindContainer
	case strings.Contains(itemClass, "sticker") || strings.Contains(prefab, "sticker"):
		return domain.ItemKindStickerItem
	case strings.Contains(itemClass, "tool") || item.ToolType != "":
		return domain.ItemKindToolItem
	case isWeaponItem(item):
		return domain.ItemKindWeaponSkin
	default:
		return domain.ItemKindCS2EconItem
	}
}

func kindFromSteamType(typeName string) domain.ItemKind {
	lower := strings.ToLower(typeName)
	switch {
	case strings.Contains(lower, "container") || strings.Contains(lower, "case") || strings.Contains(lower, "capsule"):
		return domain.ItemKindContainer
	case strings.Contains(lower, "sticker"):
		return domain.ItemKindStickerItem
	case strings.Contains(lower, "tool") || strings.Contains(lower, "tag"):
		return domain.ItemKindToolItem
	case strings.Contains(lower, "rifle") || strings.Contains(lower, "pistol") || strings.Contains(lower, "sniper") || strings.Contains(lower, "shotgun") || strings.Contains(lower, "smg"):
		return domain.ItemKindWeaponSkin
	default:
		return domain.ItemKindCS2EconItem
	}
}

func isWeaponItem(item itemDefinition) bool {
	itemClass := strings.ToLower(item.ItemClass)
	prefab := strings.ToLower(item.Prefab)
	return strings.HasPrefix(itemClass, "weapon_") || strings.Contains(prefab, "weapon")
}

func isPaintableItem(item itemDefinition) bool {
	return isWeaponItem(item) || strings.HasPrefix(strings.ToLower(item.Name), "weapon_") || strings.TrimSpace(item.Capabilities["paintable"]) == "1"
}

func steamIconURL(icon string) string {
	icon = strings.TrimSpace(html.UnescapeString(icon))
	if icon == "" {
		return ""
	}
	lower := strings.ToLower(icon)
	if strings.HasPrefix(lower, "http://") || strings.HasPrefix(lower, "https://") {
		return icon
	}
	if strings.HasPrefix(icon, "//") {
		return "https:" + icon
	}
	icon = strings.TrimLeft(icon, "/")
	icon = strings.TrimPrefix(icon, "economy/image/")
	return "https://community.fastly.steamstatic.com/economy/image/" + icon
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
	return strings.EqualFold(normalizeTF2MarketName(want), normalizeTF2MarketName(got))
}

func normalizeTF2MarketName(value string) string {
	value = strings.TrimSpace(value)
	value = strings.TrimPrefix(value, "The ")
	for _, quality := range []string{"Unique ", "Genuine ", "Vintage ", "Strange ", "Unusual ", "Haunted ", "Collector's ", "Decorated Weapon "} {
		value = strings.TrimPrefix(value, quality)
	}
	return strings.TrimSpace(value)
}
