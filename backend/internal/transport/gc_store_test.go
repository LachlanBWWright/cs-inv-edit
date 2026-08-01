package transport

import (
	"bytes"
	"encoding/binary"
	"encoding/hex"
	"net/url"
	"strings"
	"testing"

	"cs-inv-edit/backend/internal/proto/gametracking"
	"github.com/Lucino772/envelop/pkg/steam/steampb"
	"google.golang.org/protobuf/proto"
)

func TestNameTagPurchasePayloadMatchesGameTrackingWireLayout(t *testing.T) {
	body, err := gametracking.MarshalStorePurchaseInit(gametracking.StorePurchaseRequest{
		Country: "", Language: 0, Currency: 2,
		Lines: []gametracking.StorePurchaseLine{{ItemDefID: 1200, Quantity: 1, Cost: 175, SupplementalData: 0}},
	})
	if err != nil {
		t.Fatalf("marshal purchase: %v", err)
	}
	// base_gcmessages.proto:
	// country=1 and language=2 are absent at their client-default values;
	// currency=3, line_items=4; within the line item:
	// item_def_id=1, quantity=2, cost_in_local_currency=3,
	// purchase_type=4 (absent), supplemental_data=5 (present with zero).
	want, _ := hex.DecodeString("1802220a08b009100118af012800")
	if !bytes.Equal(body, want) {
		t.Fatalf("Name Tag purchase wire bytes = %x, want %x", body, want)
	}
	envelope, err := encodeGCProtoPayload(emsgStorePurchaseInit, body)
	if err != nil {
		t.Fatalf("encode GC envelope: %v", err)
	}
	if got := binary.LittleEndian.Uint32(envelope[4:8]); got != 0 {
		t.Fatalf("GC protobuf header length = %d, want SteamKit-equivalent empty header", got)
	}
	if !bytes.Equal(envelope[8:], want) {
		t.Fatalf("GC envelope body = %x, want %x", envelope[8:], want)
	}
}

func TestStorePurchaseEnvelopeCarriesSourceJobID(t *testing.T) {
	const sourceJobID uint64 = 421800430678694512
	envelope, err := encodeGCProtoPayloadWithSourceJob(emsgStorePurchaseInit, []byte{8, 1}, sourceJobID)
	if err != nil {
		t.Fatal(err)
	}
	headerLen := int(binary.LittleEndian.Uint32(envelope[4:8]))
	var header steampb.CMsgProtoBufHeader
	if err := proto.Unmarshal(envelope[8:8+headerLen], &header); err != nil {
		t.Fatal(err)
	}
	if header.GetJobidSource() != sourceJobID {
		t.Fatalf("source job ID = %d, want %d", header.GetJobidSource(), sourceJobID)
	}
}

func TestStorePurchaseResultUsesCS2PurchaseEnum(t *testing.T) {
	tests := map[int32]string{
		2:   "Fail",
		8:   "WrongCurrency",
		10:  "InvalidItem",
		150: "OldPriceSheet",
		200: "PurchaseExpiredItemsUnavailable",
	}
	for result, expected := range tests {
		rejected := StorePurchaseRejectedError{Result: result}
		if actual := rejected.Code(); actual != expected {
			t.Fatalf("purchase result %d decoded as %q, want %q", result, actual, expected)
		}
	}
}

func TestSteamWalletCurrencyConvertsToGCEconomyCurrency(t *testing.T) {
	tests := map[int32]int32{1: 0, 2: 1, 3: 2, 6: 23, 7: 4, 21: 21}
	for walletCurrency, expected := range tests {
		actual, err := steamWalletCurrencyToEconomyCurrency(walletCurrency)
		if err != nil || actual != expected {
			t.Fatalf("wallet currency %d = %d, %v; want %d", walletCurrency, actual, err, expected)
		}
	}
	if _, err := steamWalletCurrencyToEconomyCurrency(0); err == nil {
		t.Fatal("invalid Steam wallet currency was accepted")
	}
}

