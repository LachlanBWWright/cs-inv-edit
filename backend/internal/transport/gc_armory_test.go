package transport

import (
	"testing"

	cs2pb "cs-inv-edit/backend/internal/proto/generated"
	"google.golang.org/protobuf/proto"
)

func TestDecodeArmoryFromClientWelcome(t *testing.T) {
	store, err := proto.Marshal(&cs2pb.CSOAccountItemPersonalStore{GenerationTime: proto.Uint32(1234), RedeemableBalance: proto.Uint32(17), Items: []uint64{9001}})
	if err != nil { t.Fatal(err) }
	bid, err := proto.Marshal(&cs2pb.CSOAccountXpShopBids{CampaignId: proto.Uint32(10), RedeemId: proto.Uint32(20), ExpectedCost: proto.Uint32(4), GenerationTime: proto.Uint32(1234)})
	if err != nil { t.Fatal(err) }
	body, err := proto.Marshal(&cs2pb.CMsgClientWelcome{OutofdateSubscribedCaches: []*cs2pb.CMsgSOCacheSubscribed{{Objects: []*cs2pb.CMsgSOCacheSubscribed_SubscribedType{{TypeId: proto.Int32(41), ObjectData: [][]byte{store}}, {TypeId: proto.Int32(42), ObjectData: [][]byte{bid}}}}}})
	if err != nil { t.Fatal(err) }
	state, err := decodeArmoryFromClientWelcome(body)
	if err != nil { t.Fatal(err) }
	if state.Balance != 17 || state.GenerationTime != 1234 || len(state.Offers) != 1 || state.Offers[0].ExpectedCost != 4 { t.Fatalf("unexpected Armory state: %#v", state) }
}

func TestDecodeArmoryDoesNotTreatOwnedItemsAsStore(t *testing.T) {
	econ, err := proto.Marshal(&cs2pb.CSOEconItem{Id: proto.Uint64(1234), AccountId: proto.Uint32(17), Inventory: proto.Uint32(1)})
	if err != nil { t.Fatal(err) }
	body, err := proto.Marshal(&cs2pb.CMsgClientWelcome{OutofdateSubscribedCaches: []*cs2pb.CMsgSOCacheSubscribed{{Objects: []*cs2pb.CMsgSOCacheSubscribed_SubscribedType{{TypeId: proto.Int32(1), ObjectData: [][]byte{econ}}}}}})
	if err != nil { t.Fatal(err) }
	if _, err := decodeArmoryFromClientWelcome(body); err == nil { t.Fatal("expected owned inventory to be excluded from Armory decoding") }
}
