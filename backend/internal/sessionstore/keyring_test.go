package sessionstore

import (
	"errors"
	"testing"

	"cs-inv-edit/backend/internal/transport"
	"github.com/zalando/go-keyring"
)

type fakeSecretStore struct {
	secret string
}

func (f *fakeSecretStore) Get(string, string) (string, error) {
	if f.secret == "" {
		return "", keyring.ErrNotFound
	}
	return f.secret, nil
}

func (f *fakeSecretStore) Set(_, _, password string) error {
	f.secret = password
	return nil
}

func (f *fakeSecretStore) Delete(_, _ string) error {
	if f.secret == "" {
		return keyring.ErrNotFound
	}
	f.secret = ""
	return nil
}

func TestKeyringRoundTripAndClearUsesSecretStore(t *testing.T) {
	store := &fakeSecretStore{}
	keyringStore := NewKeyringWithStore(store)
	want := transport.LogonCredentials{
		Username:      "fixture-account",
		AccessToken:   "refresh-token",
		WebAccessToken: "web-token",
		Password:      "must-not-persist",
		AuthCode:      "must-not-persist",
	}

	if err := keyringStore.Save(want); err != nil {
		t.Fatal(err)
	}
	got, err := keyringStore.Load()
	if err != nil {
		t.Fatal(err)
	}
	if got.Username != want.Username || got.AccessToken != want.AccessToken || got.WebAccessToken != want.WebAccessToken {
		t.Fatalf("credentials=%#v", got)
	}
	if got.Password != "" || got.AuthCode != "" {
		t.Fatalf("sensitive transient credentials persisted: %#v", got)
	}
	if err := keyringStore.Clear(); err != nil {
		t.Fatal(err)
	}
	if _, err := keyringStore.Load(); !errors.Is(err, keyring.ErrNotFound) {
		t.Fatalf("load after clear error=%v, want keyring not found", err)
	}
}

func TestKeyringRejectsIncompleteSecret(t *testing.T) {
	store := &fakeSecretStore{secret: `{"username":"fixture-account"}`}
	_, err := NewKeyringWithStore(store).Load()
	if err == nil {
		t.Fatal("incomplete credentials unexpectedly loaded")
	}
}
