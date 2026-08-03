package sessionstore

import (
	"errors"
	"os"
	"path/filepath"
	"testing"

	"cs-inv-edit/backend/internal/transport"
)

func TestFileRoundTripAndClear(t *testing.T) {
	path := filepath.Join(t.TempDir(), "nested", "steam-session.json")
	store := NewFile(path)
	want := transport.LogonCredentials{Username: "account", AccessToken: "refresh", WebAccessToken: "web", Password: "must-not-persist"}
	if err := store.Save(want); err != nil {
		t.Fatal(err)
	}
	info, err := os.Stat(path)
	if err != nil {
		t.Fatal(err)
	}
	if info.Mode().Perm() != 0o600 {
		t.Fatalf("session permissions=%o, want 600", info.Mode().Perm())
	}
	got, err := store.Load()
	if err != nil {
		t.Fatal(err)
	}
	if got.Username != want.Username || got.AccessToken != want.AccessToken || got.WebAccessToken != want.WebAccessToken {
		t.Fatalf("loaded credentials=%#v", got)
	}
	if got.Password != "" {
		t.Fatal("password was persisted")
	}
	if err := store.Clear(); err != nil {
		t.Fatal(err)
	}
	if _, err := store.Load(); !errors.Is(err, os.ErrNotExist) {
		t.Fatalf("load after clear error=%v, want not-exist", err)
	}
}
