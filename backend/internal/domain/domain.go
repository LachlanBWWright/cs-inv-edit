package domain

type ConnectionStatus struct {
	State  string `json:"state"`
	Detail string `json:"detail,omitempty"`
}

type Sticker struct {
	Slot      *uint32  `json:"slot,omitempty"`
	StickerID *uint32  `json:"stickerId,omitempty"`
	Wear      *float64 `json:"wear,omitempty"`
}

type InventoryItem struct {
	ID                string    `json:"id"`
	Name              string    `json:"name"`
	Kind              string    `json:"kind"`
	Defindex          *uint32   `json:"defindex,omitempty"`
	PaintWear         *float64  `json:"paintWear,omitempty"`
	Stickers          []Sticker `json:"stickers,omitempty"`
	StorageCount      *uint32   `json:"storageCount,omitempty"`
	CasketID          *string   `json:"casketId,omitempty"`
	UnsupportedFields []string  `json:"unsupportedFields,omitempty"`
}

type InventorySnapshot struct {
	Items       []InventoryItem `json:"items"`
	RefreshedAt string          `json:"refreshedAt"`
}

type FeatureFlags struct {
	EnableStorageMutations bool `json:"enableStorageMutations"`
	EnableTradeups         bool `json:"enableTradeups"`
	EnableStickerExtract   bool `json:"enableStickerExtract"`
	EnableStickerRemove    bool `json:"enableStickerRemove"`
	EnableStickerApply     bool `json:"enableStickerApply"`
}

type Settings struct {
	BackendURL             string       `json:"backendUrl"`
	ValidationMode         bool         `json:"validationMode"`
	SacrificialAccountMode bool         `json:"sacrificialAccountMode"`
	FeatureFlags           FeatureFlags `json:"featureFlags"`
}
