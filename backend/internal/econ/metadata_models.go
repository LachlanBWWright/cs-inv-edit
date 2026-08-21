package econ

import (
	"sort"
	"strings"

	"cs-inv-edit/backend/internal/domain"
)

type Metadata struct {
	Name                  string
	MarketName            string
	Kind                  domain.ItemKind
	Rarity                string
	ImageURL              string
	ImageSource           string
	ImageKey              string
	MarketPrice           MarketPrice
	ToolType              string
	RequiredKeyDefIndexes []uint32
	IsNameTagTool         bool
	Collection            string
	CollectionItems       []RelatedItem
	TradeUpItems          []RelatedItem
	ContainerItems        []RelatedItem
	AppliedItemImages     []string
	Tradable              *bool
	Marketable            *bool
	TradableAfter         string
	PaintWearMin          *float64
	PaintWearMax          *float64
	DecodedAttributes     []DecodedEconAttribute
	IsVolatileContainer   bool
}

type econAttributeDefinition struct {
	Name              string
	AttributeClass    string
	AttributeType     string
	DescriptionFormat string
	StoredAsInteger   bool
}

type DecodedEconAttribute struct {
	DefIndex uint32
	Name     string
	Value    string
	RawValue uint32
}

type RelatedItem struct {
	DefIndex    uint32
	PaintKit    uint32
	Name        string
	MarketName  string
	ListingName string
	Kind        domain.ItemKind
	Rarity      string
	ImageURL    string
	Price       string
	PaintWear   *float64
	WearMin     *float64
	WearMax     *float64
	Items       []RelatedItem
}

type AppliedItem struct {
	Kind     domain.ItemKind
	Slot     uint32
	ID       uint32
	Name     string
	ImageURL string
	Wear     *float64
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
	InspectURL        string
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

type collectionDefinition struct {
	Name     string
	Items    []string
	Rarities map[string]string
	Unusuals map[string]string
}

type Collection struct {
	Name  string
	Items []RelatedItem
}

type paintKitDefinition struct {
	Name        string
	Description string
	Rarity      string
	WearMin     *float64
	WearMax     *float64
}

type stickerKitDefinition struct {
	Name          string
	ItemName      string
	Material      string
	PatchMaterial string
	Rarity        string
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

// IsCoupon reports whether the definition uses Valve's coupon item schema.
// This is the authoritative boundary for Steam's public /buyitem route.
func (s *Schema) IsCoupon(defIndex uint32) bool {
	item, ok := s.items[defIndex]
	if !ok {
		return false
	}
	return strings.Contains(strings.ToLower(item.Prefab+" "+item.Name), "coupon")
}

func (s *Schema) Collections() []Collection {
	collections := make([]Collection, 0, len(s.collections))
	for setKey, definition := range s.collections {
		if definition.Name == "" || len(definition.Items) == 0 {
			continue
		}
		items := s.relatedItemsWithRarities(definition.Items, definition.Rarities)
		if specials := s.rareSpecialByCollection[setKey]; len(specials) > 0 {
			items = append(items, rareSpecialCollection(append([]RelatedItem(nil), specials...)))
		}
		collections = append(collections, Collection{Name: definition.Name, Items: items})
	}
	sort.Slice(collections, func(i, j int) bool { return collections[i].Name < collections[j].Name })
	return collections
}

func (s *Schema) MetadataByItemName(itemName string) (uint32, Metadata, bool) {
	for defIndex, item := range s.items {
		if item.Name == itemName {
			return defIndex, s.Metadata(defIndex, 0, nil), true
		}
	}
	return 0, Metadata{}, false
}

func (s *Schema) AttributeDefIndexByName(name string) (uint32, bool) {
	if s == nil || s.attributes == nil {
		return 0, false
	}
	target := strings.ToLower(name)
	for defIndex, attr := range s.attributes {
		if strings.ToLower(attr.Name) == target || strings.ToLower(attr.AttributeClass) == target {
			return defIndex, true
		}
	}
	return 0, false
}
