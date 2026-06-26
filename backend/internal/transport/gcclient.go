package transport

import (
	"context"
	"errors"
)

var ErrNotImplemented = errors.New("steam gc transport not implemented")

type GCEvent struct {
	Type    string
	Payload any
}

type GCConnectionState struct {
	State string
}

type GCClient interface {
	Connect(ctx context.Context) error
	Close() error
	SendToGC(ctx context.Context, appID uint32, emsg uint32, body []byte) error
	Events() <-chan GCEvent
	State() GCConnectionState
}

type MockGCClient struct {
	events chan GCEvent
	state  GCConnectionState
}

func NewMockGCClient() *MockGCClient {
	return &MockGCClient{events: make(chan GCEvent, 16), state: GCConnectionState{State: "mock"}}
}

func (m *MockGCClient) Connect(context.Context) error {
	m.state = GCConnectionState{State: "connected"}
	return nil
}

func (m *MockGCClient) Close() error {
	m.state = GCConnectionState{State: "closed"}
	return nil
}

func (m *MockGCClient) SendToGC(_ context.Context, _ uint32, _ uint32, _ []byte) error {
	return nil
}

func (m *MockGCClient) Events() <-chan GCEvent {
	return m.events
}

func (m *MockGCClient) State() GCConnectionState {
	return m.state
}

func (m *MockGCClient) Emit(event GCEvent) {
	m.events <- event
}

type SteamGCClient struct{}

func NewSteamGCClient() *SteamGCClient { return &SteamGCClient{} }

func (s *SteamGCClient) Connect(context.Context) error { return ErrNotImplemented }
func (s *SteamGCClient) Close() error                  { return ErrNotImplemented }
func (s *SteamGCClient) SendToGC(context.Context, uint32, uint32, []byte) error {
	return ErrNotImplemented
}
func (s *SteamGCClient) Events() <-chan GCEvent { return make(chan GCEvent) }
func (s *SteamGCClient) State() GCConnectionState {
	return GCConnectionState{State: "not-implemented"}
}
