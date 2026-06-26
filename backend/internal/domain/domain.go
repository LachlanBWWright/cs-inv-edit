package domain

type HealthStatus struct {
	Status  string `json:"status"`
	Service string `json:"service"`
	Version string `json:"version"`
	Time    string `json:"time"`
}

type ConnectionStatus struct {
	State  string `json:"state"`
	Detail string `json:"detail,omitempty"`
}

type FeatureSettings struct {
	EnableStorageMutations bool `json:"enableStorageMutations"`
	EnableTradeups         bool `json:"enableTradeups"`
	EnableStickerExtract   bool `json:"enableStickerExtract"`
	EnableStickerRemove    bool `json:"enableStickerRemove"`
	EnableStickerApply     bool `json:"enableStickerApply"`
	ValidationMode         bool `json:"validationMode"`
	SacrificialAccountMode bool `json:"sacrificialAccountMode"`
}

type InventoryItem struct {
	ID           string    `json:"id"`
	Name         string    `json:"name"`
	Kind         string    `json:"kind"`
	Defindex     *uint32   `json:"defindex,omitempty"`
	PaintWear    *float64  `json:"paintWear,omitempty"`
	StorageCount *uint32   `json:"storageCount,omitempty"`
	CasketID     *string   `json:"casketId,omitempty"`
	Stickers     []Sticker `json:"stickers,omitempty"`
}

type Sticker struct {
	ID   string `json:"id,omitempty"`
	Name string `json:"name,omitempty"`
	Slot *int   `json:"slot,omitempty"`
}

type InventorySnapshot struct {
	Items       []InventoryItem `json:"items"`
	RefreshedAt string          `json:"refreshedAt"`
}

type EncodedMetadata struct {
	AppID    int    `json:"appid,omitempty"`
	EMsg     int    `json:"emsg,omitempty"`
	BodyHash string `json:"bodyHash,omitempty"`
}

type OperationReceipt struct {
	OperationID string           `json:"operationId"`
	Type        string           `json:"type"`
	State       string           `json:"state"`
	CreatedAt   string           `json:"createdAt"`
	Message     string           `json:"message,omitempty"`
	Encoded     *EncodedMetadata `json:"encoded,omitempty"`
}

type OperationEvent struct {
	OperationID string `json:"operationId"`
	Type        string `json:"type"`
	State       string `json:"state"`
	Message     string `json:"message,omitempty"`
	CreatedAt   string `json:"createdAt"`
}

type Event struct {
	Type      string `json:"type"`
	Payload   any    `json:"payload"`
	CreatedAt string `json:"createdAt"`
}
