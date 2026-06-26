package proto

import (
	"encoding/binary"
	"fmt"
	"math"

	cs2pb "cs-inv-edit/backend/internal/proto/generated"
)

const (
	AppIDCS2 = 730

	EMsgCraft                         = 1002
	EMsgCraftResponse                 = 1003
	EMsgSetItemPositions              = 1077
	EMsgApplySticker                  = 1086
	EMsgItemCustomizationNotification = 1090
	EMsgCasketItemAdd                 = 1092
	EMsgCasketItemExtract             = 1093
	EMsgCasketItemLoadContents        = 1094

	CustomizationRemoveSticker      = 1053
	CustomizationExtractSticker     = 1054
	CustomizationEncapsulateSticker = 1055
	CustomizationApplySticker       = 1086
)

func EncodeCasketItem(casketID, itemID uint64) ([]byte, error) {
	msg := &cs2pb.CMsgCasketItem{CasketItemId: &casketID, ItemItemId: &itemID}
	return encodeCasketMessage(msg)
}

func EncodeLoadCasketContents(casketID uint64) ([]byte, error) {
	msg := &cs2pb.CMsgCasketItem{CasketItemId: &casketID}
	return encodeCasketMessage(msg)
}

func EncodeExtractSticker(itemID uint64, slot uint32) ([]byte, error) {
	var request uint32 = CustomizationExtractSticker
	msg := &cs2pb.CMsgGCItemCustomizationNotification{ItemId: []uint64{itemID}, Request: &request}
	return encodeCustomizationNotification(msg)
}

func EncodeRemoveSticker(itemID uint64, slot uint32) ([]byte, error) {
	var request uint32 = CustomizationRemoveSticker
	msg := &cs2pb.CMsgGCItemCustomizationNotification{ItemId: []uint64{itemID}, Request: &request}
	return encodeCustomizationNotification(msg)
}

func EncodeApplySticker(input ApplyStickerInput) ([]byte, error) {
	msg := &cs2pb.CMsgApplySticker{
		StickerItemId:     &input.StickerItemId,
		ItemItemId:        &input.ItemItemId,
		StickerSlot:       &input.StickerSlot,
		BaseitemDefidx:    &input.BaseitemDefidx,
		StickerWear:       &input.StickerWear,
		StickerRotation:   &input.StickerRotation,
		StickerScale:      &input.StickerScale,
		StickerOffsetX:    &input.StickerOffsetX,
		StickerOffsetY:    &input.StickerOffsetY,
		StickerOffsetZ:    &input.StickerOffsetZ,
		StickerWearTarget: &input.StickerWearTarget,
	}
	return encodeApplySticker(msg)
}

func EncodeSetItemPositions(input SetItemPositionsInput) ([]byte, error) {
	positions := make([]*cs2pb.CMsgSetItemPositions_ItemPosition, 0, len(input.ItemPositions))
	for _, position := range input.ItemPositions {
		legacy := position.LegacyItemId
		pos := position.Position
		itemID := position.ItemId
		positionValue := &cs2pb.CMsgSetItemPositions_ItemPosition{LegacyItemId: &legacy, Position: &pos, ItemId: &itemID}; positions = append(positions, positionValue)
	}
	msg := &cs2pb.CMsgSetItemPositions{ItemPositions: positions}
	return encodeSetItemPositions(msg)
}

func encodeCasketMessage(msg *cs2pb.CMsgCasketItem) ([]byte, error) {
	var out []byte
	if msg.CasketItemId != nil {
		out = appendFieldUint64(out, 1, *msg.CasketItemId)
	}
	if msg.ItemItemId != nil {
		out = appendFieldUint64(out, 2, *msg.ItemItemId)
	}
	return out, nil
}

func encodeCustomizationNotification(msg *cs2pb.CMsgGCItemCustomizationNotification) ([]byte, error) {
	var out []byte
	for _, itemID := range msg.ItemId {
		out = appendFieldUint64(out, 1, itemID)
	}
	if msg.Request != nil {
		out = appendFieldUint32(out, 2, *msg.Request)
	}
	for _, itemID := range msg.ExtraData {
		out = appendFieldUint64(out, 3, itemID)
	}
	return out, nil
}

