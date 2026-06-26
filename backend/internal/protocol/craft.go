package protocol

import (
	"encoding/binary"
	"fmt"
)

type CraftResponse struct {
	Recipe int16
	Gained []uint64
}

func EncodeCraftRequest(recipe int16, itemIDs []uint64) ([]byte, error) {
	if len(itemIDs) != 10 {
		return nil, fmt.Errorf("craft requests require exactly 10 item IDs")
	}
	buf := make([]byte, 4+8*len(itemIDs))
	binary.LittleEndian.PutUint16(buf[0:2], uint16(recipe))
	binary.LittleEndian.PutUint16(buf[2:4], uint16(len(itemIDs)))
	for i, itemID := range itemIDs {
		binary.LittleEndian.PutUint64(buf[4+i*8:4+(i+1)*8], itemID)
	}
	return buf, nil
}

func DecodeCraftResponse(body []byte) (CraftResponse, error) {
	if len(body) < 8 {
		return CraftResponse{}, fmt.Errorf("craft response too short")
	}
	recipe := int16(binary.LittleEndian.Uint16(body[0:2]))
	count := int(binary.LittleEndian.Uint16(body[6:8]))
	if len(body) < 8+8*count {
		return CraftResponse{}, fmt.Errorf("craft response truncated")
	}
	gained := make([]uint64, count)
	for i := 0; i < count; i++ {
		gained[i] = binary.LittleEndian.Uint64(body[8+i*8 : 16+i*8])
	}
	return CraftResponse{Recipe: recipe, Gained: gained}, nil
}
