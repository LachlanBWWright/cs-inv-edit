package dota2tracking

import (
	_ "embed"
	"sync"

	"cs-inv-edit/backend/internal/proto/tracking"
	"google.golang.org/protobuf/types/dynamicpb"
)

//go:embed gametracking_dota2.pb
var descriptorBytes []byte

var (
	registryOnce sync.Once
	registry     *tracking.Registry
	registryErr  error
)

func gameRegistry() (*tracking.Registry, error) {
	registryOnce.Do(func() {
		registry, registryErr = tracking.Load("Dota 2", descriptorBytes)
	})
	return registry, registryErr
}

func MarshalMessage(name string, fields map[string]any) ([]byte, error) {
	registry, err := gameRegistry()
	if err != nil {
		return nil, err
	}
	return registry.Marshal(name, fields)
}

func UnmarshalMessage(name string, body []byte) (*dynamicpb.Message, error) {
	registry, err := gameRegistry()
	if err != nil {
		return nil, err
	}
	return registry.Unmarshal(name, body)
}
