package steaminventory

import (
	"bytes"
	"encoding/json"
	"fmt"
	"strconv"
	"strings"
	"time"

	"cs-inv-edit/backend/internal/domain"
	"cs-inv-edit/backend/internal/transport"
)

type item struct {
	ItemID                flexibleID      `json:"itemid"`
	ItemDefID             flexibleID      `json:"itemdefid"`
	Quantity              flexibleUint64  `json:"quantity"`
	Acquired              flexibleTime    `json:"acquired"`
	StateChangedTimestamp flexibleTime    `json:"state_changed_timestamp"`
	State                 string          `json:"state"`
	Origin                string          `json:"origin"`
	DynamicProps          json.RawMessage `json:"dynamic_props"`
}

type itemDefinition struct {
	ItemDefID    flexibleID      `json:"itemdefid"`
	Name         string          `json:"name"`
	DisplayType  string          `json:"display_type"`
	Description  string          `json:"description"`
	IconURL      string          `json:"icon_url"`
	IconURLLarge string          `json:"icon_url_large"`
	MarketName   string          `json:"market_name"`
	Marketable   flexibleBool    `json:"marketable"`
	Tradable     flexibleBool    `json:"tradable"`
	Tags         json.RawMessage `json:"tags"`
}

type flexibleID string

func (id *flexibleID) UnmarshalJSON(data []byte) error {
	value, err := scalarString(data)
	if err != nil {
		return err
	}
	if value == "" {
		return fmt.Errorf("identifier is empty")
	}
	*id = flexibleID(value)
	return nil
}

type flexibleUint64 uint64

func (value *flexibleUint64) UnmarshalJSON(data []byte) error {
	text, err := scalarString(data)
	if err != nil {
		return err
	}
	parsed, err := strconv.ParseUint(text, 10, 64)
	if err != nil {
		return fmt.Errorf("invalid unsigned integer %q", text)
	}
	*value = flexibleUint64(parsed)
	return nil
}

type flexibleBool bool

func (value *flexibleBool) UnmarshalJSON(data []byte) error {
	text, err := scalarString(data)
	if err != nil {
		return err
	}
	switch strings.ToLower(text) {
	case "1", "true":
		*value = true
	case "", "0", "false":
		*value = false
	default:
		return fmt.Errorf("invalid boolean %q", text)
	}
	return nil
}

type flexibleTime string

func (value *flexibleTime) UnmarshalJSON(data []byte) error {
	text, err := scalarString(data)
	if err != nil {
		return err
	}
	*value = flexibleTime(text)
	return nil
}

func scalarString(data []byte) (string, error) {
	var text string
	if err := json.Unmarshal(data, &text); err == nil {
		return strings.TrimSpace(text), nil
	}
	var boolean bool
	if err := json.Unmarshal(data, &boolean); err == nil {
		return strconv.FormatBool(boolean), nil
	}
	var number json.Number
	decoder := json.NewDecoder(bytes.NewReader(data))
	decoder.UseNumber()
	if err := decoder.Decode(&number); err == nil {
		return number.String(), nil
	}
	return "", fmt.Errorf("expected string or number")
}

