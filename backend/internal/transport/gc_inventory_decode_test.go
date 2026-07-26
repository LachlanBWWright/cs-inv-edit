package transport

import (
	"encoding/hex"
	"os"
	"reflect"
	"strings"
	"testing"

	cs2pb "cs-inv-edit/backend/internal/proto/generated"
	multigamepb "cs-inv-edit/backend/internal/proto/generated/multigamepb"
	"cs-inv-edit/backend/internal/protocol"
	"google.golang.org/protobuf/proto"
)

func TestMergeGamesPlayedPreservesAllGameCoordinatorPresence(t *testing.T) {
	got := mergeGamesPlayed([]uint32{730, 440}, []uint32{730, 570, 440})
	want := []uint32{730, 440, 570}
	if !reflect.DeepEqual(got, want) {
		t.Fatalf("mergeGamesPlayed() = %v, want %v", got, want)
	}
}

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

func TestDecodeCS2IncrementalInventoryRetainsTerminalOfferSOCreate(t *testing.T) {
	offerBody, err := proto.Marshal(&cs2pb.CSOEconItem{
		Id:       proto.Uint64(700),
		DefIndex: proto.Uint32(8),
		Attribute: []*cs2pb.CSOEconItem_Attribute{
			{DefIndex: proto.Uint32(272), Value: proto.Uint32(0x89abcdef)},
			{DefIndex: proto.Uint32(273), Value: proto.Uint32(0x01234567)},
			{DefIndex: proto.Uint32(316), Value: proto.Uint32(1299), ValueBytes: []byte{0x13, 0x05, 0, 0}},
		},
	})
	if err != nil {
		t.Fatal(err)
	}
	messageBody, err := proto.Marshal(&cs2pb.CMsgSOSingleObject{TypeId: proto.Int32(1), ObjectData: offerBody})
	if err != nil {
		t.Fatal(err)
	}
	update, found, err := decodeCS2IncrementalInventory(GCMessage{AppID: 730, EMsg: protocol.EMsgSOCreate, Body: messageBody})
	if err != nil {
		t.Fatal(err)
	}
	if !found || len(update.Items) != 1 {
		t.Fatalf("found=%t update=%#v", found, update)
	}
	if got := update.Items[0].Attributes[316]; got != 1299 {
		t.Fatalf("purchase price=%d want=1299", got)
	}
	if got := uint64(update.Items[0].Attributes[272]) | uint64(update.Items[0].Attributes[273])<<32; got != 0x0123456789abcdef {
		t.Fatalf("casket id=%x want=123456789abcdef", got)
	}
	if got := update.Items[0].AttributeBytes[316]; len(got) != 4 || got[0] != 0x13 {
		t.Fatalf("raw purchase-price bytes=%x", got)
	}
}

func TestMergeInventoryItemMapAddsVolatileOfferAndUpdatesTerminal(t *testing.T) {
	items := []GCInventoryItem{{ID: 10, DefIndex: 5176, Quantity: 1}}
	additional := map[uint64]GCInventoryItem{
		10: {ID: 10, DefIndex: 5176, Quantity: 0, Quality: 14},
		20: {ID: 20, DefIndex: 8, Attributes: map[uint32]uint32{316: 1299}},
	}
	merged := mergeInventoryItemMap(items, additional)
	if len(merged) != 2 || merged[0].Quantity != 0 || merged[0].Quality != 14 || merged[1].ID != 20 {
		t.Fatalf("merged=%#v", merged)
	}
}

