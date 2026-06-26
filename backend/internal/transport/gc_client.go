package transport

import (
	"context"
	"sync"
)

type GCEvent struct {
	Type string `json:"type"`
	Data any    `json:"data,omitempty"`
}

type GCConnectionState struct {
	Connected bool
	State     string
}

type GCClient interface {
	Connect(ctx context.Context) error
	Close() error
	SendToGC(ctx context.Context, appID uint32, emsg uint32, body []byte) error
	Events() <-chan GCEvent
	State() GCConnectionState
}

type MockGCClient struct {
	mu     sync.Mutex
	state  GCConnectionState
	events chan GCEvent
	closed bool
}

func NewMockGCClient() *MockGCClient {
	return &MockGCClient{events: make(chan GCEvent, 16), state: GCConnectionState{Connected: true, State: "mock"}}
}

func (m *MockGCClient) Connect(context.Context) error {
	m.mu.Lock()
	defer m.mu.Unlock()
	m.state = GCConnectionState{Connected: true, State: "mock"}
	return nil
}

func (m *MockGCClient) Close() error {
	m.mu.Lock()
	defer m.mu.Unlock()
	m.closed = true
	m.state = GCConnectionState{Connected: false, State: "closed"}
	return nil
}

func (m *MockGCClient) SendToGC(_ context.Context, _ uint32, _ uint32, body []byte) error {
	m.mu.Lock()
	defer m.mu.Unlock()
	if m.closed {
		return nil
	}
	m.events <- GCEvent{Type: "operation", Data: string(body)}
	return nil
}

func (m *MockGCClient) Events() <-chan GCEvent { return m.events }

func (m *MockGCClient) State() GCConnectionState {
	m.mu.Lock()
	defer m.mu.Unlock()
	return m.state
}
