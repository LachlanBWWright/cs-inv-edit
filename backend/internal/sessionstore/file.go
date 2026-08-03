package sessionstore

import (
	"encoding/json"
	"errors"
	"fmt"
	"os"
	"path/filepath"

	"cs-inv-edit/backend/internal/transport"
)

type File struct {
	path string
}

func NewFile(path string) *File {
	return &File{path: path}
}

func DefaultPath() (string, error) {
	directory, err := os.UserConfigDir()
	if err != nil {
		return "", fmt.Errorf("resolve user config directory: %w", err)
	}
	return filepath.Join(directory, "cs-inv-edit", "steam-session.json"), nil
}

func (f *File) Load() (transport.LogonCredentials, error) {
	content, err := os.ReadFile(f.path)
	if err != nil {
		return transport.LogonCredentials{}, err
	}
	var credentials transport.LogonCredentials
	if err := json.Unmarshal(content, &credentials); err != nil {
		return transport.LogonCredentials{}, fmt.Errorf("decode Steam session: %w", err)
	}
	if credentials.Username == "" || credentials.AccessToken == "" {
		return transport.LogonCredentials{}, fmt.Errorf("saved Steam session is incomplete")
	}
	return credentials, nil
}

func (f *File) Save(credentials transport.LogonCredentials) error {
	credentials.Password = ""
	credentials.AuthCode = ""
	credentials.TwoFactorCode = ""
	credentials.LoginKey = ""
	content, err := json.Marshal(credentials)
	if err != nil {
		return fmt.Errorf("encode Steam session: %w", err)
	}
	directory := filepath.Dir(f.path)
	if err := os.MkdirAll(directory, 0o700); err != nil {
		return fmt.Errorf("create Steam session directory: %w", err)
	}
	temporary, err := os.CreateTemp(directory, ".steam-session-*")
	if err != nil {
		return fmt.Errorf("create temporary Steam session: %w", err)
	}
	temporaryPath := temporary.Name()
	defer os.Remove(temporaryPath)
	if err := temporary.Chmod(0o600); err != nil {
		temporary.Close()
		return fmt.Errorf("protect temporary Steam session: %w", err)
	}
	if _, err := temporary.Write(content); err != nil {
		temporary.Close()
		return fmt.Errorf("write temporary Steam session: %w", err)
	}
	if err := temporary.Close(); err != nil {
		return fmt.Errorf("close temporary Steam session: %w", err)
	}
	if err := os.Rename(temporaryPath, f.path); err != nil {
		return fmt.Errorf("replace Steam session: %w", err)
	}
	return nil
}

func (f *File) Clear() error {
	err := os.Remove(f.path)
	if errors.Is(err, os.ErrNotExist) {
		return nil
	}
	if err != nil {
		return fmt.Errorf("remove Steam session: %w", err)
	}
	return nil
}
