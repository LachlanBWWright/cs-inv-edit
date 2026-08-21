package transport

import (
	"testing"

	"cs-inv-edit/backend/internal/proto/gametracking"
	"cs-inv-edit/backend/internal/protocol"
)

func marshalArmoryTest(t *testing.T, name string, fields map[string]any) []byte {
	t.Helper()
	body, err := gametracking.MarshalMessage(name, fields)
	if err != nil {
		t.Fatal(err)
	}
	return body
}

func xpShopTest(t *testing.T, generation, balance uint32, tracks ...uint32) []byte {
	values := make([]any, len(tracks))
	for index, track := range tracks {
		values[index] = track
	}
	return marshalArmoryTest(t, "CSOAccountXpShop", map[string]any{"generation_time": generation, "redeemable_balance": balance, "xp_tracks": values})
}

func welcomeArmoryTest(t *testing.T, objects ...map[string]any) []byte {
	values := make([]any, len(objects))
	for index, object := range objects {
		values[index] = object
	}
	return marshalArmoryTest(t, "CMsgClientWelcome", map[string]any{"outofdate_subscribed_caches": []any{map[string]any{"objects": values}}})
}

func TestDecodeArmoryFromXpShopCacheTypeSix(t *testing.T) {
	xpShop := xpShopTest(t, 1_723_456_789, 17, 100, 200)
	body := welcomeArmoryTest(t, map[string]any{"type_id": int32(6), "object_data": []any{xpShop}})
	state, err := decodeArmoryFromClientWelcome(body)
	if err != nil {
		t.Fatal(err)
	}
	if state.Balance != 17 || state.GenerationTime != 1_723_456_789 || len(state.ItemIDs) != 0 || len(state.Offers) != 0 {
		t.Fatalf("unexpected XP Shop state: %#v", state)
	}
}

func TestDecodeArmoryPrefersObservedXpShopTypeOverAmbiguousCandidate(t *testing.T) {
	xpShop := xpShopTest(t, 1_723_456_789, 17)
	unrelated := xpShopTest(t, 9, 3)
	body := welcomeArmoryTest(t,
		map[string]any{"type_id": int32(15), "object_data": []any{unrelated}},
		map[string]any{"type_id": observedXpShopTypeID, "object_data": []any{xpShop}},
	)

	state, err := decodeArmoryFromClientWelcome(body)
	if err != nil || state.XpShopTypeID != observedXpShopTypeID || state.GenerationTime != 1_723_456_789 || state.Balance != 17 {
		t.Fatalf("observed XP Shop type was not preferred: state=%#v err=%v", state, err)
	}
}

func TestDecodeArmoryIgnoresAmbiguousCandidateAfterObservedXpShopType(t *testing.T) {
	xpShop := xpShopTest(t, 1_723_456_789, 17)
	unrelated := xpShopTest(t, 9, 3)
	body := welcomeArmoryTest(t,
		map[string]any{"type_id": observedXpShopTypeID, "object_data": []any{xpShop}},
		map[string]any{"type_id": int32(15), "object_data": []any{unrelated}},
	)

	state, err := decodeArmoryFromClientWelcome(body)
	if err != nil || state.XpShopTypeID != observedXpShopTypeID || state.GenerationTime != 1_723_456_789 || state.Balance != 17 {
		t.Fatalf("ambiguous candidate replaced observed XP Shop type: state=%#v err=%v", state, err)
	}
}

func TestDecodeArmoryTreatsOriginalFieldThreeAsXpTracks(t *testing.T) {
	// This is the reported wire shape: generation_time=1, balance=0 and one
	// xp_tracks value. Generation time is an opaque uint32, not a Unix timestamp.
	unrelated := marshalArmoryTest(t, "CSOAccountItemPersonalStore", map[string]any{"generation_time": uint32(1), "items": []any{uint64(1)}})
	body := welcomeArmoryTest(t, map[string]any{"type_id": int32(41), "object_data": []any{unrelated}})
	state, err := decodeArmoryFromClientWelcome(body)
	if err != nil || state.GenerationTime != 1 || state.Balance != 0 || len(state.ItemIDs) != 0 || state.XpShopTypeID != 41 {
		t.Fatalf("reported XP Shop shape was not decoded correctly: state=%#v err=%v", state, err)
	}
}

func TestXpShopCandidateRejectsPersonalStoreUint64Item(t *testing.T) {
	personalStore := marshalArmoryTest(t, "CSOAccountItemPersonalStore", map[string]any{"generation_time": uint32(1_723_456_789), "redeemable_balance": uint32(4), "items": []any{uint64(7_000_000_000)}})
	if _, valid, reason := decodeXpShopCandidate(personalStore); valid {
		t.Fatalf("personal store uint64 item accepted as XP Shop: %s", reason)
	}
}

func TestXpShopCandidateRejectsUnknownFields(t *testing.T) {
	bid := marshalArmoryTest(t, "CSOAccountXpShopBids", map[string]any{"campaign_id": uint32(1_723_456_789), "redeem_id": uint32(2), "expected_cost": uint32(4), "generation_time": uint32(1)})
	if _, valid, reason := decodeXpShopCandidate(bid); valid {
		t.Fatalf("bid with field 4 accepted as XP Shop: %s", reason)
	}
}

func TestDecodeArmoryFromPostWelcomeCacheSubscribed(t *testing.T) {
	xpShop := xpShopTest(t, 1_723_456_791, 12)
	subscribed := marshalArmoryTest(t, "CMsgSOCacheSubscribed", map[string]any{"objects": []any{map[string]any{"type_id": int32(6), "object_data": []any{xpShop}}}})
	state := GCArmorySnapshot{XpShopTypeID: 6}
	matched, err := decodeArmorySOMessage(&state, GCMessage{AppID: 730, EMsg: protocol.EMsgSOCacheSubscribed, Body: subscribed})
	if err != nil || !matched || state.GenerationTime != 1_723_456_791 || state.Balance != 12 {
		t.Fatalf("post-Welcome XpShop subscription not decoded: state=%#v matched=%v err=%v", state, matched, err)
	}
}

func TestDecodeArmoryIncrementalXpShopUpdate(t *testing.T) {
	xpShop := xpShopTest(t, 1_723_456_790, 9)
	body := marshalArmoryTest(t, "CMsgSOSingleObject", map[string]any{"type_id": int32(6), "object_data": xpShop, "version": uint64(7)})
	state := GCArmorySnapshot{XpShopTypeID: 6}
	matched, err := decodeArmorySOMessage(&state, GCMessage{AppID: 730, EMsg: protocol.EMsgSOUpdate, Body: body})
	if err != nil || !matched || state.Balance != 9 {
		t.Fatalf("incremental XP Shop update was not decoded: state=%#v matched=%v err=%v", state, matched, err)
	}
}

func TestDecodeArmoryIgnoresXpShopBidCache(t *testing.T) {
	bid := marshalArmoryTest(t, "CSOAccountXpShopBids", map[string]any{"campaign_id": uint32(11), "redeem_id": uint32(2), "expected_cost": uint32(4)})
	body := marshalArmoryTest(t, "CMsgSOSingleObject", map[string]any{"type_id": int32(42), "object_data": bid})
	state := GCArmorySnapshot{}
	matched, err := decodeArmorySOMessage(&state, GCMessage{AppID: 730, EMsg: protocol.EMsgSOUpdate, Body: body})
	if err != nil || matched || len(state.Offers) != 0 {
		t.Fatalf("bid cache must not become the universal catalogue: state=%#v matched=%v err=%v", state, matched, err)
	}
}
