package econ

import "sort"

func (s *Schema) tradeUpItemsFor(itemName string, paintKit uint32, rarity string) []RelatedItem {
	return s.tradeUpItemsForQuality(itemName, paintKit, rarity, 0)
}

func (s *Schema) tradeUpItemsForQuality(itemName string, paintKit uint32, rarity string, quality uint32) []RelatedItem {
	key := schemaItemKey(itemName, paintKit, s.paintKits)
	setKey := s.collectionByItem[key]
	// The same paint kit can have a different tier in a particular collection.
	// Trade-up eligibility follows that collection tier, not paint_kits_rarity.
	if collectionRarity := s.collections[setKey].Rarities[key]; collectionRarity != "" {
		rarity = collectionRarity
	}
	targetRank := rarityRank(rarity) + 1
	if targetRank == 7 {
		qualityName := "unique"
		if quality == 9 {
			qualityName = "strange"
		}
		if allowed := s.rareSpecialQualities[setKey]; len(allowed) > 0 && !allowed[qualityName] {
			return nil
		}
		if items := s.rareSpecialByCollection[setKey]; len(items) > 0 {
			return append([]RelatedItem(nil), items...)
		}
		// A known collection without an unusual mapping has no knife/glove
		// contract outcome. Do not borrow a pool from another loot list that
		// happens to reuse this finish.
		if setKey != "" {
			return nil
		}
		return s.rareSpecialTradeUpItems(key)
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
					if key := special.MarketName; key != "" && !seenItems[key] {
						seenItems[key] = true
						out = append(out, special)
					}
				}
				continue
			}
			if key := item.MarketName; rarityRank(item.Rarity) == 7 && key != "" && !seenItems[key] {
				seenItems[key] = true
				out = append(out, item)
			}
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
