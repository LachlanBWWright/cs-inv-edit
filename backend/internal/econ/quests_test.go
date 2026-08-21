package econ

import "testing"

func TestParseQuestsIncludesLocalizedObjectiveAndRewards(t *testing.T) {
	items, err := parseKeyValues(`"items_game" { "quest_definitions" { "42" { "name" "fallback" "loc_name" "#quest_name" "loc_description" "#quest_desc" "gamemode" "competitive" "map" "de_nuke" "expression" "%act_win_round%" "points" "10" "xp_reward" "500" "operational_points" "2" } } }`)
	if err != nil {
		t.Fatal(err)
	}
	schema := &Schema{tokens: map[string]string{"quest_name": "Nuclear option", "quest_desc": "Win rounds on Nuke."}}
	schema.parseQuests(items.object("items_game"))
	quest, found := schema.Quest(42)
	if !found {
		t.Fatal("quest 42 was not parsed")
	}
	if quest.Name != "Nuclear option" || quest.Description != "Win rounds on Nuke." {
		t.Fatalf("localized quest = %#v", quest)
	}
	if quest.Points != 10 || quest.XPReward != 500 || quest.OperationalPoints != 2 {
		t.Fatalf("quest rewards = %#v", quest)
	}
}
