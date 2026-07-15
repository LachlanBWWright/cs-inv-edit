package econ

import (
	"fmt"
	"strconv"
	"strings"
)

type TF2Definition struct {
	DefIndex     uint32
	Name         string
	Type         string
	Quality      string
	Slot         string
	UsedByClass  []string
	Capabilities map[string]string
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
		out[uint32(value)] = TF2Definition{DefIndex: uint32(value), Name: name, Type: typeName, Quality: merged.string("item_quality"), Slot: merged.string("item_slot"), UsedByClass: classes, Capabilities: merged.object("capabilities").strings()}
	}
	if len(out) == 0 {
		return nil, fmt.Errorf("TF2 items_game contained no item definitions")
	}
	return out, nil
}

func localizeFromTokens(tokens map[string]string, token string) string {
	token = strings.ToLower(strings.TrimPrefix(strings.TrimSpace(token), "#"))
	return tokens[token]
}
