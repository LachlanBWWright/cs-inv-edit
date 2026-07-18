package econ

import "testing"

func TestModernStoreEntryUsesItemLinkAndNestedCurrencyPrices(t *testing.T) {
	entry := &binaryKVNode{
		Name:   "name tag",
		Values: map[string]any{"item_link": "Name Tag", "category_tags": "Misc"},
		Children: []*binaryKVNode{
			{Name: "prices", Values: map[string]any{"aud": uint64(305), "usd": uint64(199)}},
			{Name: "sale_prices", Values: map[string]any{"aud": uint64(250)}},
		},
	}
	offer, ok := storeOfferFromNode(entry)
	if !ok {
		t.Fatal("modern store entry was not recognized")
	}
	if offer.ItemLink != "Name Tag" || offer.Category != "Misc" {
		t.Fatalf("unexpected offer: %#v", offer)
	}
	if offer.Prices["AUD"] != 305 || offer.SalePrices["AUD"] != 250 {
		t.Fatalf("nested prices were not retained: %#v", offer)
	}
}

func TestStoreEntryWithoutNestedPricesIsRejected(t *testing.T) {
	entry := &binaryKVNode{Name: "name tag", Values: map[string]any{"item_link": "Name Tag"}}
	if _, ok := storeOfferFromNode(entry); ok {
		t.Fatal("entry without prices should not be purchasable")
	}
}
