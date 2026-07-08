package protocol

import (
	"encoding/binary"
	"fmt"
)

const (
	AppIDCS2 = 730

	EMsgDeleteItem                    = 1004
	EMsgSetItemName                   = 1006
	EMsgCraft                         = 1002
	EMsgCraftResponse                 = 1003
	EMsgUseItemRequest                = 1025
	EMsgRemoveItemName                = 1030
	EMsgApplyStrangePart              = 1073
	EMsgSetItemPositions              = 1077
	EMsgApplySticker                  = 1086
	EMsgStatTrakSwap                  = 1088
	EMsgItemCustomizationNotification = 1090
	EMsgCasketItemAdd                 = 1092
	EMsgCasketItemExtract             = 1093
	EMsgCasketItemLoadContents        = 1094
	EMsgGiftItem                      = 1034

	CustomizationRemoveSticker      = 1053
	CustomizationExtractSticker     = 1054
	CustomizationEncapsulateSticker = 1055
	CustomizationApplySticker       = 1086
)

type CraftResponse struct {
	Recipe        int16
	GainedItemIDs []uint64
}

func EncodeCraftRequest(recipe int16, itemIDs []uint64) ([]byte, error) {
	if len(itemIDs) != 10 {
		return nil, fmt.Errorf("trade-up requires exactly 10 item ids")
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
