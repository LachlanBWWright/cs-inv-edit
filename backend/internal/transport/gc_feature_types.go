package transport

type GCInventoryItem struct {
	ID             uint64
	OriginalID     uint64
	DefIndex       uint32
	Quantity       uint32
	Quality        uint32
	Rarity         uint32
	Inventory      uint32
	CustomName     string
	PaintKit       uint32
	PaintWear      *float64
	Attributes     map[uint32]uint32
	AttributeBytes map[uint32][]byte
	EquippedStates []GCEquippedState
	InteriorItemID uint64
	Level          uint32
	Flags          uint32
	Origin         uint32
	Style          uint32
	CustomDesc     string
	VolatileOffers []GCVolatileOffer
}

type GCVolatileOffer struct {
	FauxItemID     uint64
	GenerationTime uint32
}

type GCEquippedState struct {
	Class uint32
	Slot  uint32
}

type GCArmoryOffer struct {
	CampaignID     uint32
	RedeemID       uint32
	ExpectedCost   uint32
	GenerationTime uint32
}

type GCArmorySnapshot struct {
	GenerationTime uint32
	Balance        uint32
	ItemIDs        []uint64
	Offers         []GCArmoryOffer
	Diagnostics    []string
	XpShopTypeID   int32
}

type TF2PresetItem struct {
	ClassID  uint32 `json:"classId"`
	PresetID uint32 `json:"presetId"`
	SlotID   uint32 `json:"slotId"`
	ItemID   string `json:"itemId"`
}

type TF2ClassPreset struct {
	ClassID        uint32 `json:"classId"`
	ActivePresetID uint32 `json:"activePresetId"`
}

type TF2ActivityEntry struct {
	Kind      string         `json:"kind"`
	ID        string         `json:"id,omitempty"`
	Timestamp uint32         `json:"timestamp,omitempty"`
	Data      map[string]any `json:"data"`
}

type TF2MarketEntry struct {
	DefinitionID uint32 `json:"definitionId"`
	QualityID    uint32 `json:"qualityId"`
	SellListings uint32 `json:"sellListings"`
	PriceMinor   uint32 `json:"priceMinor"`
}

type TF2InspectedAttribute struct {
	DefinitionID uint32 `json:"definitionId"`
	Value        string `json:"value,omitempty"`
	ValueBytes   string `json:"valueBytes,omitempty"`
}

type TF2InspectedEquippedState struct {
	ClassID uint32 `json:"classId"`
	SlotID  uint32 `json:"slotId"`
}

type TF2InspectedItem struct {
	ID                string                      `json:"id"`
	OriginalID        string                      `json:"originalId,omitempty"`
	DefinitionID      uint32                      `json:"definitionId"`
	Quantity          uint32                      `json:"quantity"`
	Level             uint32                      `json:"level"`
	QualityID         uint32                      `json:"qualityId"`
	Flags             uint32                      `json:"flags"`
	OriginID          uint32                      `json:"originId"`
	CustomName        string                      `json:"customName,omitempty"`
	CustomDescription string                      `json:"customDescription,omitempty"`
	Style             uint32                      `json:"style"`
	Attributes        []TF2InspectedAttribute     `json:"attributes"`
	EquippedStates    []TF2InspectedEquippedState `json:"equippedStates"`
	InteriorItem      *TF2InspectedItem           `json:"interiorItem,omitempty"`
}

type TF2FeatureSnapshot struct {
	Status         string             `json:"status"`
	RefreshedAt    string             `json:"refreshedAt"`
	PresetItems    []TF2PresetItem    `json:"presetItems"`
	ClassPresets   []TF2ClassPreset   `json:"classPresets"`
	Matches        []map[string]any   `json:"matches"`
	Ladder         []map[string]any   `json:"ladder"`
	Ratings        []map[string]any   `json:"ratings"`
	Quests         []map[string]any   `json:"quests"`
	QuestNodes     []map[string]any   `json:"questNodes"`
	QuestRewards   []map[string]any   `json:"questRewards"`
	Matchmaking    map[string]any     `json:"matchmaking,omitempty"`
	DataCenterPing map[string]any     `json:"dataCenterPing,omitempty"`
	DailyStats     map[string]any     `json:"dailyStats,omitempty"`
	Activity       []TF2ActivityEntry `json:"activity"`
	Market         []TF2MarketEntry   `json:"market"`
	InspectedItem  *TF2InspectedItem  `json:"inspectedItem,omitempty"`
	InspectedAt    string             `json:"inspectedAt,omitempty"`
	MarketAt       string             `json:"marketAt,omitempty"`
	Currency       string             `json:"currency,omitempty"`
	Diagnostics    []string           `json:"diagnostics"`
}

type CS2EquipSlot struct {
	ClassID      uint32 `json:"classId"`
	SlotID       uint32 `json:"slotId"`
	ItemID       string `json:"itemId"`
	DefinitionID uint32 `json:"definitionId"`
}

type CS2ActivityEntry struct {
	Kind      string         `json:"kind"`
	ID        string         `json:"id,omitempty"`
	Timestamp uint32         `json:"timestamp,omitempty"`
	Data      map[string]any `json:"data"`
}

type CS2FeatureSnapshot struct {
	Status             string             `json:"status"`
	RefreshedAt        string             `json:"refreshedAt,omitempty"`
	EquipSlots         []CS2EquipSlot     `json:"equipSlots"`
	Matches            []map[string]any   `json:"matches"`
	Profile            map[string]any     `json:"profile,omitempty"`
	Premier            map[string]any     `json:"premier,omitempty"`
	DeepStats          map[string]any     `json:"deepStats,omitempty"`
	SearchStats        map[string]any     `json:"searchStats,omitempty"`
	InspectedItem      map[string]any     `json:"inspectedItem,omitempty"`
	InspectedAt        string             `json:"inspectedAt,omitempty"`
	Rentals            []map[string]any   `json:"rentals"`
	Quests             []map[string]any   `json:"quests"`
	RecurringMissions  []map[string]any   `json:"recurringMissions"`
	SeasonalOperations []map[string]any   `json:"seasonalOperations"`
	XPShop             map[string]any     `json:"xpShop,omitempty"`
	RecurringSchema    map[string]any     `json:"recurringSchema,omitempty"`
	Activity           []CS2ActivityEntry `json:"activity"`
	Diagnostics        []string           `json:"diagnostics"`
}
