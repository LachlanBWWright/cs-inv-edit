package econ

import (
	"bytes"
	"encoding/binary"
	"testing"
)

func TestSchemaCouponClassificationUsesPrefab(t *testing.T) {
	schema := &Schema{items: map[uint32]itemDefinition{
		20170: {Name: "coupon - music kit", Prefab: "coupon_masterminds_capsule_prefab"},
		1200:  {Name: "Name Tag", Prefab: "name_tag"},
	}}
	if !schema.IsCoupon(20170) {
		t.Fatal("coupon prefab was not classified as a coupon")
	}
	if schema.IsCoupon(1200) || schema.IsCoupon(999999) {
		t.Fatal("ordinary or unknown definition was classified as a coupon")
	}
}

func TestTF2RawBinaryKVStorePriceSheet(t *testing.T) {
	var raw bytes.Buffer
	writeStoreKVObject := func(name string) {
		raw.WriteByte(0)
		raw.WriteString(name)
		raw.WriteByte(0)
	}
	writeStoreKVObject("store")
	writeStoreKVObject("key offer")
	raw.WriteByte(1)
	raw.WriteString("item_link")
	raw.WriteByte(0)
	raw.WriteString("Mann Co. Supply Crate Key")
	raw.WriteByte(0)
	writeStoreKVObject("prices")
	raw.WriteByte(2)
	raw.WriteString("usd")
	raw.WriteByte(0)
	if err := binary.Write(&raw, binary.LittleEndian, uint32(249)); err != nil {
		t.Fatal(err)
	}
	raw.Write([]byte{8, 8, 8, 8})

	catalog, err := ParseStorePriceSheet(raw.Bytes())
	if err != nil {
		t.Fatal(err)
	}
	if len(catalog.Offers) != 1 || catalog.Offers[0].Prices["USD"] != 249 {
		t.Fatalf("raw TF2 catalogue = %#v", catalog)
	}
}

func TestEmptyStorePriceSheetReportsPayloadState(t *testing.T) {
	_, err := ParseStorePriceSheet(nil)
	if err == nil || err.Error() != "store price sheet payload was empty" {
		t.Fatalf("empty price sheet error = %v", err)
	}
}

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

func TestTF2StoreEntryUsesAccountLocalBasePrice(t *testing.T) {
	entry := &binaryKVNode{
		Name: "mann co key",
		Values: map[string]any{
			"item_link":  "Mann Co. Supply Crate Key",
			"base_price": uint64(249),
		},
	}
	offer, ok := storeOfferFromNode(entry)
	if !ok {
		t.Fatal("TF2 base_price store entry was not recognized")
	}
	if offer.Prices["BASE_USD"] != 249 {
		t.Fatalf("TF2 base USD price = %d, want 249", offer.Prices["BASE_USD"])
	}
}

func TestTF2StoreEntryRetainsAccountLocalPrice(t *testing.T) {
	entry := &binaryKVNode{Values: map[string]any{
		"item_link":               "Mann Co. Supply Crate Key",
		"base_price":              uint64(249),
		"price_in_local_currency": uint64(395),
	}}
	offer, ok := storeOfferFromNode(entry)
	if !ok || offer.LocalPrice == nil || *offer.LocalPrice != 395 {
		t.Fatalf("TF2 localized offer = %#v", offer)
	}
}