func TestValidateSteamCheckoutURL(t *testing.T) {
	valid := []string{"https://checkout.steampowered.com/checkout/approvetxn/123/"}
	for _, candidate := range valid {
		if err := ValidateSteamCheckoutURL(candidate); err != nil {
			t.Errorf("expected %q valid: %v", candidate, err)
		}
	}
	invalid := []string{"http://checkout.steampowered.com/checkout/approvetxn/123/", "https://store.steampowered.com/buyitem/730/1200", "https://steamcommunity.com/checkout", "https://steampowered.com.example.test/checkout/approvetxn/123/", "https://user:pass@checkout.steampowered.com/checkout/approvetxn/123/", "javascript:alert(1)", "https://127.0.0.1/checkout/approvetxn/123/"}
	for _, candidate := range invalid {
		if err := ValidateSteamCheckoutURL(candidate); err == nil {
			t.Errorf("expected %q invalid", candidate)
		}
	}
}

func TestConventionalCS2StoreCheckoutRejectsBuyItemFallback(t *testing.T) {
	// Keys and other native CS2 price-sheet offers must remain on the
	// GC-order -> ClientMicroTxnAuthRequest -> approvetxn path.
	buyItem := "https://store.steampowered.com/buyitem/730/1203/1"
	if err := ValidateSteamCheckoutURL(buyItem); err == nil {
		t.Fatalf("native CS2 checkout accepted forbidden BuyItem fallback %q", buyItem)
	}
}

func TestStoreMessageIDsMatchGameTracking(t *testing.T) {
	if emsgStoreGetUserData != 2500 || emsgStoreGetUserDataResponse != 2501 || emsgStorePurchaseInit != 2510 || emsgStorePurchaseInitResponse != 2511 {
		t.Fatal("store EMsg constants drifted from vendored GameTracking definitions")
	}
}

func TestTF2StoreFinalizeMessageIDsMatchGameTracking(t *testing.T) {
	request, response := storeFinalizeMessageIDs(440)
	if request != 2512 || response != 2513 {
		t.Fatalf("TF2 store finalize IDs = %d/%d, want 2512/2513", request, response)
	}
}

func TestSteamCheckoutURLUsesAuthorizationTransactionIDs(t *testing.T) {
	const transID uint64 = 421800430678694512
	const orderID uint64 = 2628343585
	checkout := steamCheckoutURL(transID, orderID)
	if err := ValidateSteamCheckoutURL(checkout); err != nil {
		t.Fatalf("generated checkout URL was invalid: %v", err)
	}
	parsed, err := url.Parse(checkout)
	if err != nil {
		t.Fatalf("parse generated checkout URL: %v", err)
	}
	if parsed.Hostname() != "checkout.steampowered.com" || !strings.Contains(parsed.Path, "/approvetxn/421800430678694512/") {
		t.Fatalf("checkout URL did not contain the authorization transaction: %q", checkout)
	}
	returnURL := parsed.Query().Get("returnurl")
	if !strings.Contains(returnURL, "/buyitem/730/finalize/2628343585") {
		t.Fatalf("return URL does not finalize GC order: %q", returnURL)
	}
}

func TestMicroTxnAuthorizationPreservesNestedLineItem(t *testing.T) {
	var raw bytes.Buffer
	raw.WriteByte(1)
	writeBinaryKVUint64(&raw, "orderid", 2628343585)
	writeBinaryKVUint64(&raw, "transid", 421800430678694512)
	writeBinaryKVObjectStart(&raw, "lineitems")
	writeBinaryKVObjectStart(&raw, "0")
	writeBinaryKVUint64(&raw, "gameitemid", 1200)
	writeBinaryKVUint64(&raw, "amount", 280)
	writeBinaryKVUint32(&raw, "quantity", 1)
	raw.Write([]byte{8, 8, 8})

	auth, err := parseMicroTxnAuthorization(raw.Bytes())
	if err != nil {
		t.Fatal(err)
	}
	lineItem, ok := authorizationLineItem(auth)
	if !ok {
		t.Fatalf("nested line item missing from %#v", auth)
	}
	if itemID, _ := kvUint64(lineItem, "gameitemid"); itemID != 1200 {
		t.Fatalf("line item = %#v", lineItem)
	}
}

func writeBinaryKVUint64(out *bytes.Buffer, key string, value uint64) {
	out.WriteByte(7)
	out.WriteString(key)
	out.WriteByte(0)
	_ = binary.Write(out, binary.LittleEndian, value)
}

func writeBinaryKVUint32(out *bytes.Buffer, key string, value uint32) {
	out.WriteByte(2)
	out.WriteString(key)
	out.WriteByte(0)
	_ = binary.Write(out, binary.LittleEndian, value)
}
