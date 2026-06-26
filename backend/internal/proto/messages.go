package proto

type ApplyStickerInput struct {
	StickerItemID     uint64  `json:"stickerItemId"`
	ItemItemID        uint64  `json:"itemItemId"`
	StickerSlot       uint32  `json:"stickerSlot"`
	BaseItemDefidx    uint32  `json:"baseitemDefidx"`
	StickerWear       float32 `json:"stickerWear"`
	StickerRotation   float32 `json:"stickerRotation"`
	StickerScale      float32 `json:"stickerScale"`
	StickerOffsetX    float32 `json:"stickerOffsetX"`
	StickerOffsetY    float32 `json:"stickerOffsetY"`
	StickerOffsetZ    float32 `json:"stickerOffsetZ"`
	StickerWearTarget float32 `json:"stickerWearTarget"`
}

type SetItemPositionsInput struct {
	ItemPositions []SetItemPositionInput `json:"itemPositions"`
}

type SetItemPositionInput struct {
	LegacyItemID uint32 `json:"legacyItemId"`
	Position     uint32 `json:"position"`
	ItemID       uint64 `json:"itemId"`
}
