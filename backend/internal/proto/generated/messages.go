package cs2pb

type CMsgApplySticker struct {
	StickerItemID     uint64
	ItemItemID        uint64
	StickerSlot       uint32
	BaseitemDefidx    uint32
	StickerWear       float32
	StickerRotation   float32
	StickerScale      float32
	StickerOffsetX    float32
	StickerOffsetY    float32
	StickerOffsetZ    float32
	StickerWearTarget float32
}

type CMsgGCItemCustomizationNotification struct {
	ItemID    []uint64
	Request   uint32
	ExtraData []uint64
}

type CMsgCasketItem struct {
	CasketItemID uint64
	ItemItemID   uint64
}

type ItemPosition struct {
	LegacyItemID uint32
	Position     uint32
	ItemID       uint64
}

type CMsgSetItemPositions struct {
	ItemPositions []ItemPosition
}

type ApplyStickerInput struct {
	StickerItemID     uint64
	ItemItemID        uint64
	StickerSlot       uint32
	BaseitemDefidx    uint32
	StickerWear       float32
	StickerRotation   float32
	StickerScale      float32
	StickerOffsetX    float32
	StickerOffsetY    float32
	StickerOffsetZ    float32
	StickerWearTarget float32
}
