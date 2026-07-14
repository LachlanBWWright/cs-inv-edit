package transport

import (
	"testing"

	cs2pb "cs-inv-edit/backend/internal/proto/generated"
	"google.golang.org/protobuf/proto"
)

func TestDecodeInventoryIgnoresNonEconSOCacheTypes(t *testing.T) {
	foreign, err := proto.Marshal(&cs2pb.CSOAccountItemPersonalStore{GenerationTime: proto.Uint32(4001), Items: []uint64{36}})
	if err != nil {
		t.Fatal(err)
	}
	econ, err := proto.Marshal(&cs2pb.CSOEconItem{Id: proto.Uint64(1234), DefIndex: proto.Uint32(7), Inventory: proto.Uint32(1), Quantity: proto.Uint32(1)})
	if err != nil {
		t.Fatal(err)
	}
	body, err := proto.Marshal(&cs2pb.CMsgClientWelcome{OutofdateSubscribedCaches: []*cs2pb.CMsgSOCacheSubscribed{{Objects: []*cs2pb.CMsgSOCacheSubscribed_SubscribedType{
		{TypeId: proto.Int32(41), ObjectData: [][]byte{foreign}},
		{TypeId: proto.Int32(1), ObjectData: [][]byte{econ}},
	}}}})
	if err != nil {
		t.Fatal(err)
	}
	items, err := decodeInventoryFromClientWelcome(body)
	if err != nil {
		t.Fatal(err)
	}
	if len(items) != 1 || items[0].ID != 1234 || items[0].DefIndex != 7 {
		t.Fatalf("decoded inventory = %#v", items)
	}
}

func TestEconPaintKitReadsValueBytes(t *testing.T) {
	// Attribute 6 stores the numeric paint-kit ID as float bits.
	item := &cs2pb.CSOEconItem{Attribute: []*cs2pb.CSOEconItem_Attribute{{DefIndex: proto.Uint32(6), ValueBytes: []byte{0x00, 0x00, 0xc8, 0x42}}}}
	if got := econPaintKit(item); got != 100 {
		t.Fatalf("paint kit = %d", got)
	}
}

func TestEconPaintKitAcceptsNormalizedValue(t *testing.T) {
	item := &cs2pb.CSOEconItem{Attribute: []*cs2pb.CSOEconItem_Attribute{{DefIndex: proto.Uint32(6), Value: proto.Uint32(100)}}}
	if got := econPaintKit(item); got != 100 {
		t.Fatalf("paint kit = %d", got)
	}
}
