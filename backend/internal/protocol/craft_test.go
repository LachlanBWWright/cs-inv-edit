package protocol

import (
	"bytes"
	"encoding/binary"
	"testing"
)

func TestEncodeCraftRequest(t *testing.T) {
	ids := make([]uint64, 10)
	for i := range ids {
		ids[i] = uint64(i + 1)
	}
	buf, err := EncodeCraftRequest(1, ids)
	if err != nil {
		t.Fatalf("encode: %v", err)
	}
	if len(buf) != 4+8*len(ids) {
		t.Fatalf("unexpected length: %d", len(buf))
	}
	if got := binary.LittleEndian.Uint16(buf[0:2]); got != 1 {
		t.Fatalf("recipe mismatch: %d", got)
	}
	if got := binary.LittleEndian.Uint16(buf[2:4]); got != 10 {
		t.Fatalf("count mismatch: %d", got)
	}
}

func TestDecodeCraftResponse(t *testing.T) {
	buf := make([]byte, 24)
	binary.LittleEndian.PutUint16(buf[0:2], 3)
	binary.LittleEndian.PutUint16(buf[6:8], 2)
	binary.LittleEndian.PutUint64(buf[8:16], 99)
	binary.LittleEndian.PutUint64(buf[16:24], 100)
	resp, err := DecodeCraftResponse(buf)
	if err != nil {
		t.Fatalf("decode: %v", err)
	}
	if resp.Recipe != 3 {
		t.Fatalf("recipe mismatch: %d", resp.Recipe)
	}
	if len(resp.Gained) != 2 || resp.Gained[0] != 99 || resp.Gained[1] != 100 {
		t.Fatalf("unexpected response: %#v", resp.Gained)
	}
}

func TestEncodeCraftRequestRejectsWrongLength(t *testing.T) {
	_, err := EncodeCraftRequest(1, []uint64{1, 2})
	if err == nil || !bytes.Contains([]byte(err.Error()), []byte("exactly 10")) {
		t.Fatalf("expected length error, got %v", err)
	}
}
