package app

import (
	"context"

	"cs-inv-edit/backend/internal/domain"
	"cs-inv-edit/backend/internal/operations"
	"cs-inv-edit/backend/internal/steamtrade"
	"cs-inv-edit/backend/internal/transport"
)

// These state groups keep Service's public façade stable while making mutable
// state ownership explicit. The groups are embedded for a low-risk migration;
// feature services can take ownership of each group independently later.
type operationState struct {
	events        []operations.Event
	operations    []operations.Receipt
	lastOperation operations.Receipt
}

type inventoryState struct {
	inventory          domain.InventorySnapshot
	loadedStorageUnits map[uint64]bool
	gameInventories    map[string]domain.GameInventorySnapshot
	gameRefreshes      map[string]uint64
	gameCancels        map[string]context.CancelFunc
}

type commerceState struct {
	armory             domain.ArmorySnapshot
	store              domain.StoreSnapshot
	tf2Store           domain.StoreSnapshot
	purchaseSessions   map[string]domain.PurchaseSession
	purchaseItemIDs    map[string][]uint64
	purchaseAppIDs     map[string]uint32
	storeCountry       string
	storeCurrencyID    int32
	tf2StoreCountry    string
	tf2StoreCurrencyID int32
}

type authState struct {
	settings          domain.Settings
	connection        domain.ConnectionStatus
	gcClient          transport.GCClient
	gcSessionEpoch    uint64
	gcSessionContext  context.Context
	gcSessionCancel   context.CancelFunc
	gcSessions        map[gcSessionKey]*gcSessionState
	pendingUsername   string
	pendingPassword   string
	authCancel        context.CancelFunc
	authEpoch         uint64
	steamSessions     map[string]*steamAccountSession
	activeSteamID     string
	saveSteamSession  func(transport.LogonCredentials) error
	clearSteamSession func() error
}

type tradeState struct {
	tradeAccessToken string
	tradeProvider    *steamtrade.Provider
	trades           steamtrade.Snapshot
	tradeAccounts    map[string]steamtrade.AccountSnapshot
}
