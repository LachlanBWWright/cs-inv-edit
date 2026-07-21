package app

import "testing"

func TestOpenCrateMessageOmitsToolForKeylessContainer(t *testing.T) {
	message := openCrateMessage(101, 0)
	if message.SubjectItemId == nil || message.GetSubjectItemId() != 101 {
		t.Fatalf("subject item id = %#v, want 101", message.SubjectItemId)
	}
	if message.ToolItemId != nil {
		t.Fatalf("keyless tool item id = %#v, want omitted", message.ToolItemId)
	}
}

func TestOpenCrateMessageIncludesKeyForKeyedContainer(t *testing.T) {
	message := openCrateMessage(101, 202)
	if message.SubjectItemId == nil || message.GetSubjectItemId() != 101 {
		t.Fatalf("subject item id = %#v, want 101", message.SubjectItemId)
	}
	if message.ToolItemId == nil || message.GetToolItemId() != 202 {
		t.Fatalf("keyed tool item id = %#v, want 202", message.ToolItemId)
	}
}