func Snapshot(appID uint32, response transport.SteamInventoryServiceResponse) (domain.GameInventorySnapshot, error) {
	items, err := decodeCollection[item](response.ItemJSON, "items")
	if err != nil {
		return domain.GameInventorySnapshot{}, fmt.Errorf("decode Steam Inventory Service item_json: %w", err)
	}
	definitions, err := decodeDefinitions(response.ItemDefJSON)
	if err != nil {
		return domain.GameInventorySnapshot{}, fmt.Errorf("decode Steam Inventory Service itemdef_json: %w", err)
	}
	definitionsByID := make(map[string]itemDefinition, len(definitions))
	for _, definition := range definitions {
		definitionsByID[string(definition.ItemDefID)] = definition
	}
	normalized := make([]domain.EconomyInventoryItem, 0, len(items))
	missingDefinitions := 0
	for _, source := range items {
		itemID := string(source.ItemID)
		definitionID := string(source.ItemDefID)
		definition, found := definitionsByID[definitionID]
		if !found {
			missingDefinitions++
		}
		quantity := uint64(source.Quantity)
		if quantity == 0 {
			return domain.GameInventorySnapshot{}, fmt.Errorf("item %s has zero quantity", itemID)
		}
		dynamicProperties, propertiesErr := decodeDynamicProperties(source.DynamicProps)
		if propertiesErr != nil {
			return domain.GameInventorySnapshot{}, fmt.Errorf("decode dynamic properties for item %s: %w", itemID, propertiesErr)
		}
		name := strings.TrimSpace(definition.Name)
		if name == "" {
			name = "Definition " + definitionID
		}
		tags := decodeTags(definition.Tags)
		normalized = append(normalized, domain.EconomyInventoryItem{
			Game:         "steam-service",
			AppID:        appID,
			AssetID:      itemID,
			Name:         name,
			MarketName:   definition.MarketName,
			ImageURL:     normalizedImageURL(firstNonEmpty(definition.IconURLLarge, definition.IconURL)),
			Quantity:     quantity,
			Type:         definition.DisplayType,
			Tradable:     bool(definition.Tradable),
			Marketable:   bool(definition.Marketable),
			Tags:         tags,
			Descriptions: nonEmptyStrings(definition.Description),
			Details: domain.EconomyItemDetails{
				Game:                "steam-service",
				Attributes:          map[string]uint32{},
				AttributeBytes:      map[string]string{},
				ServiceItemID:       itemID,
				ServiceDefinitionID: definitionID,
				AcquiredAt:          normalizeTime(string(source.Acquired)),
				StateChangedAt:      normalizeTime(string(source.StateChangedTimestamp)),
				ServiceState:        source.State,
				ServiceOrigin:       source.Origin,
				DynamicProperties:   dynamicProperties,
			},
		})
	}
	diagnostics := []string{
		fmt.Sprintf("Steam Inventory Service Inventory.GetInventory loaded %d owned items for AppID %d.", len(normalized), appID),
		"These items are AppID-scoped Steam Inventory Service ownership and are not merged into GC or Community inventories.",
	}
	if missingDefinitions > 0 {
		diagnostics = append(diagnostics, fmt.Sprintf("%d items had no matching item definition metadata.", missingDefinitions))
	}
	if len(response.RemovedItemIDs) > 0 {
		diagnostics = append(diagnostics, fmt.Sprintf("Steam reported %d removed item IDs in this response.", len(response.RemovedItemIDs)))
	}
	if response.Replayed {
		diagnostics = append(diagnostics, "Steam marked the response as replayed.")
	}
	return domain.GameInventorySnapshot{
		Game: "steam-service", AppID: appID, Items: normalized,
		RefreshedAt: time.Now().UTC().Format(time.RFC3339Nano), Status: "ready",
		SchemaRevision: response.ETag, Diagnostics: diagnostics,
	}, nil
}

func decodeCollection[T any](raw string, objectKey string) ([]T, error) {
	trimmed := strings.TrimSpace(raw)
	if trimmed == "" || trimmed == "null" {
		return []T{}, nil
	}
	var direct []T
	if err := json.Unmarshal([]byte(trimmed), &direct); err == nil {
		return direct, nil
	}
	var wrapper map[string]json.RawMessage
	if err := json.Unmarshal([]byte(trimmed), &wrapper); err != nil {
		return nil, err
	}
	for _, key := range []string{objectKey, "items", "itemdefs", "definitions"} {
		value, found := wrapper[key]
		if !found {
			continue
		}
		if err := json.Unmarshal(value, &direct); err != nil {
			return nil, err
		}
		return direct, nil
	}
	return []T{}, nil
}

