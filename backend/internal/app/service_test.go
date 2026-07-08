package app

import "testing"

func TestSubmitOperationBlocksNameTagsByDefault(t *testing.T) {
	service := NewService()
	receipt := service.SubmitOperation("nametags.apply", map[string]any{})
	if receipt.State != "blocked_by_feature_flag" {
		t.Fatalf("expected blocked_by_feature_flag, got %q", receipt.State)
	}
}

func TestSubmitOperationAllowsNameTagsWhenEnabled(t *testing.T) {
	service := NewService()
	service.SubmitOperation("settings", map[string]any{
		"validationMode": false,
		"featureFlags": map[string]any{
			"enableNameTags": true,
		},
	})

	receipt := service.SubmitOperation("nametags.apply", map[string]any{})
	if receipt.State != "awaiting_gc_confirmation" {
		t.Fatalf("expected awaiting_gc_confirmation, got %q", receipt.State)
	}
}

func TestSubmitOperationBlocksItemDeletionWhenDisabled(t *testing.T) {
	service := NewService()
	receipt := service.SubmitOperation("items.delete", map[string]any{})
	if receipt.State != "blocked_by_feature_flag" {
		t.Fatalf("expected blocked_by_feature_flag, got %q", receipt.State)
	}
}
