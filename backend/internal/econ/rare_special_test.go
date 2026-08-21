package econ

import "testing"

func TestRareSpecialIndexMapsContainerCollectionAndQuality(t *testing.T) {
	schema := &Schema{
		items: map[uint32]itemDefinition{
			7:    {Name: "weapon_ak47", ItemName: "#ak", ItemClass: "weapon_ak47"},
			5030: {Name: "slick_gloves", ItemName: "#driver", ItemClass: "weapon_slick_gloves", Capabilities: map[string]string{"paintable": "1"}},
			5181: {Name: "crate_community_37", ItemName: "#terminal", ItemClass: "supply_crate", SupplyCrateSeries: "468"},
		},
		paintKits: map[uint32]paintKitDefinition{
			100:  {Name: "input", Description: "#input_finish", Rarity: "ancient"},
			1399: {Name: "glove_driver_brocade_crane_red", Description: "#brocade", Rarity: "ancient"},
		},
		tokens: map[string]string{"ak": "AK-47", "driver": "★ Driver Gloves", "terminal": "Sealed Dead Hand Terminal", "input_finish": "Input", "brocade": "Brocade Crane"},
		collections: map[string]collectionDefinition{
			"set_community_37": {Name: "The Dead Hand Collection", Items: []string{"[input]weapon_ak47"}, Unusuals: map[string]string{"unique": "set_community_37_unusual"}},
		},
		collectionByItem:   map[string]string{"[input]weapon_ak47": "set_community_37"},
		revolvingLootLists: map[string]string{"468": "set_community_37"},
		lootLists:          map[string][]string{"set_community_37": {"[input]weapon_ak47", "set_community_37_unusual"}},
		imageURLs:          map[string]string{},
	}

	schema.applyRareSpecialIndex(`[{"def_index":"5181","contains":[{"name":"AK-47 | Input","paint_index":"100"}],"contains_rare":[{"name":"★ Driver Gloves | Brocade Crane","paint_index":"1399","image":"https://example.invalid/glove"}]}]`)

	container := schema.Metadata(5181, 0, nil)
	if len(container.ContainerItems) != 2 || len(container.ContainerItems[1].Items) != 1 || container.ContainerItems[1].Items[0].MarketName != "★ Driver Gloves | Brocade Crane" {
		t.Fatalf("container contents = %#v", container.ContainerItems)
	}
	regular := schema.MetadataForQuality(7, 100, nil, 4)
	if len(regular.TradeUpItems) != 1 || regular.TradeUpItems[0].PaintKit != 1399 {
		t.Fatalf("regular rare-special outcomes = %#v", regular.TradeUpItems)
	}
	statTrak := schema.MetadataForQuality(7, 100, nil, 9)
	if len(statTrak.TradeUpItems) != 0 {
		t.Fatalf("StatTrak glove outcomes = %#v, want none", statTrak.TradeUpItems)
	}
	if len(regular.CollectionItems) != 2 || len(regular.CollectionItems[1].Items) != 1 {
		t.Fatalf("collection preview = %#v", regular.CollectionItems)
	}
}
