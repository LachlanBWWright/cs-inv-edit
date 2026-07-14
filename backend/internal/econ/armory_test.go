package econ

import "testing"

func TestParseArmoryOffersUsesCurrentXpShopGoods(t *testing.T) {
	schema := &Schema{
		tokens:    map[string]string{"first": "First Collection", "second": "Second Capsule", "weapon": "Test Weapon"},
		lootLists: map[string][]string{"set_first": {"weapon_test"}},
		items:     map[uint32]itemDefinition{1: {Name: "weapon_test", ItemName: "#weapon"}},
	}
	items := `
"seasonaloperations" { "10" { "operational_point_redeemable" { "points" "99" "item_name" "retired" } } }
"seasonaloperations" { "11" {
  "redeemable_goods" "xpshop"
  "operational_point_redeemable" { "points" "4" "item_name" "lootlist:set_first" "callout" "#first" "ui_order" "2" }
  "operational_point_redeemable" { "points" "1" "item_name" "lootlist:second" "callout" "#second" "ui_order" "3" }
} }
"pro_event_results" {}`
	offers := parseArmoryOffers(items, schema)
	if len(offers) != 2 {
		t.Fatalf("offers = %#v, want two current XP Shop goods", offers)
	}
	if offers[0].CampaignID != 11 || offers[0].RedeemID != 0 || offers[0].ExpectedCost != 4 || offers[0].Name != "First Collection" {
		t.Fatalf("first offer = %#v", offers[0])
	}
	if len(offers[0].Items) != 1 || offers[0].Items[0].Name != "Test Weapon" {
		t.Fatalf("first offer contents = %#v", offers[0].Items)
	}
	if offers[1].RedeemID != 1 || offers[1].ExpectedCost != 1 || offers[1].Name != "Second Capsule" {
		t.Fatalf("second offer = %#v", offers[1])
	}
}
