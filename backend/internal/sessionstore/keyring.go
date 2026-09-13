package sessionstore

import (
	"encoding/json"
	"errors"
	"fmt"

	"cs-inv-edit/backend/internal/transport"
	"github.com/zalando/go-keyring"
)

const defaultKeyringService = "cs-inv-edit"

func IsNotFound(err error) bool {
	return errors.Is(err, keyring.ErrNotFound)
}

type Keyring struct {
	service string
	account string
	store   secretStore
}

type secretStore interface {
	Get(service, account string) (string, error)
	Set(service, account, password string) error
	Delete(service, account string) error
}

type nativeSecretStore struct{}

func (nativeSecretStore) Get(service, account string) (string, error) {
	return keyring.Get(service, account)
}

func (nativeSecretStore) Set(service, account, password string) error {
	return keyring.Set(service, account, password)
}

func (nativeSecretStore) Delete(service, account string) error {
	return keyring.Delete(service, account)
}

func NewKeyring() *Keyring {
	return NewKeyringWithStore(nativeSecretStore{})
}

func NewKeyringWithStore(store secretStore) *Keyring {
	return &Keyring{service: defaultKeyringService, account: "steam-session", store: store}
}

func (k *Keyring) Load() (transport.LogonCredentials, error) {
	secret, err := k.store.Get(k.service, k.account)
	if err != nil {
		return transport.LogonCredentials{}, err
	}
	var credentials transport.LogonCredentials
	if err := json.Unmarshal([]byte(secret), &credentials); err != nil {
		return transport.LogonCredentials{}, fmt.Errorf("decode Steam keyring session: %w", err)
	}
	if credentials.Username == "" || credentials.AccessToken == "" {
		return transport.LogonCredentials{}, fmt.Errorf("saved Steam session is incomplete")
	}
	return credentials, nil
}

func (k *Keyring) Save(credentials transport.LogonCredentials) error {
	credentials.Password = ""
	credentials.AuthCode = ""
	credentials.TwoFactorCode = ""
	credentials.LoginKey = ""
	content, err := json.Marshal(credentials)
	if err != nil {
		return fmt.Errorf("encode Steam keyring session: %w", err)
	}
	if err := k.store.Set(k.service, k.account, string(content)); err != nil {
		return fmt.Errorf("save Steam session in OS keyring: %w", err)
	}
	return nil
}

func (k *Keyring) Clear() error {
	if err := k.store.Delete(k.service, k.account); err != nil && err != keyring.ErrNotFound {
		return fmt.Errorf("remove Steam session from OS keyring: %w", err)
	}
	return nil
}