func TestDecodeCS2IncrementalInventoryRetainsDedicatedVolatileOfferSO(t *testing.T) {
	offerBody, err := proto.Marshal(&cs2pb.CSOVolatileItemOffer{
		Defidx:         proto.Uint32(5176),
		FauxItemid:     []uint64{0xf000000003e70007},
		GenerationTime: []uint32{1784820000},
	})
	if err != nil {
		t.Fatal(err)
	}
	messageBody, err := proto.Marshal(&cs2pb.CMsgSOSingleObject{TypeId: proto.Int32(cs2VolatileItemOfferSOTypeID), ObjectData: offerBody})
	if err != nil {
		t.Fatal(err)
	}
	update, found, err := decodeCS2IncrementalInventory(GCMessage{AppID: 730, EMsg: protocol.EMsgSOUpdate, Body: messageBody})
	if err != nil {
		t.Fatal(err)
	}
	offers := update.VolatileOffers[5176]
	if !found || len(offers) != 1 || offers[0].FauxItemID != 0xf000000003e70007 || offers[0].GenerationTime != 1784820000 {
		t.Fatalf("found=%t update=%#v", found, update)
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

func TestDecodeGenericSubscribedInventoryUsesOnlyAuthoritativeEconType(t *testing.T) {
	fixtureHex, err := os.ReadFile("testdata/multigame_socache.hex")
	if err != nil {
		t.Fatal(err)
	}
	cache, err := hex.DecodeString(strings.TrimSpace(string(fixtureHex)))
	if err != nil {
		t.Fatal(err)
	}
	items, found, err := decodeGenericSubscribedInventory(570, cache)
	if err != nil {
		t.Fatal(err)
	}
	if !found || len(items) != 3 || items[0].ID != 99 || items[0].DefIndex != 5021 || items[0].Level != 10 || items[0].Style != 3 {
		t.Fatalf("generic inventory = %#v found=%t", items, found)
	}
	if got := items[1].AttributeBytes[204]; len(got) != 5 || got[4] != 5 {
		t.Fatalf("binary attribute was not preserved: %#v", got)
	}
	if len(items[1].EquippedStates) != 1 || items[1].EquippedStates[0].Class != 2 || items[1].EquippedStates[0].Slot != 7 {
		t.Fatalf("equipped states were not preserved: %#v", items[1].EquippedStates)
	}
	if items[2].InteriorItemID != 123456 {
		t.Fatalf("interior item ID=%d", items[2].InteriorItemID)
	}
}

func TestDotaOmittedFieldsUseAuthoritativeProtoDefaults(t *testing.T) {
	item, err := proto.Marshal(&multigamepb.CSOEconItem{Id: proto.Uint64(7), Attribute: []*multigamepb.CSOEconItemAttribute{{Value: proto.Uint32(9)}}})
	if err != nil {
		t.Fatal(err)
	}
	items, found, err := decodeGenericSubscribedTypes(570, []*multigamepb.CMsgSOCacheSubscribed_SubscribedType{{TypeId: proto.Int32(1), ObjectData: [][]byte{item}}})
	if err != nil || !found || len(items) != 1 {
		t.Fatalf("items=%#v found=%t err=%v", items, found, err)
	}
	if items[0].Quantity != 1 || items[0].Level != 1 || items[0].Quality != 4 || items[0].Attributes[65535] != 9 {
		t.Fatalf("Dota defaults were not applied: %#v", items[0])
	}
}

func TestTF2WelcomeCountryIsNotDecodedAsDotaSOCache(t *testing.T) {
	// TF2 CMsgClientWelcome field 3 is the transaction country string.
	body := []byte{0x1a, 0x02, 'A', 'U'}
	items, found, err := decodeGameWelcomeInventory(440, body)
	if err != nil || found || len(items) != 0 {
		t.Fatalf("TF2 welcome decoded as inventory: items=%#v found=%t err=%v", items, found, err)
	}
}

func TestTF2SOCacheSubscriptionCheckBuildsAuthoritativeRefresh(t *testing.T) {
	checkBody, err := proto.Marshal(&multigamepb.CMsgSOCacheSubscriptionCheck{
		Owner:     proto.Uint64(76561198813914865),
		Version:   proto.Uint64(1),
		OwnerSoid: &multigamepb.CMsgSOIDOwner{Type: proto.Uint32(1), Id: proto.Uint64(1234)},
	})
	if err != nil {
		t.Fatal(err)
	}
	refreshBody, err := gameSOCacheSubscriptionRefresh(checkBody)
	if err != nil {
		t.Fatal(err)
	}
	var refresh multigamepb.CMsgSOCacheSubscriptionRefresh
	if err := proto.Unmarshal(refreshBody, &refresh); err != nil {
		t.Fatal(err)
	}
	if refresh.GetOwner() != 76561198813914865 || refresh.GetOwnerSoid().GetType() != 1 || refresh.GetOwnerSoid().GetId() != 1234 {
		t.Fatalf("SOCache refresh=%#v", refresh)
	}
}

func TestDotaWelcomeUpToDateSOCacheBuildsRefresh(t *testing.T) {
	welcomeBody, err := proto.Marshal(&multigamepb.CMsgClientWelcome{
		UptodateSubscribedCaches: []*multigamepb.CMsgSOCacheSubscriptionCheck{{
			Version:   proto.Uint64(9),
			OwnerSoid: &multigamepb.CMsgSOIDOwner{Type: proto.Uint32(1), Id: proto.Uint64(7656119)},
		}},
	})
	if err != nil {
		t.Fatal(err)
	}
	refreshBodies, err := dotaWelcomeSOCacheRefreshes(welcomeBody)
	if err != nil || len(refreshBodies) != 1 {
		t.Fatalf("refreshes=%d err=%v", len(refreshBodies), err)
	}
	var refresh multigamepb.CMsgSOCacheSubscriptionRefresh
	if err := proto.Unmarshal(refreshBodies[0], &refresh); err != nil {
		t.Fatal(err)
	}
	if refresh.Owner != nil || refresh.GetOwnerSoid().GetType() != 1 || refresh.GetOwnerSoid().GetId() != 7656119 {
		t.Fatalf("Dota SOCache refresh=%#v", refresh)
	}
}

func TestDotaWelcomeOutOfDateInventoryDoesNotRequestRedundantRefresh(t *testing.T) {
	itemBody, err := proto.Marshal(&multigamepb.CSOEconItem{Id: proto.Uint64(42), DefIndex: proto.Uint32(7)})
	if err != nil {
		t.Fatal(err)
	}
	welcomeBody, err := proto.Marshal(&multigamepb.CMsgClientWelcome{OutofdateSubscribedCaches: []*multigamepb.CMsgSOCacheSubscribed{{Objects: []*multigamepb.CMsgSOCacheSubscribed_SubscribedType{{TypeId: proto.Int32(1), ObjectData: [][]byte{itemBody}}}}}})
	if err != nil {
		t.Fatal(err)
	}
	items, found, err := decodeGameWelcomeInventory(570, welcomeBody)
	if err != nil || !found || len(items) != 1 || items[0].ID != 42 {
		t.Fatalf("items=%#v found=%t err=%v", items, found, err)
	}
	refreshes, err := dotaWelcomeSOCacheRefreshes(welcomeBody)
	if err != nil || len(refreshes) != 0 {
		t.Fatalf("unexpected refreshes=%d err=%v", len(refreshes), err)
	}
}

func TestGameClientHelloUsesPinnedVersionsAndDotaSource2(t *testing.T) {
	tf2Body, err := gameClientHello(440)
	if err != nil {
		t.Fatal(err)
	}
	var tf2 multigamepb.CMsgClientHello
	if err := proto.Unmarshal(tf2Body, &tf2); err != nil || tf2.GetVersion() != 10815139 || tf2.Engine != nil {
		t.Fatalf("TF2 hello=%#v err=%v", tf2, err)
	}
	dotaBody, err := gameClientHello(570)
	if err != nil {
		t.Fatal(err)
	}
	var dota multigamepb.CMsgClientHello
	if err := proto.Unmarshal(dotaBody, &dota); err != nil || dota.GetVersion() != 6859 || dota.GetEngine() != 1 {
		t.Fatalf("Dota hello=%#v err=%v", dota, err)
	}
}

func TestCS2ClientHelloUsesPinnedGameTrackingVersion(t *testing.T) {
	body, err := cs2ClientHello()
	if err != nil {
		t.Fatal(err)
	}
	var hello cs2pb.CMsgClientHello
	if err := proto.Unmarshal(body, &hello); err != nil {
		t.Fatal(err)
	}
	if hello.GetVersion() != cs2ClientVersion || hello.GetVersion() != 2000877 {
		t.Fatalf("CS2 ClientHello version = %d, want pinned steam.inf version %d", hello.GetVersion(), cs2ClientVersion)
	}
}
