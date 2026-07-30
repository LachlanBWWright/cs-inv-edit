package domain

type ConnectionState string

const (
	ConnectionStateDisconnected    ConnectionState = "disconnected"
	ConnectionStateConnecting      ConnectionState = "connecting"
	ConnectionStateAwaitingGuard   ConnectionState = "awaiting_guard"
	ConnectionStateNeedsSteamGuard ConnectionState = "needs_steam_guard"
	ConnectionStateAwaitingQR      ConnectionState = "awaiting_qr"
	ConnectionStateConnected       ConnectionState = "connected"
	ConnectionStateError           ConnectionState = "error"
)

type SteamInventoryServiceGame struct {
	AppID           uint32 `json:"appId"`
	Name            string `json:"name"`
	PlaytimeMinutes uint32 `json:"playtimeMinutes"`
	LastPlayed      uint32 `json:"lastPlayed"`
	HasMarket       bool   `json:"hasMarket"`
}

type SteamInventoryServiceGames struct {
	Games       []SteamInventoryServiceGame `json:"games"`
	RefreshedAt string                      `json:"refreshedAt"`
	Status      string                      `json:"status"`
	Message     string                      `json:"message,omitempty"`
	Diagnostics []string                    `json:"diagnostics"`
}

type ConnectionStatus struct {
	State          ConnectionState `json:"state"`
	Detail         string          `json:"detail,omitempty"`
	SteamID        string          `json:"steamId,omitempty"`
	AccountName    string          `json:"accountName,omitempty"`
	AvatarURL      string          `json:"avatarUrl,omitempty"`
	Diagnostics    []string        `json:"diagnostics,omitempty"`
	QRChallengeURL string          `json:"qrChallengeUrl,omitempty"`
}

type Sticker struct {
	Slot      *uint32  `json:"slot,omitempty"`
	StickerID *uint32  `json:"stickerId,omitempty"`
	Wear      *float64 `json:"wear,omitempty"`
}

type AppliedItem struct {
	Kind     string   `json:"kind"`
	Slot     *uint32  `json:"slot,omitempty"`
	ID       *uint32  `json:"id,omitempty"`
	Name     string   `json:"name"`
	ImageURL string   `json:"imageUrl,omitempty"`
	Wear     *float64 `json:"wear,omitempty"`
}

type InventoryItem struct {
	ID                      string          `json:"id"`
	Name                    string          `json:"name"`
	MarketName              string          `json:"marketName,omitempty"`
	MarketPrice             string          `json:"marketPrice,omitempty"`
	MarketSalePrice         string          `json:"marketSalePrice,omitempty"`
	MarketSellListings      *int            `json:"marketSellListings,omitempty"`
	CustomName              string          `json:"customName,omitempty"`
	ImageURL                string          `json:"imageUrl,omitempty"`
	InspectURL              string          `json:"inspectUrl,omitempty"`
	Kind                    string          `json:"kind"`
	Defindex                *uint32         `json:"defindex,omitempty"`
	PaintWear               *float64        `json:"paintWear,omitempty"`
	PaintWearMin            *float64        `json:"paintWearMin,omitempty"`
	PaintWearMax            *float64        `json:"paintWearMax,omitempty"`
	Stickers                []Sticker       `json:"stickers,omitempty"`
	AppliedItems            []AppliedItem   `json:"appliedItems,omitempty"`
	IsStatTrak              bool            `json:"isStatTrak,omitempty"`
	IsSouvenir              bool            `json:"isSouvenir,omitempty"`
	Tradable                *bool           `json:"tradable,omitempty"`
	Marketable              *bool           `json:"marketable,omitempty"`
	TradableAfter           string          `json:"tradableAfter,omitempty"`
	StorageCount            *uint32         `json:"storageCount,omitempty"`
	GraffitiCharges         *uint32         `json:"graffitiCharges,omitempty"`
	CasketID                *string         `json:"casketId,omitempty"`
	Collection              string          `json:"collection,omitempty"`
	CollectionItems         []RelatedItem   `json:"collectionItems,omitempty"`
	TradeUpItems            []RelatedItem   `json:"tradeUpItems,omitempty"`
	ContainerItems          []RelatedItem   `json:"containerItems,omitempty"`
	TerminalOffers          []TerminalOffer `json:"terminalOffers,omitempty"`
	TerminalPointsRemaining *uint32         `json:"terminalPointsRemaining,omitempty"`
	Exterior                string          `json:"exterior,omitempty"`
	Rarity                  string          `json:"rarity,omitempty"`
	StorageLocation         string          `json:"storageLocation,omitempty"`
	ToolType                string          `json:"toolType,omitempty"`
	RequiredKeyDefIndexes   []uint32        `json:"requiredKeyDefIndexes,omitempty"`
	UnsupportedFields       []string        `json:"unsupportedFields,omitempty"`
	Diagnostics             []string        `json:"diagnostics,omitempty"`
	HasCustomName           bool            `json:"hasCustomName,omitempty"`
	IsNameTagTool           bool            `json:"isNameTagTool,omitempty"`
	Debug                   *ItemDebug      `json:"debug,omitempty"`
}

