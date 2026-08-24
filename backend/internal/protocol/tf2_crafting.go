package protocol

import (
	"encoding/binary"
	"fmt"
)

// EncodeTF2CraftRequest is the legacy TF2 craft frame used by k_EMsgGCCraft.
// The recipe is an explicit TF2 blueprint ID.
func EncodeTF2CraftRequest(recipe int16, itemIDs []uint64) ([]byte, error) {
	if len(itemIDs) == 0 {
		return nil, fmt.Errorf("TF2 crafting requires at least one item")
	}
	if hasDuplicateIDs(itemIDs) {
		return nil, fmt.Errorf("TF2 crafting item ids must be unique")
	}
	body := make([]byte, 4+len(itemIDs)*8)
	binary.LittleEndian.PutUint16(body[0:2], uint16(recipe))
	binary.LittleEndian.PutUint16(body[2:4], uint16(len(itemIDs)))
	for index, itemID := range itemIDs {
		binary.LittleEndian.PutUint64(body[4+index*8:], itemID)
	}
	return body, nil
}
