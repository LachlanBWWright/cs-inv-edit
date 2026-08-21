package protocol

import (
	"encoding/binary"
	"fmt"
)

func EncodeCraftRequest(recipe int16, itemIDs []uint64) ([]byte, error) {
	if len(itemIDs) != 5 && len(itemIDs) != 10 {
		return nil, fmt.Errorf("trade-up requires exactly 5 or 10 item ids")
	}
	if hasDuplicateIDs(itemIDs) {
		return nil, fmt.Errorf("trade-up item ids must be unique")
	}
	buf := make([]byte, 4+len(itemIDs)*8)
	binary.LittleEndian.PutUint16(buf[0:2], uint16(recipe))
	binary.LittleEndian.PutUint16(buf[2:4], uint16(len(itemIDs)))
	for i, id := range itemIDs {
		binary.LittleEndian.PutUint64(buf[4+i*8:], id)
	}
	return buf, nil
}

func DecodeCraftResponse(body []byte) (CraftResponse, error) {
	if len(body) < 8 {
		return CraftResponse{}, fmt.Errorf("craft response is too short")
	}
	recipe := int16(binary.LittleEndian.Uint16(body[0:2]))
	itemCount := int(binary.LittleEndian.Uint16(body[6:8]))
	if len(body) != 8+itemCount*8 {
		return CraftResponse{}, fmt.Errorf("craft response size mismatch")
	}
	ids := make([]uint64, itemCount)
	for i := 0; i < itemCount; i++ {
		ids[i] = binary.LittleEndian.Uint64(body[8+i*8:])
	}
	return CraftResponse{Recipe: recipe, GainedItemIDs: ids}, nil
}

func hasDuplicateIDs(ids []uint64) bool {
	seen := map[uint64]struct{}{}
	for _, id := range ids {
		if _, ok := seen[id]; ok {
			return true
		}
		seen[id] = struct{}{}
	}
	return false
}
