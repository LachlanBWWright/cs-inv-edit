package operations

import "testing"

func TestNewReceipt(t *testing.T) {
	receipt := NewReceipt("storage.move-in")
	if receipt.Type != "storage.move-in" {
		t.Fatalf("unexpected type: %s", receipt.Type)
	}
	if receipt.State != "queued" {
		t.Fatalf("unexpected state: %s", receipt.State)
	}
}

func TestNewEventUsesReceiptMetadata(t *testing.T) {
	receipt := NewReceipt("tradeups.preview")
	event := NewEvent(receipt, "requires_validation", "requires validation")
	if event.OperationID != receipt.OperationID {
		t.Fatalf("operation id mismatch")
	}
	if event.State != "requires_validation" {
		t.Fatalf("unexpected event state: %s", event.State)
	}
}