func encodeApplySticker(msg *cs2pb.CMsgApplySticker) ([]byte, error) {
	var out []byte
	if msg.StickerItemId != nil {
		out = appendFieldUint64(out, 1, *msg.StickerItemId)
	}
	if msg.ItemItemId != nil {
		out = appendFieldUint64(out, 2, *msg.ItemItemId)
	}
	if msg.StickerSlot != nil {
		out = appendFieldUint32(out, 3, *msg.StickerSlot)
	}
	if msg.BaseitemDefidx != nil {
		out = appendFieldUint32(out, 4, *msg.BaseitemDefidx)
	}
	if msg.StickerWear != nil {
		out = appendFieldFloat32(out, 5, *msg.StickerWear)
	}
	if msg.StickerRotation != nil {
		out = appendFieldFloat32(out, 6, *msg.StickerRotation)
	}
	if msg.StickerScale != nil {
		out = appendFieldFloat32(out, 7, *msg.StickerScale)
	}
	if msg.StickerOffsetX != nil {
		out = appendFieldFloat32(out, 8, *msg.StickerOffsetX)
	}
	if msg.StickerOffsetY != nil {
		out = appendFieldFloat32(out, 9, *msg.StickerOffsetY)
	}
	if msg.StickerOffsetZ != nil {
		out = appendFieldFloat32(out, 10, *msg.StickerOffsetZ)
	}
	if msg.StickerWearTarget != nil {
		out = appendFieldFloat32(out, 11, *msg.StickerWearTarget)
	}
	return out, nil
}

func encodeSetItemPositions(msg *cs2pb.CMsgSetItemPositions) ([]byte, error) {
	var out []byte
	for _, position := range msg.ItemPositions {
		itemBytes := []byte{}
		if position.LegacyItemId != nil {
			itemBytes = appendFieldUint32(itemBytes, 1, *position.LegacyItemId)
		}
		if position.Position != nil {
			itemBytes = appendFieldUint32(itemBytes, 2, *position.Position)
		}
		if position.ItemId != nil {
			itemBytes = appendFieldUint64(itemBytes, 3, *position.ItemId)
		}
		out = appendFieldBytes(out, 1, itemBytes)
	}
	return out, nil
}

func appendFieldUint64(out []byte, fieldNumber int, value uint64) []byte {
	out = appendVarint(out, uint64(fieldNumber)<<3|0)
	out = appendVarint(out, value)
	return out
}

func appendFieldUint32(out []byte, fieldNumber int, value uint32) []byte {
	out = appendVarint(out, uint64(fieldNumber)<<3|0)
	out = appendVarint(out, uint64(value))
	return out
}

func appendFieldFloat32(out []byte, fieldNumber int, value float32) []byte {
	out = appendVarint(out, uint64(fieldNumber)<<3|5)
	buf := make([]byte, 4)
	binary.LittleEndian.PutUint32(buf, math.Float32bits(value))
	out = append(out, buf...)
	return out
}

func appendFieldBytes(out []byte, fieldNumber int, value []byte) []byte {
	out = appendVarint(out, uint64(fieldNumber)<<3|2)
	out = appendVarint(out, uint64(len(value)))
	out = append(out, value...)
	return out
}

func appendVarint(out []byte, value uint64) []byte {
	for value >= 0x80 {
		out = append(out, byte(value&0x7f|0x80))
		value >>= 7
	}
	out = append(out, byte(value))
	return out
}

func EncodeSupported() []string {
	return []string{"storage.move-in", "storage.move-out", "sticker.apply", "tradeup"}
}

func ValidateEncoder(input any) error {
	_, ok := input.(ApplyStickerInput)
	if !ok {
		return fmt.Errorf("unsupported input")
	}
	return nil
}
