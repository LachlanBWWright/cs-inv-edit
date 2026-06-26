package proto

import "testing"

func TestEncodeCasketItem(t *testing.T) {
	body, err := EncodeCasketItem(11, 22)
	if err != nil {
		t.Fatalf("encode: %v", err)
	}
	if len(body) == 0 {
		t.Fatal("expected bytes")
	}
}

func TestEncodeApplySticker(t *testing.T) {
	body, err := EncodeApplySticker(ApplyStickerInput{StickerItemID: 1, ItemItemID: 2, StickerSlot: 3})
	if err != nil {
		t.Fatalf("encode: %v", err)
	}
	if len(body) == 0 {
		t.Fatal("expected sticker bytes")
	}
}