type TerminalOffer struct {
	FauxItemID     string      `json:"fauxItemId"`
	GenerationTime uint32      `json:"generationTime,omitempty"`
	PurchasePrice  uint32      `json:"purchasePrice,omitempty"`
	Item           RelatedItem `json:"item"`
}

type RelatedItem struct {
	Defindex    uint32        `json:"defindex,omitempty"`
	PaintKit    uint32        `json:"paintKit,omitempty"`
	Name        string        `json:"name"`
	MarketName  string        `json:"marketName,omitempty"`
	ListingName string        `json:"listingName,omitempty"`
	Kind        string        `json:"kind,omitempty"`
	Rarity      string        `json:"rarity,omitempty"`
	ImageURL    string        `json:"imageUrl,omitempty"`
	Price       string        `json:"price,omitempty"`
	PaintWear   *float64      `json:"paintWear,omitempty"`
	WearMin     *float64      `json:"wearMin,omitempty"`
	WearMax     *float64      `json:"wearMax,omitempty"`
	Items       []RelatedItem `json:"items,omitempty"`
}

type InventorySnapshot struct {
	Items       []InventoryItem `json:"items"`
	Collections []Collection    `json:"collections,omitempty"`
	RefreshedAt string          `json:"refreshedAt"`
	Status      string          `json:"status,omitempty"`
	Message     string          `json:"message,omitempty"`
	Error       string          `json:"error,omitempty"`
	Diagnostics []string        `json:"diagnostics,omitempty"`
}

type Collection struct {
	Name  string        `json:"name"`
	Items []RelatedItem `json:"items"`
}

type ArmoryOffer struct {
	CampaignID     uint32        `json:"campaignId"`
	RedeemID       uint32        `json:"redeemId"`
	ExpectedCost   uint32        `json:"expectedCost"`
	GenerationTime uint32        `json:"generationTime"`
	ItemName       string        `json:"itemName,omitempty"`
	Name           string        `json:"name,omitempty"`
	Category       string        `json:"category,omitempty"`
	Items          []RelatedItem `json:"items,omitempty"`
}

type ArmorySnapshot struct {
	Balance        uint32        `json:"balance"`
	GenerationTime uint32        `json:"generationTime"`
	ItemIDs        []string      `json:"itemIds"`
	Offers         []ArmoryOffer `json:"offers"`
	RefreshedAt    string        `json:"refreshedAt"`
	Status         string        `json:"status"`
	Message        string        `json:"message,omitempty"`
	Diagnostics    []string      `json:"diagnostics,omitempty"`
}

type StoreOffer struct {
	ID                       string        `json:"id"`
	ItemLink                 string        `json:"itemLink"`
	DefIndex                 uint32        `json:"defIndex"`
	Name                     string        `json:"name"`
	Description              string        `json:"description,omitempty"`
	ImageURL                 string        `json:"imageUrl,omitempty"`
	Category                 string        `json:"category,omitempty"`
	Rarity                   string        `json:"rarity,omitempty"`
	Currency                 string        `json:"currency"`
	AmountMinor              uint64        `json:"amountMinor"`
	FormattedPrice           string        `json:"formattedPrice"`
	SaleAmountMinor          *uint64       `json:"saleAmountMinor,omitempty"`
	FormattedSalePrice       string        `json:"formattedSalePrice,omitempty"`
	RequiresSupplementalData bool          `json:"requiresSupplementalData"`
	SupplementalDataKind     string        `json:"supplementalDataKind,omitempty"`
	PurchaseType             uint32        `json:"-"`
	Purchasable              bool          `json:"purchasable"`
	UnsupportedReason        string        `json:"unsupportedReason,omitempty"`
	Items                    []RelatedItem `json:"items,omitempty"`
}

