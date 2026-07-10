package domain

type ConnectionStatus struct {
	State       string   `json:"state"`
	Detail      string   `json:"detail,omitempty"`
	SteamID     string   `json:"steamId,omitempty"`
	AccountName string   `json:"accountName,omitempty"`
	AvatarURL   string   `json:"avatarUrl,omitempty"`
	Diagnostics []string `json:"diagnostics,omitempty"`
}

type Sticker struct {
	Slot      *uint32  `json:"slot,omitempty"`
	StickerID *uint32  `json:"stickerId,omitempty"`
	Wear      *float64 `json:"wear,omitempty"`
}

type InventoryItem struct {
	ID                string    `json:"id"`
	Name              string    `json:"name"`
	MarketName        string    `json:"marketName,omitempty"`
	CustomName        string    `json:"customName,omitempty"`
	Kind              string    `json:"kind"`
	Defindex          *uint32   `json:"defindex,omitempty"`
	PaintWear         *float64  `json:"paintWear,omitempty"`
	Stickers          []Sticker `json:"stickers,omitempty"`
	StorageCount      *uint32   `json:"storageCount,omitempty"`
	CasketID          *string   `json:"casketId,omitempty"`
	Collection        string    `json:"collection,omitempty"`
	Exterior          string    `json:"exterior,omitempty"`
	Rarity            string    `json:"rarity,omitempty"`
	StorageLocation   string    `json:"storageLocation,omitempty"`
	ToolType          string    `json:"toolType,omitempty"`
	UnsupportedFields []string  `json:"unsupportedFields,omitempty"`
	HasCustomName     bool      `json:"hasCustomName,omitempty"`
	IsNameTagTool     bool      `json:"isNameTagTool,omitempty"`
}

type InventorySnapshot struct {
	Items       []InventoryItem `json:"items"`
	RefreshedAt string          `json:"refreshedAt"`
	Status      string          `json:"status,omitempty"`
	Message     string          `json:"message,omitempty"`
	Error       string          `json:"error,omitempty"`
	Diagnostics []string        `json:"diagnostics,omitempty"`
}

type FeatureFlags struct {
	EnableStorageMutations bool `json:"enableStorageMutations"`
	EnableTradeups         bool `json:"enableTradeups"`
	EnableStickerExtract   bool `json:"enableStickerExtract"`
	EnableStickerRemove    bool `json:"enableStickerRemove"`
	EnableStickerApply     bool `json:"enableStickerApply"`
	EnableNameTags         bool `json:"enableNameTags"`
	EnableItemDeletion     bool `json:"enableItemDeletion"`
	EnableStatTrakSwap     bool `json:"enableStatTrakSwap"`
	EnableStrangeParts     bool `json:"enableStrangeParts"`
	EnableItemUse          bool `json:"enableItemUse"`
	EnableToolApplication  bool `json:"enableToolApplication"`
	EnableGifting          bool `json:"enableGifting"`
}

type Settings struct {
	BackendURL             string       `json:"backendUrl"`
	ValidationMode         bool         `json:"validationMode"`
	SacrificialAccountMode bool         `json:"sacrificialAccountMode"`
	FeatureFlags           FeatureFlags `json:"featureFlags"`
}
