package econ

type Schema struct {
	items                   map[uint32]itemDefinition
	paintKits               map[uint32]paintKitDefinition
	stickerKits             map[uint32]stickerKitDefinition
	musicDefinitions        map[uint32]musicDefinition
	keychains               map[uint32]keychainDefinition
	tokens                  map[string]string
	collections             map[string]collectionDefinition
	collectionByItem        map[string]string
	lootLists               map[string][]string
	revolvingLootLists      map[string]string
	rareSpecialByContainer  map[uint32][]RelatedItem
	rareSpecialByCollection map[string][]RelatedItem
	rareSpecialQualities    map[string]map[string]bool
	imageURLs               map[string]string
	armoryOffers            []ArmoryOffer
	attributes              map[uint32]econAttributeDefinition
	quests                  map[uint32]QuestDefinition
}

type ArmoryOffer struct {
	CampaignID   uint32
	RedeemID     uint32
	ExpectedCost uint32
	ItemName     string
	Name         string
	Category     string
	Items        []RelatedItem
}

type itemDefinition struct {
	Name                  string
	ItemName              string
	TypeName              string
	ItemClass             string
	Prefab                string
	Rarity                string
	Image                 string
	ToolType              string
	Capabilities          map[string]string
	LootList              string
	SupplyCrateSeries     string
	IsVolatileContainer   bool
	RequiredKeyDefIndexes []uint32
}
