package transport

// RawFeatureData is deliberately untyped data from a GC shared object whose
// schema is not stable or fully known. Stable fields in the snapshots below
// use concrete DTOs; this alias makes the remaining dynamic boundary explicit.
type RawFeatureData = map[string]any

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
	Data      RawFeatureData `json:"data"`
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
	Matches        []RawFeatureData   `json:"matches"`
	Ladder         []RawFeatureData   `json:"ladder"`
	Ratings        []RawFeatureData   `json:"ratings"`
	Quests         []RawFeatureData   `json:"quests"`
	QuestNodes     []RawFeatureData   `json:"questNodes"`
	QuestRewards   []RawFeatureData   `json:"questRewards"`
	Matchmaking    RawFeatureData     `json:"matchmaking,omitempty"`
	DataCenterPing RawFeatureData     `json:"dataCenterPing,omitempty"`
	DailyStats     RawFeatureData     `json:"dailyStats,omitempty"`
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
	Data      RawFeatureData `json:"data"`
}

type CS2FeatureSnapshot struct {
	Status             string             `json:"status"`
	RefreshedAt        string             `json:"refreshedAt,omitempty"`
	EquipSlots         []CS2EquipSlot     `json:"equipSlots"`
	Matches            []RawFeatureData   `json:"matches"`
	Profile            RawFeatureData     `json:"profile,omitempty"`
	Premier            RawFeatureData     `json:"premier,omitempty"`
	DeepStats          RawFeatureData     `json:"deepStats,omitempty"`
	SearchStats        RawFeatureData     `json:"searchStats,omitempty"`
	InspectedItem      RawFeatureData     `json:"inspectedItem,omitempty"`
	InspectedAt        string             `json:"inspectedAt,omitempty"`
	Rentals            []RawFeatureData   `json:"rentals"`
	Quests             []RawFeatureData   `json:"quests"`
	RecurringMissions  []RawFeatureData   `json:"recurringMissions"`
	SeasonalOperations []RawFeatureData   `json:"seasonalOperations"`
	XPShop             RawFeatureData     `json:"xpShop,omitempty"`
	RecurringSchema    RawFeatureData     `json:"recurringSchema,omitempty"`
	Activity           []CS2ActivityEntry `json:"activity"`
	Diagnostics        []string           `json:"diagnostics"`
}
