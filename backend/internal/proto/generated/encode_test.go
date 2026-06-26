package cs2pb

import (
	"testing"
)

func TestEncodeCasketItem(t *testing.T) {
	encoded, err := EncodeCasketItem(11, 22)
	if err != nil {
		t.Fatalf("encode failed: %v", err)
	}
	if len(encoded) != 16 {
		t.Fatalf("unexpected length: %d", len(encoded))
	}
}

func TestEncodeApplySticker(t *testing.T) {
	_, err := EncodeApplySticker(ApplyStickerInput{StickerItemID: 1, ItemItemID: 2, StickerSlot: 3})
	if err != nil {
		t.Fatalf("encode failed: %v", err)
	}
}
