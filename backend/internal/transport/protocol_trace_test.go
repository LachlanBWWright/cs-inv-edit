package transport

import "testing"

func TestProtocolMessageNameDoesNotMisidentifyUnlockCrateResponse(t *testing.T) {
	const unlockCrateResponseEMsg = 1008

	if got := protocolMessageName(730, unlockCrateResponseEMsg); got != "GCUnlockCrateResponse" {
		t.Fatalf("protocolMessageName(730, %d) = %q; want GCUnlockCrateResponse", unlockCrateResponseEMsg, got)
	}
}

func TestDecodeRawProtoWireFormatAcceptsEmptyPayload(t *testing.T) {
	decoded, ok := decodeRawProtoWireFormat(nil)
	if !ok || decoded == nil || len(decoded) != 0 {
		t.Fatalf("decodeRawProtoWireFormat(nil) = %#v, %v; want empty decoded object, true", decoded, ok)
	}
}
