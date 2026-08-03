package protocol

const (
	AppIDTF2 uint32 = 440

	TF2EMsgSetSingleItemPosition     uint32 = 1001
	TF2EMsgCraft                     uint32 = 1002
	TF2EMsgCraftResponse             uint32 = 1003
	TF2EMsgDelete                    uint32 = 1004
	TF2EMsgUnlockCrate               uint32 = 1007
	TF2EMsgUnlockCrateResponse       uint32 = 1008
	TF2EMsgUseItem                   uint32 = 1025
	TF2EMsgUseItemResponse           uint32 = 1026
	TF2EMsgCustomizeItemTexture      uint32 = 1023
	TF2EMsgCustomizeTextureResponse  uint32 = 1024
	TF2EMsgSortItems                 uint32 = 1041
	TF2EMsgAdjustItemEquippedState   uint32 = 1059
	TF2EMsgSelectPresetForClass      uint32 = 1063
	TF2EMsgSetPresetItemPosition     uint32 = 1064
	TF2EMsgApplyStrangePart          uint32 = 1070
	TF2EMsgRemoveStrangePart         uint32 = 1073
	TF2EMsgResetStrangeScores        uint32 = 1074
	TF2EMsgApplyStrangeRestriction   uint32 = 1079
	TF2EMsgClientMarketDataRequest   uint32 = 1080
	TF2EMsgClientMarketDataResponse  uint32 = 1081
	TF2EMsgApplyStrangeCountTransfer uint32 = 2566
	TF2EMsgCraftCollectionUpgrade    uint32 = 2567
	TF2EMsgCraftHalloweenOffering    uint32 = 2568
	TF2EMsgSetItemPositions          uint32 = 1100
	TF2EMsgEconPreviewRequest        uint32 = 6402
	TF2EMsgEconPreviewResponse       uint32 = 6403
	TF2EMsgMatchHistoryLoad          uint32 = 6526
	TF2EMsgMatchMakerStatsRequest    uint32 = 6524
	TF2EMsgNotificationAcknowledge   uint32 = 6529
	TF2EMsgQuestProgressReport       uint32 = 6553
)

type TF2OperationProtocol struct {
	EMsg        uint32
	Protobuf    bool
	FeatureFlag string
	Verified    bool
	Reason      string
}

func TF2OperationMapping(operation string) (TF2OperationProtocol, bool) {
	mappings := map[string]TF2OperationProtocol{
		"tf2.loadout.equip":             {EMsg: TF2EMsgAdjustItemEquippedState, Protobuf: true, FeatureFlag: "enableTf2Loadouts", Verified: true},
		"tf2.loadout.set-preset-item":   {EMsg: TF2EMsgSetPresetItemPosition, Protobuf: true, FeatureFlag: "enableTf2Loadouts", Verified: true},
		"tf2.loadout.select-preset":     {EMsg: TF2EMsgSelectPresetForClass, Protobuf: true, FeatureFlag: "enableTf2Loadouts", Verified: true},
		"tf2.backpack.sort":             {EMsg: TF2EMsgSortItems, Protobuf: true, FeatureFlag: "enableTf2Loadouts", Verified: true},
		"tf2.items.use":                 {EMsg: TF2EMsgUseItem, Protobuf: true, FeatureFlag: "enableTf2ItemUse", Verified: true},
		"tf2.tools.strange-part":        {EMsg: TF2EMsgApplyStrangePart, Protobuf: true, FeatureFlag: "enableTf2Tools", Verified: true},
		"tf2.tools.strange-restriction": {EMsg: TF2EMsgApplyStrangeRestriction, Protobuf: true, FeatureFlag: "enableTf2Tools", Verified: true},
		"tf2.tools.strange-transfer":    {EMsg: TF2EMsgApplyStrangeCountTransfer, Protobuf: true, FeatureFlag: "enableTf2Tools", Verified: true},
		"tf2.tools.strange-remove":      {EMsg: TF2EMsgRemoveStrangePart, Protobuf: true, FeatureFlag: "enableTf2Tools", Verified: true},
		"tf2.tools.strange-reset":       {EMsg: TF2EMsgResetStrangeScores, Protobuf: true, FeatureFlag: "enableTf2Tools", Verified: true},
		"tf2.matches.load":              {EMsg: TF2EMsgMatchHistoryLoad, Protobuf: true, FeatureFlag: "enableTf2Inventory", Verified: true},
		"tf2.matches.stats":             {EMsg: TF2EMsgMatchMakerStatsRequest, Protobuf: true, FeatureFlag: "enableTf2Inventory", Verified: true},
		"tf2.inspect.resolve":           {EMsg: TF2EMsgEconPreviewRequest, Protobuf: true, FeatureFlag: "enableTf2Inventory", Verified: true},
		"tf2.market.refresh":            {EMsg: TF2EMsgClientMarketDataRequest, Protobuf: true, FeatureFlag: "enableTf2Inventory", Verified: true},
		"tf2.customization.decal-apply": {EMsg: TF2EMsgCustomizeItemTexture, Protobuf: false, FeatureFlag: "enableTf2Customization", Verified: true},
		"tf2.crafting.craft":            {EMsg: TF2EMsgCraft, Protobuf: false, FeatureFlag: "enableTf2Crafting", Verified: false, Reason: "the current TF2 protobuf dump defines only the EMsg and response body; the permanent request layout requires a verified capture"},
		"tf2.containers.open":           {EMsg: TF2EMsgUnlockCrate, Protobuf: false, FeatureFlag: "enableTf2Unboxing", Verified: false, Reason: "the current TF2 protobuf dump contains no UnlockCrate request body; a verified capture is required"},
	}
	mapping, ok := mappings[operation]
	return mapping, ok
}
