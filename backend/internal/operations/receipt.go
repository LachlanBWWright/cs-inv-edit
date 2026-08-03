package operations

import (
	"crypto/rand"
	"encoding/hex"
	"time"
)

type State string

type Type string

const (
	TypeSettings              Type = "settings"
	TypeContainersOpen        Type = "containers.open"
	TypeStorageLoad           Type = "storage.load"
	TypeTerminalLoadOffer     Type = "terminal.load-offer"
	TypeStorageMoveIn         Type = "storage.move-in"
	TypeStorageMoveOut        Type = "storage.move-out"
	TypeSteamConnect          Type = "steam.connect"
	TypeSteamGuard            Type = "steam.guard"
	TypeSteamDisconnect       Type = "steam.disconnect"
	TypeTradeupsExecute       Type = "tradeups.execute"
	TypeTradeupsPreview       Type = "tradeups.preview"
	TypeStickersExtract       Type = "stickers.extract"
	TypeNametagsApply         Type = "nametags.apply"
	TypeNametagsRemove        Type = "nametags.remove"
	TypeItemsDelete           Type = "items.delete"
	TypeStattrakSwap          Type = "stattrak.swap"
	TypeStrangePartsApply     Type = "strange-parts.apply"
	TypeItemsUse              Type = "items.use"
	TypeItemsUseMultiple      Type = "items.use-multiple"
	TypeToolsApply            Type = "tools.apply"
	TypeToolsApplyBase        Type = "tools.apply-base"
	TypeGiftsSend             Type = "gifts.send"
	TypeTF2MarketRefresh      Type = "tf2.market.refresh"
	TypeTF2StrangePart        Type = "tf2.tools.strange-part"
	TypeTF2StrangeRestriction Type = "tf2.tools.strange-restriction"
	TypeTF2StrangeTransfer    Type = "tf2.tools.strange-transfer"
	TypeTF2StrangeRemove      Type = "tf2.tools.strange-remove"
	TypeTF2StrangeReset       Type = "tf2.tools.strange-reset"
	TypeTF2DecalApply         Type = "tf2.customization.decal-apply"
)

const (
	StateQueued                 State = "queued"
	StateValidating             State = "validating"
	StateEncoded                State = "encoded"
	StateSent                   State = "sent"
	StateAwaitingGCConfirmation State = "awaiting_gc_confirmation"
	StateReconcilingInventory   State = "reconciling_inventory"
	StateCompleted              State = "completed"
	StateFailed                 State = "failed"
	StateBlockedByFeatureFlag   State = "blocked_by_feature_flag"
	StateRequiresValidation     State = "requires_validation"
	StateRequiresConnection     State = "requires_connection"
)

type Receipt struct {
	OperationID string `json:"operationId"`
	Type        string `json:"type"`
	State       State  `json:"state"`
	CreatedAt   string `json:"createdAt"`
	Message     string `json:"message,omitempty"`
	Result      any    `json:"result,omitempty"`
}

type Event struct {
	OperationID string `json:"operationId"`
	Type        string `json:"type"`
	State       State  `json:"state"`
	Message     string `json:"message,omitempty"`
	CreatedAt   string `json:"createdAt"`
}

func NewReceipt(opType string) Receipt {
	return Receipt{
		OperationID: "op_" + randomHex(8),
		Type:        opType,
		State:       StateQueued,
		CreatedAt:   time.Now().UTC().Format(time.RFC3339Nano),
	}
}

func NewEvent(receipt Receipt, state State, message string) Event {
	return Event{
		OperationID: receipt.OperationID,
		Type:        receipt.Type,
		State:       state,
		Message:     message,
		CreatedAt:   time.Now().UTC().Format(time.RFC3339Nano),
	}
}

func randomHex(n int) string {
	buf := make([]byte, n)
	if _, err := rand.Read(buf); err != nil {
		return "fallback"
	}
	return hex.EncodeToString(buf)
}