type StoreSnapshot struct {
	Status            string       `json:"status"`
	PriceSheetVersion uint32       `json:"priceSheetVersion,omitempty"`
	Currency          string       `json:"currency,omitempty"`
	Offers            []StoreOffer `json:"offers"`
	RefreshedAt       string       `json:"refreshedAt"`
	Message           string       `json:"message,omitempty"`
	Diagnostics       []string     `json:"diagnostics,omitempty"`
}
type PurchaseSession struct {
	ID               string   `json:"id"`
	Status           string   `json:"status"`
	OfferID          string   `json:"offerId"`
	DefIndex         uint32   `json:"defIndex"`
	Name             string   `json:"name"`
	Quantity         uint32   `json:"quantity"`
	Currency         string   `json:"currency"`
	AmountMinor      uint64   `json:"amountMinor"`
	FormattedAmount  string   `json:"formattedAmount"`
	TransactionID    string   `json:"transactionId,omitempty"`
	OrderID          string   `json:"orderId,omitempty"`
	CheckoutURL      string   `json:"checkoutUrl,omitempty"`
	PurchasedItemIDs []string `json:"purchasedItemIds,omitempty"`
	CreatedAt        string   `json:"createdAt"`
	ExpiresAt        string   `json:"expiresAt,omitempty"`
	Message          string   `json:"message,omitempty"`
	Diagnostics      []string `json:"diagnostics,omitempty"`
	ErrorCode        string   `json:"errorCode,omitempty"`
	ErrorResult      *int32   `json:"errorResult,omitempty"`
}

type FeatureFlags struct {
	EnableStorageMutations    bool `json:"enableStorageMutations"`
	EnableContainerOpening    bool `json:"enableContainerOpening"`
	EnableInventoryDebug      bool `json:"enableInventoryDebug"`
	ShowStorageUnitItems      bool `json:"showStorageUnitItems"`
	EnableProtocolConsole     bool `json:"enableProtocolConsole"`
	EnableTradeups            bool `json:"enableTradeups"`
	EnableStickerExtract      bool `json:"enableStickerExtract"`
	EnableNameTags            bool `json:"enableNameTags"`
	EnableItemDeletion        bool `json:"enableItemDeletion"`
	EnableStatTrakSwap        bool `json:"enableStatTrakSwap"`
	EnableStrangeParts        bool `json:"enableStrangeParts"`
	EnableItemUse             bool `json:"enableItemUse"`
	EnableToolApplication     bool `json:"enableToolApplication"`
	EnableGifting             bool `json:"enableGifting"`
	EnableArmoryRead          bool `json:"enableArmoryRead"`
	EnableArmoryRedemption    bool `json:"enableArmoryRedemption"`
	EnableStoreRead           bool `json:"enableStoreRead"`
	EnableStorePurchases      bool `json:"enableStorePurchases"`
	EnableCS2Loadouts         bool `json:"enableCs2Loadouts"`
	EnableTF2Inventory        bool `json:"enableTf2Inventory"`
	EnableTF2Loadouts         bool `json:"enableTf2Loadouts"`
	EnableTF2ItemUse          bool `json:"enableTf2ItemUse"`
	EnableTF2Tools            bool `json:"enableTf2Tools"`
	EnableTF2Crafting         bool `json:"enableTf2Crafting"`
	EnableTF2Unboxing         bool `json:"enableTf2Unboxing"`
	EnableTF2Customization    bool `json:"enableTf2Customization"`
	EnableDota2Inventory      bool `json:"enableDota2Inventory"`
	EnableSteamInventory      bool `json:"enableSteamInventory"`
	EnableSteamTradeMutations bool `json:"enableSteamTradeMutations"`
}

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
	DefIndex uint32 `json:"defIndex,omitempty"`
	Name     string `json:"name"`
	Rarity   string `json:"rarity,omitempty"`
	PoolKind string `json:"poolKind"`
	ImageURL string `json:"imageUrl,omitempty"`
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
	Status         string                 `json:"status"`
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

type Settings struct {
	BackendURL                  string            `json:"backendUrl"`
	ValidationMode              bool              `json:"validationMode"`
	SacrificialAccountMode      bool              `json:"sacrificialAccountMode"`
	FeatureFlags                FeatureFlags      `json:"featureFlags"`
	Animations                  AnimationSettings `json:"animations"`
	ArmoryPurchasePacingSeconds uint32            `json:"armoryPurchasePacingSeconds"`
}

type AnimationSettings struct {
	Container string `json:"container"`
	TradeUp   string `json:"tradeUp"`
	Armory    string `json:"armory"`
	Terminal  string `json:"terminal"`
}
