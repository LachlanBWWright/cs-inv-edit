package protocol

import (
	"bytes"
	"testing"
)

func TestEncodeCraftRequest(t *testing.T) {
	encoded, err := EncodeCraftRequest(7, []uint64{1, 2, 3, 4, 5, 6, 7, 8, 9, 10})
	if err != nil {
		t.Fatalf("encode failed: %v", err)
	}
	if len(encoded) != 84 {
		t.Fatalf("unexpected length: %d", len(encoded))
	}
	if !bytes.Equal(encoded[0:2], []byte{0x07, 0x00}) {
		t.Fatalf("recipe bytes mismatch")
	}
}

func TestEncodeCraftRequestRejectsInvalidCount(t *testing.T) {
	_, err := EncodeCraftRequest(7, []uint64{1, 2, 3})
	if err == nil {
		t.Fatal("expected error")
	}
}

func TestDecodeCraftResponse(t *testing.T) {
	body := []byte{0x07, 0x00, 0x01, 0x00, 0x00, 0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00}
	response, err := DecodeCraftResponse(body)
	if err != nil {
		t.Fatalf("decode failed: %v", err)
	}
	if response.Recipe != 7 {
		t.Fatalf("recipe mismatch: %d", response.Recipe)
	}
	if len(response.GainedItemIDs) != 1 || response.GainedItemIDs[0] != 1 {
		t.Fatalf("gained item mismatch: %#v", response.GainedItemIDs)
	}
}
