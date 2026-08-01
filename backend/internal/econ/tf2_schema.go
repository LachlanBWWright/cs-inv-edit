package econ

import (
	"encoding/binary"
	"fmt"
	"math"
	"sort"
	"strconv"
	"strings"
	"time"
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
	QuestObjectives   []string
	Collection        string
	EquipRegions      []string
	Tags              []string
	MinLevel          uint32
	MaxLevel          uint32
	ProperName        bool
	BaseItem          bool
	Hidden            bool
	StaticAttributes  map[string]string
	Rarity            string
	EquipConflicts    []string
	LoadoutSlots      map[string]string
	PrefabChain       []string
	ContainerItems    []TF2RelatedItem
}

func ApplyTF2QuestLocalization(definitions map[uint32]TF2Definition, englishText string) error {
	root, err := parseKeyValues(englishText)
	if err != nil {
		return fmt.Errorf("parse TF2 quest localization: %w", err)
	}
	tokens := parseTokens(root)
	for defIndex, definition := range definitions {
		prefix := fmt.Sprintf("quest%d", defIndex)
		if name := tokens[strings.ToLower(prefix+"name0")]; name != "" {
			definition.Name = name
		}
		if description := tokens[strings.ToLower(prefix+"desc0")]; description != "" {
			definition.Description = description
		}
		objectives := make([]string, 0)
		for index := 0; index < 64; index++ {
			objective := tokens[strings.ToLower(fmt.Sprintf("%sobjectivedesc%d", prefix, index))]
			if objective != "" {
				objectives = append(objectives, strings.ReplaceAll(objective, "%s1", ""))
			}
		}
		definition.QuestObjectives = objectives
		definitions[defIndex] = definition
	}
	return nil
}

type TF2RelatedItem struct {
	DefIndex uint32
	Name     string
	Rarity   string
	PoolKind string
	ImageURL string
}

type TF2AttributeDefinition struct {
	DefIndex          uint32
	Name              string
	AttributeClass    string
	AttributeType     string
	DescriptionFormat string
	EffectType        string
	StoredAsInteger   bool
	Hidden            bool
	ValueNames        map[uint32]string
}

type TF2DecodedAttribute struct {
	DefIndex       uint32
	Name           string
	Value          string
	EffectType     string
	Hidden         bool
	AttributeClass string
}

func ParseTF2AttributeDefinitions(itemsText string) (map[uint32]TF2AttributeDefinition, error) {
	root, err := parseKeyValues(itemsText)
	if err != nil {
		return nil, fmt.Errorf("parse TF2 attribute schema: %w", err)
	}
	out := make(map[uint32]TF2AttributeDefinition)
	itemsGame := root.object("items_game")
	particleNames := parseTF2ParticleNames(itemsGame.object("attribute_controlled_attached_particles"))
	for key, node := range itemsGame.object("attributes") {
		index, parseErr := strconv.ParseUint(key, 10, 32)
		if parseErr != nil {
			continue
		}
		attribute := node.objectValue()
		definition := TF2AttributeDefinition{DefIndex: uint32(index), Name: attribute.string("name"), AttributeClass: attribute.string("attribute_class"), AttributeType: attribute.string("attribute_type"), DescriptionFormat: attribute.string("description_format"), EffectType: attribute.string("effect_type"), StoredAsInteger: schemaBool(attribute.string("stored_as_integer")), Hidden: schemaBool(attribute.string("hidden"))}
		if definition.DescriptionFormat == "value_is_particle_index" {
			definition.ValueNames = particleNames
		}
		out[uint32(index)] = definition
	}
	return out, nil
}

func parseTF2ParticleNames(groups kvObject) map[uint32]string {
	out := make(map[uint32]string)
	for _, group := range groups {
		for key, node := range group.children {
			index, err := strconv.ParseUint(key, 10, 32)
			if err != nil {
				continue
			}
			if system := node.children.string("system"); system != "" {
				out[uint32(index)] = humanizeIdentifier(system)
			}
		}
	}
	return out
}

