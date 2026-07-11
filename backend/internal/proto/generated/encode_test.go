package cs2pb

import (
	"bytes"
	"testing"
)

func TestEncodeCasketItem(t *testing.T) {
	encoded, err := EncodeCasketItem(11, 22)
	if err != nil {
		t.Fatalf("encode failed: %v", err)
	}
	expected := []byte{0x08, 0x0b, 0x10, 0x16}
	if !bytes.Equal(encoded, expected) {
		t.Fatalf("unexpected protobuf bytes: %x", encoded)
	}
}

func TestEncodeLoadCasketContentsUsesCasketIDForBothFields(t *testing.T) {
	encoded, err := EncodeLoadCasketContents(11)
	if err != nil {
		t.Fatalf("encode failed: %v", err)
	}
	expected := []byte{0x08, 0x0b, 0x10, 0x0b}
	if !bytes.Equal(encoded, expected) {
		t.Fatalf("unexpected protobuf bytes: %x", encoded)
	}
}

func TestEncodeSetItemName(t *testing.T) {
	encoded, err := EncodeSetItemName(SetItemNameInput{SubjectItemID: 11, ToolItemID: 22, Name: "AK-47"})
	if err != nil {
		t.Fatalf("encode failed: %v", err)
	}
	expected := []byte{0x08, 0x0b, 0x10, 0x16, 0x1a, 0x05, 0x41, 0x4b, 0x2d, 0x34, 0x37}
	if !bytes.Equal(encoded, expected) {
		t.Fatalf("unexpected protobuf bytes: %x", encoded)
	}
}

func TestEncodeDeleteItem(t *testing.T) {
	encoded, err := EncodeDeleteItem(DeleteItemInput{ItemID: 99})
	if err != nil {
		t.Fatalf("encode failed: %v", err)
	}
	expected := []byte{0x08, 0x63}
	if !bytes.Equal(encoded, expected) {
		t.Fatalf("unexpected protobuf bytes: %x", encoded)
	}
}

func TestEncodeUseMultipleItems(t *testing.T) {
	encoded, err := EncodeUseMultipleItems(UseMultipleItemsInput{ItemIDs: []uint64{1, 2}})
	if err != nil {
		t.Fatalf("encode failed: %v", err)
	}
	expected := []byte{0x08, 0x01, 0x08, 0x02}
	if !bytes.Equal(encoded, expected) {
		t.Fatalf("unexpected protobuf bytes: %x", encoded)
	}
}

func TestEncodeUseMultipleItemsRejectsEmpty(t *testing.T) {
	if _, err := EncodeUseMultipleItems(UseMultipleItemsInput{}); err == nil {
		t.Fatal("expected error")
	}
}
