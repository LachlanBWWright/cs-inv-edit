package econ

import "strconv"

type QuestDefinition struct {
	Name              string
	Description       string
	GameMode          string
	Map               string
	MapGroup          string
	Expression        string
	Points            uint32
	XPReward          uint32
	OperationalPoints uint32
}

func (s *Schema) Quest(defIndex uint32) (QuestDefinition, bool) {
	definition, found := s.quests[defIndex]
	return definition, found
}

func (s *Schema) parseQuests(itemsGame kvObject) {
	if s.quests == nil {
		s.quests = make(map[uint32]QuestDefinition)
	}
	for key, node := range itemsGame.object("quest_definitions") {
		index, err := strconv.ParseUint(key, 10, 32)
		if err != nil {
			continue
		}
		quest := node.objectValue()
		s.quests[uint32(index)] = QuestDefinition{
			Name:        firstNonEmpty(s.localize(quest.string("loc_name")), quest.string("name")),
			Description: s.localize(quest.string("loc_description")),
			GameMode:    quest.string("gamemode"), Map: quest.string("map"),
			MapGroup: quest.string("mapgroup"), Expression: quest.string("expression"),
			Points: uint32Value(quest.string("points")), XPReward: uint32Value(quest.string("xp_reward")),
			OperationalPoints: uint32Value(quest.string("operational_points")),
		}
	}
}
