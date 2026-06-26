package operations

import (
	"crypto/rand"
	"encoding/hex"
	"time"

	"cs-inv-edit/backend/internal/domain"
)

func NewReceipt(opType string) domain.OperationReceipt {
	return domain.OperationReceipt{
		OperationID: "op_" + randomHex(8),
		Type:        opType,
		State:       "queued",
		CreatedAt:   time.Now().UTC().Format(time.RFC3339Nano),
	}
}

func NewReceiptWithState(opType, state, message string) domain.OperationReceipt {
	return domain.OperationReceipt{
		OperationID: "op_" + randomHex(8),
		Type:        opType,
		State:       state,
		CreatedAt:   time.Now().UTC().Format(time.RFC3339Nano),
		Message:     message,
	}
}

func randomHex(n int) string {
	buf := make([]byte, n)
	if _, err := rand.Read(buf); err != nil {
		return "fallback"
	}
	return hex.EncodeToString(buf)
}
