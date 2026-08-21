package econ

import (
	"fmt"
	"strings"
)

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

func localizeFromTokens(tokens map[string]string, token string) string {
	token = strings.ToLower(strings.TrimPrefix(strings.TrimSpace(token), "#"))
	return tokens[token]
}
