package transport

import (
	"testing"

	cs2pb "cs-inv-edit/backend/internal/proto/generated"
	"cs-inv-edit/backend/internal/protocol"
	"google.golang.org/protobuf/proto"
)

func TestDecodeArmoryFromXpShopCacheTypeSix(t *testing.T) {
	xpShop, err := proto.Marshal(&cs2pb.CSOAccountXpShop{GenerationTime: proto.Uint32(1_723_456_789), RedeemableBalance: proto.Uint32(17), XpTracks: []uint32{100, 200}})
	if err != nil {
		t.Fatal(err)
	}
	body, err := proto.Marshal(&cs2pb.CMsgClientWelcome{OutofdateSubscribedCaches: []*cs2pb.CMsgSOCacheSubscribed{{Objects: []*cs2pb.CMsgSOCacheSubscribed_SubscribedType{{TypeId: proto.Int32(6), ObjectData: [][]byte{xpShop}}}}}})
	if err != nil {
		t.Fatal(err)
	}
	state, err := decodeArmoryFromClientWelcome(body)
	if err != nil {
		t.Fatal(err)
	}
	if state.Balance != 17 || state.GenerationTime != 1_723_456_789 || len(state.ItemIDs) != 0 || len(state.Offers) != 0 {
		t.Fatalf("unexpected XP Shop state: %#v", state)
	}
}

func TestDecodeArmoryTreatsOriginalFieldThreeAsXpTracks(t *testing.T) {
	// This is the reported wire shape: generation_time=1, balance=0 and one
	// xp_tracks value. Generation time is an opaque uint32, not a Unix timestamp.
	unrelated, _ := proto.Marshal(&cs2pb.CSOAccountItemPersonalStore{GenerationTime: proto.Uint32(1), Items: []uint64{1}})
	body, _ := proto.Marshal(&cs2pb.CMsgClientWelcome{OutofdateSubscribedCaches: []*cs2pb.CMsgSOCacheSubscribed{{Objects: []*cs2pb.CMsgSOCacheSubscribed_SubscribedType{{TypeId: proto.Int32(41), ObjectData: [][]byte{unrelated}}}}}})
	state, err := decodeArmoryFromClientWelcome(body)
	if err != nil || state.GenerationTime != 1 || state.Balance != 0 || len(state.ItemIDs) != 0 || state.XpShopTypeID != 41 {
		t.Fatalf("reported XP Shop shape was not decoded correctly: state=%#v err=%v", state, err)
	}
}

func TestXpShopCandidateRejectsPersonalStoreUint64Item(t *testing.T) {
	personalStore, _ := proto.Marshal(&cs2pb.CSOAccountItemPersonalStore{GenerationTime: proto.Uint32(1_723_456_789), RedeemableBalance: proto.Uint32(4), Items: []uint64{7_000_000_000}})
	if _, valid, reason := decodeXpShopCandidate(personalStore); valid {
		t.Fatalf("personal store uint64 item accepted as XP Shop: %s", reason)
	}
}

func TestXpShopCandidateRejectsUnknownFields(t *testing.T) {
	bid, _ := proto.Marshal(&cs2pb.CSOAccountXpShopBids{CampaignId: proto.Uint32(1_723_456_789), RedeemId: proto.Uint32(2), ExpectedCost: proto.Uint32(4), GenerationTime: proto.Uint32(1)})
	if _, valid, reason := decodeXpShopCandidate(bid); valid {
		t.Fatalf("bid with field 4 accepted as XP Shop: %s", reason)
	}
}

func TestDecodeArmoryFromPostWelcomeCacheSubscribed(t *testing.T) {
	xpShop, _ := proto.Marshal(&cs2pb.CSOAccountXpShop{GenerationTime: proto.Uint32(1_723_456_791), RedeemableBalance: proto.Uint32(12)})
	subscribed, _ := proto.Marshal(&cs2pb.CMsgSOCacheSubscribed{Objects: []*cs2pb.CMsgSOCacheSubscribed_SubscribedType{{TypeId: proto.Int32(6), ObjectData: [][]byte{xpShop}}}})
	state := GCArmorySnapshot{XpShopTypeID: 6}
	matched, err := decodeArmorySOMessage(&state, GCMessage{AppID: 730, EMsg: protocol.EMsgSOCacheSubscribed, Body: subscribed})
	if err != nil || !matched || state.GenerationTime != 1_723_456_791 || state.Balance != 12 {
		t.Fatalf("post-Welcome XpShop subscription not decoded: state=%#v matched=%v err=%v", state, matched, err)
	}
}

func TestDecodeArmoryIncrementalXpShopUpdate(t *testing.T) {
	xpShop, _ := proto.Marshal(&cs2pb.CSOAccountXpShop{GenerationTime: proto.Uint32(1_723_456_790), RedeemableBalance: proto.Uint32(9)})
	body, _ := proto.Marshal(&cs2pb.CMsgSOSingleObject{TypeId: proto.Int32(6), ObjectData: xpShop, Version: proto.Uint64(7)})
	state := GCArmorySnapshot{XpShopTypeID: 6}
	matched, err := decodeArmorySOMessage(&state, GCMessage{AppID: 730, EMsg: protocol.EMsgSOUpdate, Body: body})
	if err != nil || !matched || state.Balance != 9 {
		t.Fatalf("incremental XP Shop update was not decoded: state=%#v matched=%v err=%v", state, matched, err)
	}
}

func TestDecodeArmoryIgnoresXpShopBidCache(t *testing.T) {
	bid, _ := proto.Marshal(&cs2pb.CSOAccountXpShopBids{CampaignId: proto.Uint32(11), RedeemId: proto.Uint32(2), ExpectedCost: proto.Uint32(4)})
	body, _ := proto.Marshal(&cs2pb.CMsgSOSingleObject{TypeId: proto.Int32(42), ObjectData: bid})
	state := GCArmorySnapshot{}
	matched, err := decodeArmorySOMessage(&state, GCMessage{AppID: 730, EMsg: protocol.EMsgSOUpdate, Body: body})
	if err != nil || matched || len(state.Offers) != 0 {
		t.Fatalf("bid cache must not become the universal catalogue: state=%#v matched=%v err=%v", state, matched, err)
	}
}
