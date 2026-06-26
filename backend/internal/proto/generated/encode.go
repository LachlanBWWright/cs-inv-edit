package cs2pb

import (
	"encoding/binary"
	"fmt"
	"math"
)

func EncodeCasketItem(casketID, itemID uint64) ([]byte, error) {
	buf := make([]byte, 16)
	binary.LittleEndian.PutUint64(buf[0:8], casketID)
	binary.LittleEndian.PutUint64(buf[8:16], itemID)
	return buf, nil
}

func EncodeLoadCasketContents(casketID uint64) ([]byte, error) {
	return EncodeCasketItem(casketID, 0)
}

func EncodeExtractSticker(itemID uint64, slot uint32) ([]byte, error) {
	msg := CMsgGCItemCustomizationNotification{ItemID: []uint64{itemID}, Request: 1054, ExtraData: []uint64{uint64(slot)}}
	return msg.marshalBinary()
}

func EncodeRemoveSticker(itemID uint64, slot uint32) ([]byte, error) {
	msg := CMsgGCItemCustomizationNotification{ItemID: []uint64{itemID}, Request: 1053, ExtraData: []uint64{uint64(slot)}}
	return msg.marshalBinary()
}

func EncodeApplySticker(input ApplyStickerInput) ([]byte, error) {
	msg := CMsgApplySticker{
		StickerItemID:     input.StickerItemID,
		ItemItemID:        input.ItemItemID,
		StickerSlot:       input.StickerSlot,
		BaseitemDefidx:    input.BaseitemDefidx,
		StickerWear:       input.StickerWear,
		StickerRotation:   input.StickerRotation,
		StickerScale:      input.StickerScale,
		StickerOffsetX:    input.StickerOffsetX,
		StickerOffsetY:    input.StickerOffsetY,
		StickerOffsetZ:    input.StickerOffsetZ,
		StickerWearTarget: input.StickerWearTarget,
	}
	return msg.marshalBinary()
}

func EncodeSetItemPositions(itemPositions []ItemPosition) ([]byte, error) {
	msg := CMsgSetItemPositions{ItemPositions: itemPositions}
	return msg.marshalBinary()
}

func (m CMsgApplySticker) marshalBinary() ([]byte, error) {
	buf := make([]byte, 0, 80)
	buf = binary.LittleEndian.AppendUint64(buf, m.StickerItemID)
	buf = binary.LittleEndian.AppendUint64(buf, m.ItemItemID)
	buf = binary.LittleEndian.AppendUint32(buf, m.StickerSlot)
	buf = binary.LittleEndian.AppendUint32(buf, m.BaseitemDefidx)
	buf = append(buf, float32ToBytes(m.StickerWear)...)
	buf = append(buf, float32ToBytes(m.StickerRotation)...)
	buf = append(buf, float32ToBytes(m.StickerScale)...)
	buf = append(buf, float32ToBytes(m.StickerOffsetX)...)
	buf = append(buf, float32ToBytes(m.StickerOffsetY)...)
	buf = append(buf, float32ToBytes(m.StickerOffsetZ)...)
	buf = append(buf, float32ToBytes(m.StickerWearTarget)...)
	return buf, nil
}

func (m CMsgGCItemCustomizationNotification) marshalBinary() ([]byte, error) {
	if len(m.ItemID) == 0 {
		return nil, fmt.Errorf("item ids are required")
	}
	buf := make([]byte, 0, 8+4+8*len(m.ItemID)+8*len(m.ExtraData))
	buf = binary.LittleEndian.AppendUint32(buf, uint32(len(m.ItemID)))
	for _, id := range m.ItemID {
		buf = binary.LittleEndian.AppendUint64(buf, id)
	}
	buf = binary.LittleEndian.AppendUint32(buf, m.Request)
	buf = binary.LittleEndian.AppendUint32(buf, uint32(len(m.ExtraData)))
	for _, id := range m.ExtraData {
		buf = binary.LittleEndian.AppendUint64(buf, id)
	}
	return buf, nil
}

func (m CMsgSetItemPositions) marshalBinary() ([]byte, error) {
	buf := make([]byte, 0, 32)
	buf = binary.LittleEndian.AppendUint32(buf, uint32(len(m.ItemPositions)))
	for _, position := range m.ItemPositions {
		buf = binary.LittleEndian.AppendUint32(buf, position.LegacyItemID)
		buf = binary.LittleEndian.AppendUint32(buf, position.Position)
		buf = binary.LittleEndian.AppendUint64(buf, position.ItemID)
	}
	return buf, nil
}

func float32ToBytes(value float32) []byte {
	buf := make([]byte, 4)
	binary.LittleEndian.PutUint32(buf, math.Float32bits(value))
	return buf
}