func DecodeTF2Attributes(values map[uint32]uint32, byteValues map[uint32][]byte, definitions map[uint32]TF2AttributeDefinition) []TF2DecodedAttribute {
	indices := make([]int, 0, len(values)+len(byteValues))
	seen := make(map[uint32]bool)
	for index := range values {
		indices = append(indices, int(index))
		seen[index] = true
	}
	for index := range byteValues {
		if !seen[index] {
			indices = append(indices, int(index))
		}
	}
	sort.Ints(indices)
	out := make([]TF2DecodedAttribute, 0, len(indices))
	for _, numericIndex := range indices {
		index := uint32(numericIndex)
		definition, known := definitions[index]
		name := definition.Name
		if name == "" {
			name = fmt.Sprintf("Unknown attribute %d", index)
		}
		value := decodeTF2AttributeValue(values[index], byteValues[index], definition, known)
		out = append(out, TF2DecodedAttribute{DefIndex: index, Name: name, Value: value, EffectType: definition.EffectType, Hidden: definition.Hidden, AttributeClass: definition.AttributeClass})
	}
	return out
}

func decodeTF2AttributeValue(raw uint32, bytes []byte, definition TF2AttributeDefinition, known bool) string {
	if definition.AttributeType == "string" {
		if value, ok := decodeProtoString(bytes); ok {
			return value
		}
	}
	if definition.DescriptionFormat == "value_is_date" {
		return time.Unix(int64(raw), 0).UTC().Format("2 Jan 2006, 15:04 UTC")
	}
	floatValue := math.Float32frombits(raw)
	if definition.DescriptionFormat == "value_is_particle_index" {
		index := uint32(math.Round(float64(floatValue)))
		if name := definition.ValueNames[index]; name != "" {
			return fmt.Sprintf("%s (effect #%d)", name, index)
		}
		return fmt.Sprintf("Particle effect #%d", index)
	}
	if !definition.StoredAsInteger && known && !math.IsNaN(float64(floatValue)) && !math.IsInf(float64(floatValue), 0) {
		return strconv.FormatFloat(float64(floatValue), 'f', -1, 32)
	}
	if definition.StoredAsInteger && strings.Contains(definition.AttributeClass, "use_head_origin") && floatValue == 1 {
		return "Enabled"
	}
	if known {
		return strconv.FormatUint(uint64(raw), 10)
	}
	return fmt.Sprintf("%d (0x%08x)", raw, raw)
}

func decodeProtoString(value []byte) (string, bool) {
	if len(value) < 2 || value[0] != 0x0a {
		return "", false
	}
	length, bytesRead := binary.Uvarint(value[1:])
	start := 1 + bytesRead
	if bytesRead <= 0 || length > uint64(len(value)-start) {
		return "", false
	}
	return string(value[start : start+int(length)]), true
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
		prefabChain := collectPrefabChain(node.objectValue(), prefabs, nil)
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
		equipConflicts := enabledKeys(merged.object("equip_conflicts"))
		sort.Strings(equipConflicts)
		tags := enabledKeys(merged.object("tags"))
		sort.Strings(tags)
		toolType := merged.object("tool").string("type")
		itemClass := merged.string("item_class")
		out[uint32(value)] = TF2Definition{
			DefIndex: uint32(value), InternalName: merged.string("name"), Name: name, Type: typeName, Quality: merged.string("item_quality"), Slot: merged.string("item_slot"), UsedByClass: classes, Capabilities: merged.object("capabilities").strings(),
			ItemKind: classifyTF2Definition(itemClass, toolType), ItemClass: itemClass, CraftClass: merged.string("craft_class"), CraftMaterialType: merged.string("craft_material_type"), ToolType: toolType,
			Description: localizeFromTokens(tokens, merged.string("item_description")), EquipRegions: equipRegions, Tags: tags, MinLevel: uint32Value(merged.string("min_ilevel")), MaxLevel: uint32Value(merged.string("max_ilevel")),
			ProperName: schemaBool(merged.string("propername")), BaseItem: schemaBool(merged.string("baseitem")), Hidden: schemaBool(merged.string("hidden")) || merged.string("enabled") == "0", StaticAttributes: flattenStaticAttributes(merged.object("attributes")),
			Rarity: merged.string("item_rarity"), EquipConflicts: equipConflicts, LoadoutSlots: merged.object("item_slot_per_class").strings(), PrefabChain: prefabChain,
		}
	}
	applyTF2Collections(out, itemsGame)
	applyTF2ContainerItems(out, itemsGame)
	if len(out) == 0 {
		return nil, fmt.Errorf("TF2 items_game contained no item definitions")
	}
	return out, nil
}

