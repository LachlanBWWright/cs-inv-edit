package transport

import (
	"encoding/hex"
	"os"
	"reflect"
	"strings"
	"testing"

	"cs-inv-edit/backend/internal/proto/dota2tracking"
	cs2pb "cs-inv-edit/backend/internal/proto/gametracking"
	"cs-inv-edit/backend/internal/proto/tf2tracking"
	"cs-inv-edit/backend/internal/proto/tracking"
	"cs-inv-edit/backend/internal/protocol"
)

func mustCS2TestMessage(t *testing.T, name string, fields map[string]any) []byte {
	t.Helper()
	body, err := cs2pb.MarshalMessage(name, fields)
	if err != nil {
		t.Fatal(err)
	}
	return body
}

func TestMergeGamesPlayedPreservesAllGameCoordinatorPresence(t *testing.T) {
	got := mergeGamesPlayed([]uint32{730, 440}, []uint32{730, 570, 440})
	want := []uint32{730, 440, 570}
	if !reflect.DeepEqual(got, want) {
		t.Fatalf("mergeGamesPlayed() = %v, want %v", got, want)
	}
}

func TestDecodeInventoryIgnoresNonEconSOCacheTypes(t *testing.T) {
	foreign := mustCS2TestMessage(t, "CSOAccountItemPersonalStore", map[string]any{"generation_time": uint32(4001), "items": []any{uint64(36)}})
	econ := mustCS2TestMessage(t, "CSOEconItem", map[string]any{"id": uint64(1234), "def_index": uint32(7), "inventory": uint32(1), "quantity": uint32(1)})
	body := mustCS2TestMessage(t, "CMsgClientWelcome", map[string]any{"outofdate_subscribed_caches": []any{map[string]any{"objects": []any{
		map[string]any{"type_id": int32(41), "object_data": []any{foreign}},
		map[string]any{"type_id": int32(1), "object_data": []any{econ}},
	}}}})
	items, err := decodeInventoryFromClientWelcome(body)
	if err != nil {
		t.Fatal(err)
	}
	if len(items) != 1 || items[0].ID != 1234 || items[0].DefIndex != 7 {
		t.Fatalf("decoded inventory = %#v", items)
	}
}

func TestDecodeCS2IncrementalInventoryRetainsTerminalOfferSOCreate(t *testing.T) {
	offerBody := mustCS2TestMessage(t, "CSOEconItem", map[string]any{"id": uint64(700), "def_index": uint32(8), "attribute": []any{
		map[string]any{"def_index": uint32(272), "value": uint32(0x89abcdef)},
		map[string]any{"def_index": uint32(273), "value": uint32(0x01234567)},
		map[string]any{"def_index": uint32(316), "value": uint32(1299), "value_bytes": []byte{0x13, 0x05, 0, 0}},
	}})
	messageBody := mustCS2TestMessage(t, "CMsgSOSingleObject", map[string]any{"type_id": int32(1), "object_data": offerBody})
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
	offerBody := mustCS2TestMessage(t, "CSOVolatileItemOffer", map[string]any{"defidx": uint32(5176), "faux_itemid": []any{uint64(0xf000000003e70007)}, "generation_time": []any{uint32(1784820000)}})
	messageBody := mustCS2TestMessage(t, "CMsgSOSingleObject", map[string]any{"type_id": cs2VolatileItemOfferSOTypeID, "object_data": offerBody})
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
	item := cs2pb.EconItem{Attributes: []cs2pb.EconAttribute{{DefIndex: 6, ValueBytes: []byte{0x00, 0x00, 0xc8, 0x42}}}}
	if got := econPaintKit(item); got != 100 {
		t.Fatalf("paint kit = %d", got)
	}
}