func decodeDefinitions(raw string) ([]itemDefinition, error) {
	trimmed := strings.TrimSpace(raw)
	if trimmed == "" || trimmed == "null" {
		return []itemDefinition{}, nil
	}
	var definitions []itemDefinition
	if strings.HasPrefix(trimmed, "[") {
		if err := json.Unmarshal([]byte(trimmed), &definitions); err != nil {
			return nil, err
		}
		return definitions, nil
	}
	var keyed map[string]json.RawMessage
	if err := json.Unmarshal([]byte(raw), &keyed); err != nil {
		return nil, err
	}
	for _, key := range []string{"itemdefs", "definitions"} {
		value, found := keyed[key]
		if !found {
			continue
		}
		if err := json.Unmarshal(value, &definitions); err == nil {
			return definitions, nil
		}
		var nested map[string]json.RawMessage
		if err := json.Unmarshal(value, &nested); err != nil {
			return nil, err
		}
		keyed = nested
		break
	}
	result := make([]itemDefinition, 0, len(keyed))
	for id, value := range keyed {
		var definition itemDefinition
		if err := json.Unmarshal(value, &definition); err != nil {
			return nil, err
		}
		if definition.ItemDefID == "" {
			definition.ItemDefID = flexibleID(id)
		}
		result = append(result, definition)
	}
	return result, nil
}

func decodeDynamicProperties(raw json.RawMessage) (map[string]string, error) {
	result := map[string]string{}
	if len(raw) == 0 || string(raw) == "null" || string(raw) == `""` {
		return result, nil
	}
	value := raw
	var encoded string
	if err := json.Unmarshal(raw, &encoded); err == nil {
		if strings.TrimSpace(encoded) == "" {
			return result, nil
		}
		value = []byte(encoded)
	}
	var properties map[string]json.RawMessage
	if err := json.Unmarshal(value, &properties); err != nil {
		return nil, err
	}
	for key, property := range properties {
		var text string
		if err := json.Unmarshal(property, &text); err == nil {
			result[key] = text
		} else {
			result[key] = string(property)
		}
	}
	return result, nil
}

func decodeTags(raw json.RawMessage) []domain.EconomyTag {
	if len(raw) == 0 {
		return []domain.EconomyTag{}
	}
	var tags []struct {
		Category string `json:"category"`
		Value    string `json:"value"`
		Name     string `json:"name"`
	}
	value := raw
	var encoded string
	if err := json.Unmarshal(raw, &encoded); err == nil {
		value = []byte(encoded)
	}
	if err := json.Unmarshal(value, &tags); err != nil {
		return []domain.EconomyTag{}
	}
	result := make([]domain.EconomyTag, 0, len(tags))
	for _, tag := range tags {
		name := firstNonEmpty(tag.Name, tag.Value)
		result = append(result, domain.EconomyTag{Category: tag.Category, InternalName: tag.Value, Name: name})
	}
	return result
}

func normalizeTime(value string) string {
	value = strings.TrimSpace(value)
	if value == "" {
		return ""
	}
	if seconds, err := strconv.ParseInt(value, 10, 64); err == nil {
		return time.Unix(seconds, 0).UTC().Format(time.RFC3339)
	}
	if parsed, err := time.Parse(time.RFC3339, value); err == nil {
		return parsed.UTC().Format(time.RFC3339)
	}
	return value
}

func firstNonEmpty(values ...string) string {
	for _, value := range values {
		if strings.TrimSpace(value) != "" {
			return strings.TrimSpace(value)
		}
	}
	return ""
}

func normalizedImageURL(value string) string {
	value = strings.TrimSpace(value)
	if strings.HasPrefix(value, "https://") || strings.HasPrefix(value, "http://") {
		return value
	}
	return ""
}

func nonEmptyStrings(values ...string) []string {
	result := make([]string, 0, len(values))
	for _, value := range values {
		if value = strings.TrimSpace(value); value != "" {
			result = append(result, value)
		}
	}
	return result
}