func collectPrefabChain(base kvObject, prefabs kvObject, seen map[string]bool) []string {
	if seen == nil {
		seen = make(map[string]bool)
	}
	var out []string
	for _, name := range strings.Fields(base.string("prefab")) {
		if seen[name] {
			continue
		}
		seen[name] = true
		out = append(out, name)
		out = append(out, collectPrefabChain(prefabs.object(name), prefabs, seen)...)
	}
	return out
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
	itemClass = strings.ToLower(itemClass)
	toolType = strings.ToLower(toolType)
	switch {
	case itemClass == "supply_crate":
		return "container"
	case strings.Contains(itemClass, "taunt") || strings.Contains(toolType, "taunt"):
		return "taunt"
	case strings.Contains(toolType, "paint_can"):
		return "paint_can"
	case strings.Contains(toolType, "key"):
		return "key"
	case strings.Contains(toolType, "strangifier"):
		return "strangifier"
	case strings.Contains(toolType, "killstreak"):
		return "killstreak_kit"
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

func applyTF2ContainerItems(definitions map[uint32]TF2Definition, itemsGame kvObject) {
	byName := make(map[string]TF2Definition, len(definitions))
	for _, definition := range definitions {
		byName[strings.ToLower(definition.InternalName)] = definition
	}
	seriesLists := make(map[string]string)
	for listName, node := range itemsGame.object("revolving_loot_lists") {
		if node.value != "" {
			seriesLists[node.value] = listName
		}
	}
	lootLists := itemsGame.object("client_loot_lists")
	for index, definition := range definitions {
		listName := definition.StaticAttributes["loot list name"]
		if listName == "" {
			listName = seriesLists[definition.StaticAttributes["set supply crate series"]]
		}
		if listName == "" {
			continue
		}
		definition.ContainerItems = resolveTF2LootList(listName, lootLists, byName, nil)
		definitions[index] = definition
	}
}

func resolveTF2LootList(name string, lists kvObject, definitions map[string]TF2Definition, seen map[string]bool) []TF2RelatedItem {
	if seen == nil {
		seen = make(map[string]bool)
	}
	if seen[name] {
		return nil
	}
	seen[name] = true
	var out []TF2RelatedItem
	for entry := range lists.object(name) {
		if entry == "lootlist_job_templates" || entry == "additional_drop" || entry == "random_attributes" {
			continue
		}
		if len(lists.object(entry)) > 0 {
			out = append(out, resolveTF2LootList(entry, lists, definitions, seen)...)
			continue
		}
		if definition, ok := definitions[strings.ToLower(entry)]; ok {
			out = append(out, TF2RelatedItem{DefIndex: definition.DefIndex, Name: definition.Name, Rarity: definition.Rarity, PoolKind: "primary"})
			continue
		}
		out = append(out, TF2RelatedItem{Name: humanizeIdentifier(entry), PoolKind: "unresolved"})
	}
	sort.SliceStable(out, func(i, j int) bool { return out[i].Name < out[j].Name })
	return out
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
