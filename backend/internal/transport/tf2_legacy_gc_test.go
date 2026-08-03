package transport

import (
	"bytes"
	"encoding/binary"
	"image"
	"image/color"
	"image/png"
	"math"
	"testing"
)

func validTF2DecalPNG(t *testing.T) []byte {
	t.Helper()
	img := image.NewNRGBA(image.Rect(0, 0, tf2DecalImageSize, tf2DecalImageSize))
	for y := 0; y < tf2DecalImageSize; y++ {
		for x := 0; x < tf2DecalImageSize; x++ {
			img.SetNRGBA(x, y, color.NRGBA{R: uint8(x), G: uint8(y), B: 90, A: 255})
		}
	}
	var output bytes.Buffer
	if err := png.Encode(&output, img); err != nil {
		t.Fatal(err)
	}
	return output.Bytes()
}

func TestValidateTF2DecalPNG(t *testing.T) {
	valid := validTF2DecalPNG(t)
	if err := validateTF2DecalPNG(valid); err != nil {
		t.Fatalf("valid decal rejected: %v", err)
	}
	if err := validateTF2DecalPNG(append(append([]byte(nil), valid...), 1)); err == nil {
		t.Fatal("PNG with trailing data was accepted")
	}
	var wrongSize bytes.Buffer
	if err := png.Encode(&wrongSize, image.NewNRGBA(image.Rect(0, 0, 64, 128))); err != nil {
		t.Fatal(err)
	}
	if err := validateTF2DecalPNG(wrongSize.Bytes()); err == nil {
		t.Fatal("wrong-sized PNG was accepted")
	}
	if err := validateTF2DecalPNG(make([]byte, tf2DecalMaxPNGBytes)); err == nil {
		t.Fatal("oversized PNG was accepted")
	}
}

func TestEncodeTF2CustomizeItemTexture(t *testing.T) {
	payload, err := encodeTF2CustomizeItemTexture(7, 11, 13, 17)
	if err != nil {
		t.Fatal(err)
	}
	if len(payload) != 42 || binary.LittleEndian.Uint16(payload[0:2]) != 1 || binary.LittleEndian.Uint64(payload[2:10]) != math.MaxUint64 || binary.LittleEndian.Uint64(payload[10:18]) != 7 || binary.LittleEndian.Uint64(payload[18:26]) != 11 || binary.LittleEndian.Uint64(payload[26:34]) != 13 || binary.LittleEndian.Uint64(payload[34:42]) != 17 {
		t.Fatalf("unexpected legacy payload: %x", payload)
	}
}

func TestDecodeTF2CustomizeItemTextureResponse(t *testing.T) {
	payload := make([]byte, tf2DecalResponseSize)
	binary.LittleEndian.PutUint16(payload[0:2], 1)
	binary.LittleEndian.PutUint64(payload[2:10], 99)
	binary.LittleEndian.PutUint64(payload[10:18], math.MaxUint64)
	binary.LittleEndian.PutUint16(payload[18:20], uint16(3))
	binary.LittleEndian.PutUint32(payload[20:24], 1)
	response, err := decodeTF2CustomizeItemTextureResponse(payload, 99)
	if err != nil {
		t.Fatal(err)
	}
	if response.Index != 3 || response.Code != 1 {
		t.Fatalf("response = %#v", response)
	}
	if _, err := decodeTF2CustomizeItemTextureResponse(payload, 100); err == nil {
		t.Fatal("mismatched target job ID was accepted")
	}
	if _, err := decodeTF2CustomizeItemTextureResponse(payload[:23], 99); err == nil {
		t.Fatal("truncated response was accepted")
	}
}

func TestTF2DecalInventoryChanged(t *testing.T) {
	tool := GCInventoryItem{ID: 1, Quantity: 1}
	subject := GCInventoryItem{ID: 2, AttributeBytes: map[uint32][]byte{1: {1}}}
	after := []GCInventoryItem{{ID: 2, AttributeBytes: map[uint32][]byte{1: {2}}}}
	if !tf2DecalInventoryChanged(tool, subject, after) {
		t.Fatal("expected consumed tool and changed subject to confirm inventory")
	}
}
