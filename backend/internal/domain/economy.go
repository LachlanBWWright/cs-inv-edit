package domain

type EconomyTag struct {
	Category     string `json:"category"`
	InternalName string `json:"internalName"`
	Name         string `json:"name"`
}

type EconomyItemDetails struct {
	Game                string            `json:"game"`
	Level               uint32            `json:"level"`
	QualityID           uint32            `json:"qualityId"`
	InventoryPosition   uint32            `json:"inventoryPosition"`
	OriginID            uint32            `json:"originId"`
	Style               uint32            `json:"style"`
	Flags               uint32            `json:"flags"`
	CustomName          string            `json:"customName,omitempty"`
	CustomDescription   string            `json:"customDescription,omitempty"`
	Attributes          map[string]uint32 `json:"attributes"`
	AttributeBytes      map[string]string `json:"attributeBytes,omitempty"`
	EquippedStates      []EquippedState   `json:"equippedStates,omitempty"`
	InteriorItemID      string            `json:"interiorItemId,omitempty"`
	SchemaQuality       string            `json:"schemaQuality,omitempty"`
	EquipSlot           string            `json:"equipSlot,omitempty"`
	UsableClasses       []string          `json:"usableClasses,omitempty"`
	Capabilities        map[string]string `json:"capabilities,omitempty"`
	ItemKind            string            `json:"itemKind,omitempty"`
	ItemClass           string            `json:"itemClass,omitempty"`
	CraftClass          string            `json:"craftClass,omitempty"`
	CraftMaterialType   string            `json:"craftMaterialType,omitempty"`
	ToolType            string            `json:"toolType,omitempty"`
	Description         string            `json:"description,omitempty"`
	Collection          string            `json:"collection,omitempty"`
	EquipRegions        []string          `json:"equipRegions,omitempty"`
	SchemaTags          []string          `json:"schemaTags,omitempty"`
	MinLevel            uint32            `json:"minLevel,omitempty"`
	MaxLevel            uint32            `json:"maxLevel,omitempty"`
	ProperName          bool              `json:"properName,omitempty"`
	BaseItem            bool              `json:"baseItem,omitempty"`
	Hidden              bool              `json:"hidden,omitempty"`
	StaticAttributes    map[string]string `json:"staticAttributes,omitempty"`
	Rarity              string            `json:"rarity,omitempty"`
	EquipConflicts      []string          `json:"equipConflicts,omitempty"`
	LoadoutSlots        map[string]string `json:"loadoutSlots,omitempty"`
	PrefabChain         []string          `json:"prefabChain,omitempty"`
	ContainerItems      []TF2RelatedItem  `json:"containerItems,omitempty"`
	TradeUpItems        []TF2RelatedItem  `json:"tradeUpItems,omitempty"`
	DecodedAttributes   []TF2Attribute    `json:"decodedAttributes,omitempty"`
	Hero                string            `json:"hero,omitempty"`
	Slot                string            `json:"slot,omitempty"`
	ServiceItemID       string            `json:"serviceItemId,omitempty"`
	ServiceDefinitionID string            `json:"serviceDefinitionId,omitempty"`
	AcquiredAt          string            `json:"acquiredAt,omitempty"`
	StateChangedAt      string            `json:"stateChangedAt,omitempty"`
	ServiceState        string            `json:"serviceState,omitempty"`
	ServiceOrigin       string            `json:"serviceOrigin,omitempty"`
	DynamicProperties   map[string]string `json:"dynamicProperties,omitempty"`
}

type TF2RelatedItem struct {
	DefIndex uint32      `json:"defIndex,omitempty"`
	Name     string      `json:"name"`
	Rarity   string      `json:"rarity,omitempty"`
	PoolKind TF2PoolKind `json:"poolKind"`
	ImageURL string      `json:"imageUrl,omitempty"`
}

type TF2Attribute struct {
	DefIndex       uint32 `json:"defIndex"`
	Name           string `json:"name"`
	Value          string `json:"value"`
	EffectType     string `json:"effectType,omitempty"`
	Hidden         bool   `json:"hidden,omitempty"`
	AttributeClass string `json:"attributeClass,omitempty"`
}

type EquippedState struct {
	Class uint32 `json:"class"`
	Slot  uint32 `json:"slot"`
}

type EconomyInventoryItem struct {
	Game          string             `json:"game"`
	AppID         uint32             `json:"appId"`
	ContextID     string             `json:"contextId,omitempty"`
	AssetID       string             `json:"assetId"`
	ClassID       string             `json:"classId,omitempty"`
	InstanceID    string             `json:"instanceId,omitempty"`
	DefinitionID  *uint32            `json:"definitionId,omitempty"`
	Name          string             `json:"name"`
	MarketName    string             `json:"marketName,omitempty"`
	ImageURL      string             `json:"imageUrl,omitempty"`
	InspectURL    string             `json:"inspectUrl,omitempty"`
	Quantity      uint64             `json:"quantity"`
	Type          string             `json:"type,omitempty"`
	Rarity        string             `json:"rarity,omitempty"`
	Quality       string             `json:"quality,omitempty"`
	Tradable      bool               `json:"tradable"`
	Marketable    bool               `json:"marketable"`
	TradableAfter string             `json:"tradableAfter,omitempty"`
	Tags          []EconomyTag       `json:"tags"`
	Descriptions  []string           `json:"descriptions,omitempty"`
	Details       EconomyItemDetails `json:"details"`
}

type GameInventorySnapshot struct {
	Game           string                 `json:"game"`
	AppID          uint32                 `json:"appId"`
	Items          []EconomyInventoryItem `json:"items"`
	RefreshedAt    string                 `json:"refreshedAt"`
	Status         SnapshotStatus         `json:"status"`
	Message        string                 `json:"message,omitempty"`
	Error          string                 `json:"error,omitempty"`
	SchemaRevision string                 `json:"schemaRevision,omitempty"`
	Diagnostics    []string               `json:"diagnostics"`
}

type ItemDebug struct {
	GCID                  string            `json:"gcId,omitempty"`
	GCOriginalID          string            `json:"gcOriginalId,omitempty"`
	GCDefIndex            uint32            `json:"gcDefIndex,omitempty"`
	GCInventory           uint32            `json:"gcInventory,omitempty"`
	GCQuantity            uint32            `json:"gcQuantity,omitempty"`
	GCQuality             uint32            `json:"gcQuality,omitempty"`
	GCRarity              uint32            `json:"gcRarity,omitempty"`
	GCPaintKit            uint32            `json:"gcPaintKit,omitempty"`
	DescriptionMatched    bool              `json:"descriptionMatched"`
	MarketDescriptionUsed bool              `json:"marketDescriptionUsed"`
	Attributes            map[string]uint32 `json:"attributes,omitempty"`
}
