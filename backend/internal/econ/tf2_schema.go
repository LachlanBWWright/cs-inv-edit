package econ

import (
	"fmt"
	"sort"
	"strconv"
	"strings"
)

type TF2Definition struct {
	DefIndex          uint32
	InternalName      string
	Name              string
	Type              string
	Quality           string
	Slot              string
	UsedByClass       []string
	Capabilities      map[string]string
	ItemKind          string
	ItemClass         string
	CraftClass        string
	CraftMaterialType string
	ToolType          string
	Description       string
	Collection        string
	EquipRegions      []string
	Tags              []string
	MinLevel          uint32
	MaxLevel          uint32
	ProperName        bool
	BaseItem          bool
	Hidden            bool
	StaticAttributes  map[string]string
}

func ParseTF2Definitions(itemsText string, englishText string) (map[uint32]TF2Definition, error) {
	itemsRoot, err := parseKeyValues(itemsText)
	if err != nil {
		return nil, fmt.Errorf("parse TF2 items_game: %w", err)
	}
	englishRoot, err := parseKeyValues(englishText)
	if err != nil {
		return nil, fmt.Errorf("parse TF2 localization: %w", err)
	}
	tokens := parseTokens(englishRoot)
	itemsGame := itemsRoot.object("items_game")
	prefabs := itemsGame.object("prefabs")
	out := make(map[uint32]TF2Definition)
	for key, node := range itemsGame.object("items") {
		value, err := strconv.ParseUint(key, 10, 32)
		if err != nil {
			continue
		}
		merged := mergePrefab(node.objectValue(), prefabs, nil)
		name := localizeFromTokens(tokens, merged.string("item_name"))
		if name == "" {
			name = humanizeIdentifier(merged.string("name"))
		}
		typeName := localizeFromTokens(tokens, merged.string("item_type_name"))
		classes := make([]string, 0)
		for class, enabled := range merged.object("used_by_classes").strings() {
			if enabled != "0" {
				classes = append(classes, class)
			}
		}
		sort.Strings(classes)
		equipRegions := enabledKeys(merged.object("equip_regions"))
		if region := merged.string("equip_region"); region != "" {
			equipRegions = appendUnique(equipRegions, region)
		}
		sort.Strings(equipRegions)
		tags := enabledKeys(merged.object("tags"))
		sort.Strings(tags)
		toolType := merged.object("tool").string("type")
		itemClass := merged.string("item_class")
		out[uint32(value)] = TF2Definition{
			DefIndex: uint32(value), InternalName: merged.string("name"), Name: name, Type: typeName, Quality: merged.string("item_quality"), Slot: merged.string("item_slot"), UsedByClass: classes, Capabilities: merged.object("capabilities").strings(),
			ItemKind: classifyTF2Definition(itemClass, toolType), ItemClass: itemClass, CraftClass: merged.string("craft_class"), CraftMaterialType: merged.string("craft_material_type"), ToolType: toolType,
			Description: localizeFromTokens(tokens, merged.string("item_description")), EquipRegions: equipRegions, Tags: tags, MinLevel: uint32Value(merged.string("min_ilevel")), MaxLevel: uint32Value(merged.string("max_ilevel")),
			ProperName: schemaBool(merged.string("propername")), BaseItem: schemaBool(merged.string("baseitem")), Hidden: schemaBool(merged.string("hidden")) || merged.string("enabled") == "0", StaticAttributes: flattenStaticAttributes(merged.object("attributes")),
		}
	}
	applyTF2Collections(out, itemsGame)
	if len(out) == 0 {
		return nil, fmt.Errorf("TF2 items_game contained no item definitions")
	}
	return out, nil
}

func enabledKeys(values kvObject) []string {
	out := make([]string, 0, len(values))
	for key, node := range values {
		if node.value != "0" {
			out = append(out, key)
		}
	}
	return out
}

func appendUnique(values []string, value string) []string {
	for _, current := range values {
		if current == value {
			return values
		}
	}
	return append(values, value)
}

func uint32Value(value string) uint32 {
	parsed, err := strconv.ParseUint(value, 10, 32)
	if err != nil {
		return 0
	}
	return uint32(parsed)
}

func schemaBool(value string) bool {
	switch strings.ToLower(strings.TrimSpace(value)) {
	case "1", "true", "yes":
		return true
	default:
		return false
	}
}

func flattenStaticAttributes(attributes kvObject) map[string]string {
	out := make(map[string]string)
	for name, node := range attributes {
		if node.value != "" {
			out[name] = node.value
			continue
		}
		if value := node.children.string("value"); value != "" {
			out[name] = value
		}
	}
	return out
}

func classifyTF2Definition(itemClass string, toolType string) string {
	switch {
	case itemClass == "supply_crate":
		return "container"
	case toolType != "":
		return "tool"
	case itemClass == "craft_item":
		return "crafting_material"
	case strings.Contains(itemClass, "wearable"):
		return "cosmetic"
	case strings.Contains(itemClass, "weapon"):
		return "weapon"
	default:
		return "item"
	}
}

func applyTF2Collections(definitions map[uint32]TF2Definition, itemsGame kvObject) {
	byInternalName := make(map[string]uint32, len(definitions))
	for index, definition := range definitions {
		byInternalName[strings.ToLower(definition.InternalName)] = index
	}
	for collectionName, node := range itemsGame.object("item_collections") {
		for itemName := range node.children.object("items") {
			if index, ok := byInternalName[strings.ToLower(itemName)]; ok {
				definition := definitions[index]
				definition.Collection = collectionName
				definitions[index] = definition
			}
		}
	}
}

func localizeFromTokens(tokens map[string]string, token string) string {
	token = strings.ToLower(strings.TrimPrefix(strings.TrimSpace(token), "#"))
	return tokens[token]
}
