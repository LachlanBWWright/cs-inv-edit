package econ

import (
	"encoding/json"
	"sort"
	"strconv"
	"strings"

	"cs-inv-edit/backend/internal/domain"
)

type crateIndexEntry struct {
	DefIndex     string           `json:"def_index"`
	Contains     []crateIndexItem `json:"contains"`
	ContainsRare []crateIndexItem `json:"contains_rare"`
}

type crateIndexItem struct {
	Name       string  `json:"name"`
	PaintIndex *string `json:"paint_index"`
	Image      string  `json:"image"`
}

// applyRareSpecialIndex joins the expanded case pools that Valve's public
// items_game references symbolically but does not enumerate. Everything other
// than pool membership continues to come from the live Valve schema.
func (s *Schema) applyRareSpecialIndex(raw string) {
	if strings.TrimSpace(raw) == "" {
		return
	}
	var crates []crateIndexEntry
	if json.Unmarshal([]byte(raw), &crates) != nil {
		return
	}
	if s.rareSpecialByContainer == nil {
		s.rareSpecialByContainer = make(map[uint32][]RelatedItem)
	}
	if s.rareSpecialByCollection == nil {
		s.rareSpecialByCollection = make(map[string][]RelatedItem)
	}
	if s.rareSpecialQualities == nil {
		s.rareSpecialQualities = make(map[string]map[string]bool)
	}
	for _, crate := range crates {
		defIndex, err := strconv.ParseUint(crate.DefIndex, 10, 32)
		if err != nil || len(crate.ContainsRare) == 0 {
			continue
		}
		items := s.resolveCrateIndexItems(crate.ContainsRare)
		if len(items) == 0 {
			continue
		}
		s.rareSpecialByContainer[uint32(defIndex)] = items
		setKey := s.collectionForCrateItems(crate.Contains)
		if setKey == "" {
			continue
		}
		s.rareSpecialByCollection[setKey] = items
		qualities := make(map[string]bool)
		for quality := range s.collections[setKey].Unusuals {
			qualities[strings.ToLower(quality)] = true
		}
		if len(qualities) == 0 {
			qualities["unique"], qualities["strange"] = true, true
		}
		s.rareSpecialQualities[setKey] = qualities
	}
}

func (s *Schema) collectionForCrateItems(items []crateIndexItem) string {
	for _, item := range items {
		paintKit, ok := parseCratePaintKit(item.PaintIndex)
		if !ok {
			continue
		}
		if base, found := s.itemByDisplayName(item.Name); found {
			if setKey := s.collectionByItem[schemaItemKey(base.Name, paintKit, s.paintKits)]; setKey != "" {
				return setKey
			}
		}
	}
	return ""
}

func (s *Schema) resolveCrateIndexItems(items []crateIndexItem) []RelatedItem {
	out := make([]RelatedItem, 0, len(items))
	seen := make(map[string]bool)
	for _, source := range items {
		paintKit, hasPaint := parseCratePaintKit(source.PaintIndex)
		base, found := s.itemByDisplayName(source.Name)
		if !found || (source.PaintIndex != nil && !hasPaint) {
			continue
		}
		key := schemaItemKey(base.Name, paintKit, s.paintKits)
		resolved := s.relatedItems([]string{key})
		if len(resolved) != 1 || seen[resolved[0].MarketName] {
			continue
		}
		seen[resolved[0].MarketName] = true
		resolved[0].Rarity = "unusual"
		if resolved[0].ImageURL == "" && strings.HasPrefix(source.Image, "https://") {
			resolved[0].ImageURL = source.Image
		}
		out = append(out, resolved[0])
	}
	sort.SliceStable(out, func(i, j int) bool { return out[i].MarketName < out[j].MarketName })
	return out
}

func parseCratePaintKit(value *string) (uint32, bool) {
	if value == nil || strings.TrimSpace(*value) == "" {
		return 0, true
	}
	parsed, err := strconv.ParseUint(*value, 10, 32)
	return uint32(parsed), err == nil
}

func (s *Schema) itemByDisplayName(marketName string) (itemDefinition, bool) {
	want := normalizeSpecialBaseName(marketName)
	for _, item := range s.items {
		if itemKind(item) != domain.ItemKindWeaponSkin {
			continue
		}
		if normalizeSpecialBaseName(firstNonEmpty(s.localize(item.ItemName), item.Name)) == want {
			return item, true
		}
	}
	return itemDefinition{}, false
}

func normalizeSpecialBaseName(value string) string {
	value = strings.TrimSpace(strings.TrimPrefix(strings.TrimSpace(value), "★"))
	if separator := strings.Index(value, " | "); separator >= 0 {
		value = value[:separator]
	}
	return strings.ToLower(strings.TrimSpace(value))
}