func TestEconPaintKitAcceptsNormalizedValue(t *testing.T) {
	item := cs2pb.EconItem{Attributes: []cs2pb.EconAttribute{{DefIndex: 6, Value: 100}}}
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
	item, err := dota2tracking.MarshalMessage("CSOEconItem", map[string]any{"id": uint64(7), "attribute": []any{map[string]any{"value": uint32(9)}}})
	if err != nil {
		t.Fatal(err)
	}
	cache, err := dota2tracking.MarshalMessage("CMsgSOCacheSubscribed", map[string]any{"objects": []any{map[string]any{"type_id": int32(1), "object_data": []any{item}}}})
	if err != nil {
		t.Fatal(err)
	}
	items, found, err := decodeGenericSubscribedInventory(570, cache)
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
	checkBody, err := tf2tracking.MarshalFields("CMsgSOCacheSubscriptionCheck", map[string]any{
		"owner": uint64(76561198813914865), "version": uint64(1),
		"owner_soid": map[string]any{"type": uint32(1), "id": uint64(1234)},
	})
	if err != nil {
		t.Fatal(err)
	}
	refreshBody, err := gameSOCacheSubscriptionRefresh(440, checkBody)
	if err != nil {
		t.Fatal(err)
	}
	refresh, err := tf2tracking.UnmarshalMessage("CMsgSOCacheSubscriptionRefresh", refreshBody)
	if err != nil {
		t.Fatal(err)
	}
	owner := refresh.Get(tracking.Field(refresh, "owner_soid")).Message()
	if tracking.Uint(refresh, "owner") != 76561198813914865 || tracking.Uint(owner, "type") != 1 || tracking.Uint(owner, "id") != 1234 {
		t.Fatalf("SOCache refresh=%#v", refresh)
	}
}

func TestDotaWelcomeUpToDateSOCacheBuildsRefresh(t *testing.T) {
	welcomeBody, err := dota2tracking.MarshalMessage("CMsgClientWelcome", map[string]any{"uptodate_subscribed_caches": []any{
		map[string]any{"version": uint64(9), "owner_soid": map[string]any{"type": uint32(1), "id": uint64(7656119)}},
	}})
	if err != nil {
		t.Fatal(err)
	}
	refreshBodies, err := dotaWelcomeSOCacheRefreshes(welcomeBody)
	if err != nil || len(refreshBodies) != 1 {
		t.Fatalf("refreshes=%d err=%v", len(refreshBodies), err)
	}
	refresh, err := dota2tracking.UnmarshalMessage("CMsgSOCacheSubscriptionRefresh", refreshBodies[0])
	if err != nil {
		t.Fatal(err)
	}
	ownerField := tracking.Field(refresh, "owner_soid")
	owner := refresh.Get(ownerField).Message()
	if tracking.Has(refresh, "owner") || tracking.Uint(owner, "type") != 1 || tracking.Uint(owner, "id") != 7656119 {
		t.Fatalf("Dota SOCache refresh=%#v", refresh)
	}
}

func TestDotaWelcomeOutOfDateInventoryDoesNotRequestRedundantRefresh(t *testing.T) {
	itemBody, err := dota2tracking.MarshalMessage("CSOEconItem", map[string]any{"id": uint64(42), "def_index": uint32(7)})
	if err != nil {
		t.Fatal(err)
	}
	welcomeBody, err := dota2tracking.MarshalMessage("CMsgClientWelcome", map[string]any{"outofdate_subscribed_caches": []any{
		map[string]any{"objects": []any{map[string]any{"type_id": int32(1), "object_data": []any{itemBody}}}},
	}})
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
	tf2, err := tf2tracking.UnmarshalMessage("CMsgClientHello", tf2Body)
	if err != nil || tracking.Uint(tf2, "version") != 10815139 || tracking.Has(tf2, "engine") {
		t.Fatalf("TF2 hello=%#v err=%v", tf2, err)
	}
	dotaBody, err := gameClientHello(570)
	if err != nil {
		t.Fatal(err)
	}
	dota, err := dota2tracking.UnmarshalMessage("CMsgClientHello", dotaBody)
	if err != nil || tracking.Uint(dota, "version") != 6859 || tracking.Uint(dota, "engine") != 1 {
		t.Fatalf("Dota hello=%#v err=%v", dota, err)
	}
}

func TestCS2ClientHelloUsesPinnedGameTrackingVersion(t *testing.T) {
	body, err := cs2ClientHello()
	if err != nil {
		t.Fatal(err)
	}
	hello, err := cs2pb.UnmarshalMessage("CMsgClientHello", body)
	if err != nil {
		t.Fatal(err)
	}
	version := uint32(tracking.Uint(hello, "version"))
	if version != cs2ClientVersion {
		t.Fatalf("CS2 ClientHello version = %d, want pinned steam.inf version %d", version, cs2ClientVersion)
	}
	if cs2ClientVersion != 2000877 {
		t.Fatalf("pinned CS2 client version changed to %d", cs2ClientVersion)
	}
}
