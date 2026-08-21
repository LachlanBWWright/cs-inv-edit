package econ

import (
	_ "embed"
	"fmt"
	"html"
	"regexp"
	"strings"
	"time"
)

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
	Properties   []inventoryProperties  `json:"asset_properties"`
	Descriptions []inventoryDescription `json:"descriptions"`
}

type inventoryAsset struct {
	AssetID    string `json:"assetid"`
	ClassID    string `json:"classid"`
	InstanceID string `json:"instanceid"`
}

type inventoryProperties struct {
	AssetID    string                  `json:"assetid"`
	Properties []inventoryPropertyItem `json:"asset_properties"`
}

type inventoryPropertyItem struct {
	PropertyID  uint32 `json:"propertyid"`
	StringValue string `json:"string_value"`
}

func inventoryPropertiesByAsset(values []inventoryProperties) map[string][]inventoryPropertyItem {
	properties := make(map[string][]inventoryPropertyItem, len(values))
	for _, value := range values {
		properties[value.AssetID] = value.Properties
	}
	return properties
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
	Actions        []inventoryAction          `json:"actions"`
	OwnerActions   []inventoryAction          `json:"owner_actions"`
}

type inventoryAction struct {
	Name string `json:"name"`
	Link string `json:"link"`
}

func inventoryInspectURL(actions []inventoryAction) string {
	for _, action := range actions {
		link := strings.TrimSpace(action.Link)
		lower := strings.ToLower(link)
		if (strings.HasPrefix(lower, "steam://run/730/") || strings.HasPrefix(lower, "steam://rungame/730/")) && strings.Contains(lower, "/+csgo_econ_action_preview%20") {
			return link
		}
	}
	return ""
}

func expandInventoryInspectURL(link, steamID, assetID string, properties []inventoryPropertyItem) string {
	link = strings.ReplaceAll(link, "%owner_steamid%", steamID)
	link = strings.ReplaceAll(link, "%assetid%", assetID)
	for _, property := range properties {
		placeholder := fmt.Sprintf("%%propid:%d%%", property.PropertyID)
		link = strings.ReplaceAll(link, placeholder, property.StringValue)
	}
	if strings.Contains(link, "%propid:") {
		return ""
	}
	return link
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
