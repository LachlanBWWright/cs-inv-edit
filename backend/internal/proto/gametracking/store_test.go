package gametracking

import (
	"encoding/hex"
	"encoding/json"
	"testing"

	"google.golang.org/protobuf/proto"
)

func TestStoreDescriptorsComeFromGameTrackingSet(t *testing.T) {
	tests := map[string]uint32{
		"k_EMsgGCStoreGetUserData":          2500,
		"k_EMsgGCStoreGetUserDataResponse":  2501,
		"k_EMsgGCStorePurchaseInit":         2510,
		"k_EMsgGCStorePurchaseInitResponse": 2511,
	}
	for name, expected := range tests {
		actual, err := EnumValue("EGCItemMsg", name)
		if err != nil {
			t.Fatalf("resolve %s: %v", name, err)
		}
		if actual != expected {
			t.Fatalf("%s = %d, want %d", name, actual, expected)
		}
	}
	message, err := newMessage("CMsgStoreGetUserDataResponse")
	if err != nil {
		t.Fatal(err)
	}
	if number := message.Descriptor().Fields().ByName("price_sheet").Number(); number != 8 {
		t.Fatalf("price_sheet field = %d, want 8", number)
	}
}

func TestClientWelcomeStoreContextUsesGameTrackingDescriptor(t *testing.T) {
	message, err := newMessage("CMsgClientWelcome")
	if err != nil {
		t.Fatal(err)
	}
	setUint(message, "currency", 21)
	setString(message, "txn_country_code", "AU")
	body, err := proto.Marshal(message)
	if err != nil {
		t.Fatal(err)
	}
	context, err := UnmarshalClientWelcomeStoreContext(body)
	if err != nil {
		t.Fatal(err)
	}
	if context.Currency != 21 || context.Country != "AU" {
		t.Fatalf("welcome store context = %#v", context)
	}
}

func TestStoreDynamicMessagesRoundTrip(t *testing.T) {
	body, err := MarshalStorePurchaseInit(StorePurchaseRequest{Country: "AU", Language: 0, Currency: 21, Lines: []StorePurchaseLine{{ItemDefID: 1200, Quantity: 2, Cost: 305, PurchaseType: 3, PurchaseTypePresent: true, OmitSupplementalData: true}}})
	if err != nil {
		t.Fatal(err)
	}
	message, err := newMessage("CMsgGCStorePurchaseInit")
	if err != nil {
		t.Fatal(err)
	}
	if err := proto.Unmarshal(body, message); err != nil {
		t.Fatal(err)
	}
	if got := getString(message, "country"); got != "AU" {
		t.Fatalf("country = %q", got)
	}
	if got := getInt(message, "currency"); got != 21 {
		t.Fatalf("currency = %d", got)
	}
	line := message.Get(field(message, "line_items")).List().Get(0).Message()
	purchaseType := line.Descriptor().Fields().ByName("purchase_type")
	if !line.Has(purchaseType) || line.Get(purchaseType).Uint() != 3 {
		t.Fatal("price-sheet purchase_type must be explicitly present")
	}
	supplemental := line.Descriptor().Fields().ByName("supplemental_data")
	if line.Has(supplemental) {
		t.Fatal("ordinary store purchase must omit supplemental_data")
	}
}

func TestSupplementalStorePurchaseIncludesParenthesizedAssetID(t *testing.T) {
	body, err := MarshalStorePurchaseInit(StorePurchaseRequest{Country: "AU", Currency: 21, Lines: []StorePurchaseLine{{ItemDefID: 5176, Quantity: 1, Cost: 95, SupplementalData: 52994080407}}})
	if err != nil {
		t.Fatal(err)
	}
	message, err := newMessage("CMsgGCStorePurchaseInit")
	if err != nil {
		t.Fatal(err)
	}
	if err := proto.Unmarshal(body, message); err != nil {
		t.Fatal(err)
	}
	line := message.Get(field(message, "line_items")).List().Get(0).Message()
	supplemental := line.Descriptor().Fields().ByName("supplemental_data")
	if !line.Has(supplemental) || line.Get(supplemental).Uint() != 52994080407 {
		t.Fatal("supplemental store purchase must include its asset id")
	}
}

func TestMessageNameForEMsgClientHello(t *testing.T) {
	name, ok := MessageNameForEMsg(4006)
	if !ok || name != "CMsgClientHello" {
		t.Fatalf("MessageNameForEMsg(4006) = %q, %v; want CMsgClientHello, true", name, ok)
	}
}

func TestDecodeClientHelloTracePayload(t *testing.T) {
	body, err := hex.DecodeString("08eb8f7a180020004800")
	if err != nil {
		t.Fatal(err)
	}
	decoded, err := DecodeMessageJSON("CMsgClientHello", body)
	if err != nil {
		t.Fatal(err)
	}
	var fields map[string]any
	if err := json.Unmarshal(decoded, &fields); err != nil {
		t.Fatal(err)
	}
	if fields["version"] != float64(2000875) {
		t.Fatalf("decoded version = %#v; want 2000875", fields["version"])
	}
}
