package operations

import (
	"crypto/rand"
	"encoding/hex"
	"time"
)

type Receipt struct {
	OperationID string `json:"operationId"`
	Type        string `json:"type"`
	State       string `json:"state"`
	CreatedAt   string `json:"createdAt"`
}

func NewReceipt(opType string) Receipt {
	return Receipt{
		OperationID: "op_" + randomHex(8),
		Type:        opType,
		State:       "queued",
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
