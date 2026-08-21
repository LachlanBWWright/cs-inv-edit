package app

import (
	"testing"

	"cs-inv-edit/backend/internal/domain"
)

func TestRegisterSteamSessionKeepsDistinctAccountTransports(t *testing.T) {
	service := NewService()
	firstClient := service.gcClient
	service.registerSteamSessionLocked(domain.ConnectionStatus{State: "connected", SteamID: "account-a", AccountName: "alpha"}, "token-a")

	service.prepareAdditionalSteamSession()
	secondClient := service.gcClient
	if firstClient == secondClient {
		t.Fatal("adding an account reused the existing GC transport")
	}
	service.registerSteamSessionLocked(domain.ConnectionStatus{State: "connected", SteamID: "account-b", AccountName: "beta"}, "token-b")

	if len(service.steamSessions) != 2 {
		t.Fatalf("sessions=%d, want 2", len(service.steamSessions))
	}
	if service.steamSessions["account-a"].GCClient != firstClient || service.steamSessions["account-a"].TradeAccessToken != "token-a" {
		t.Fatal("first account session was replaced while adding the second")
	}
	if service.steamSessions["account-b"].GCClient != secondClient || service.activeSteamID != "account-b" {
		t.Fatal("second account was not registered as the active independent session")
	}
}
