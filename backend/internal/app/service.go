package app

import (
	"fmt"
	"sync"
	"time"

	"cs-inv-edit/backend/internal/operations"
)

type HealthStatus struct {
	Status  string `json:"status"`
	Service string `json:"service"`
	Version string `json:"version"`
	Time    string `json:"time"`
}

type InventoryItem struct {
	ID           string   `json:"id"`
	Name         string   `json:"name"`
	Kind         string   `json:"kind"`
	Defindex     *uint32  `json:"defindex,omitempty"`
	PaintWear    *float64 `json:"paintWear,omitempty"`
	StorageCount *uint32  `json:"storageCount,omitempty"`
	CasketID     *string  `json:"casketId,omitempty"`
}

type InventorySnapshot struct {
	Items       []InventoryItem `json:"items"`
	RefreshedAt string          `json:"refreshedAt"`
}

type Event struct {
	Type      string `json:"type"`
	Payload   any    `json:"payload"`
	CreatedAt string `json:"createdAt"`
}

type Service struct {
	mu     sync.Mutex
	events []Event
}

func NewService() *Service {
	return &Service{
		events: []Event{{
			Type:      "log",
			Payload:   map[string]string{"message": "backend started"},
			CreatedAt: now(),
		}},
	}
}

func (s *Service) Health() HealthStatus {
	return HealthStatus{
		Status:  "ok",
		Service: "cs2-backend",
		Version: "0.0.0",
		Time:    now(),
	}
}

func (s *Service) Inventory() InventorySnapshot {
	wear := 0.0671
	count := uint32(742)
	defWeapon := uint32(7)
	defStorage := uint32(1201)

	return InventorySnapshot{
		RefreshedAt: now(),
		Items: []InventoryItem{
			{ID: "2480000000000000000", Name: "AK-47 | Example Finish", Kind: "weapon_skin", Defindex: &defWeapon, PaintWear: &wear},
			{ID: "3480000000000000000", Name: "Example Sticker", Kind: "sticker_item"},
			{ID: "5480000000000000000", Name: "Storage Unit", Kind: "storage_unit", Defindex: &defStorage, StorageCount: &count},
		},
	}
}

func (s *Service) SubmitOperation(opType string) operations.Receipt {
	receipt := operations.NewReceipt(opType)
	s.addEvent("operation", receipt)
	return receipt
}

func (s *Service) Events() []Event {
	s.mu.Lock()
	defer s.mu.Unlock()

	out := make([]Event, len(s.events))
	copy(out, s.events)
	return out
}

func (s *Service) addEvent(kind string, payload any) {
	s.mu.Lock()
	defer s.mu.Unlock()

	s.events = append(s.events, Event{
		Type:      kind,
		Payload:   payload,
		CreatedAt: now(),
	})
}

func now() string {
	return time.Now().UTC().Format(time.RFC3339Nano)
}

func UnsupportedProtocolError(operation string) error {
	return fmt.Errorf("%s is scaffolded but not wired to Steam GC yet", operation)
}
