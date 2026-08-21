package app

import (
	"context"
	"strings"
	"sync/atomic"
	"testing"

	"cs-inv-edit/backend/internal/domain"
	"cs-inv-edit/backend/internal/operations"
	"cs-inv-edit/backend/internal/protocol"
	"cs-inv-edit/backend/internal/transport"
)

func TestGCSessionReadinessCoalescesConcurrentRequestsForOneAccount(t *testing.T) {
	service := NewService()
	client := transport.NewTestGCClient()
	service.gcClient = client
	service.connection = domain.ConnectionStatus{State: "connected", SteamID: "account-a"}
	started := make(chan struct{})
	release := make(chan struct{})
	var calls atomic.Int32
	client.InventoryFunc = func(context.Context) ([]transport.GCInventoryItem, error) {
		if calls.Add(1) == 1 {
			close(started)
		}
		<-release
		return nil, nil
	}

	results := make(chan error, 2)
	go func() { results <- service.ensureGCSession(t.Context(), protocol.AppIDCS2) }()
	<-started
	go func() { results <- service.ensureGCSession(t.Context(), protocol.AppIDCS2) }()
	close(release)

	for range 2 {
		if err := <-results; err != nil {
			t.Fatal(err)
		}
	}
	if calls.Load() != 1 {
		t.Fatalf("concurrent readiness checks made %d inventory requests", calls.Load())
	}
}

func TestGCSessionAccountChangeCancelsOldEpochAndDoesNotReuseReadiness(t *testing.T) {
	service := NewService()
	client := transport.NewTestGCClient()
	service.gcClient = client
	service.connection = domain.ConnectionStatus{State: "connected", SteamID: "account-a"}
	started := make(chan struct{})
	var calls atomic.Int32
	client.InventoryFunc = func(ctx context.Context) ([]transport.GCInventoryItem, error) {
		if calls.Add(1) == 1 {
			close(started)
			<-ctx.Done()
			return nil, ctx.Err()
		}
		return nil, nil
	}

	oldResult := make(chan error, 1)
	go func() { oldResult <- service.ensureGCSession(t.Context(), protocol.AppIDCS2) }()
	<-started
	service.mu.Lock()
	service.activateAccountSessionLocked("account-b")
	service.connection = domain.ConnectionStatus{State: "connected", SteamID: "account-b"}
	service.mu.Unlock()

	if err := <-oldResult; err == nil || !strings.Contains(err.Error(), "superseded") {
		t.Fatalf("old account readiness error=%v", err)
	}
	if err := service.ensureGCSession(t.Context(), protocol.AppIDCS2); err != nil {
		t.Fatal(err)
	}
	if calls.Load() != 2 {
		t.Fatalf("account B reused account A readiness; calls=%d", calls.Load())
	}
}

func TestGCSessionSameAccountReconnectUsesNewEpoch(t *testing.T) {
	service := NewService()
	client := transport.NewTestGCClient()
	service.gcClient = client
	service.connection = domain.ConnectionStatus{State: "connected", SteamID: "account-a"}
	var calls atomic.Int32
	client.InventoryFunc = func(context.Context) ([]transport.GCInventoryItem, error) {
		calls.Add(1)
		return nil, nil
	}

	if err := service.ensureGCSession(t.Context(), protocol.AppIDCS2); err != nil {
		t.Fatal(err)
	}
	service.mu.Lock()
	service.activateAccountSessionLocked("account-a")
	service.connection = domain.ConnectionStatus{State: "connected", SteamID: "account-a"}
	service.mu.Unlock()
	if err := service.ensureGCSession(t.Context(), protocol.AppIDCS2); err != nil {
		t.Fatal(err)
	}
	if calls.Load() != 2 {
		t.Fatalf("same-account reconnect reused the old epoch; calls=%d", calls.Load())
	}
}

func TestAccountChangeCancelsCS2RefreshAndPreventsLateSnapshotCommit(t *testing.T) {
	service := NewService()
	client := transport.NewTestGCClient()
	service.gcClient = client
	service.connection = domain.ConnectionStatus{State: "connected", SteamID: "account-a"}
	service.inventory = domain.InventorySnapshot{Status: "ready", Items: []domain.InventoryItem{{ID: "account-a-item"}}}
	started := make(chan struct{})
	client.InventoryFunc = func(ctx context.Context) ([]transport.GCInventoryItem, error) {
		close(started)
		<-ctx.Done()
		return nil, ctx.Err()
	}

	done := make(chan operations.Receipt, 1)
	go func() { done <- service.RefreshInventory() }()
	<-started
	service.mu.Lock()
	service.activateAccountSessionLocked("account-b")
	service.connection = domain.ConnectionStatus{State: "connected", SteamID: "account-b"}
	service.mu.Unlock()

	receipt := <-done
	if receipt.State != operations.StateCompleted || !strings.Contains(receipt.Message, "superseded") {
		t.Fatalf("receipt=%#v", receipt)
	}
	if snapshot := service.Inventory(); len(snapshot.Items) != 0 {
		t.Fatalf("account B inherited account A inventory: %#v", snapshot)
	}
}
