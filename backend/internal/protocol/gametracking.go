package protocol

type MessageMapping struct {
	Operation     string   `json:"operation"`
	RequestEMsg   uint32   `json:"requestEmsg"`
	RequestBody   string   `json:"requestBody"`
	ResponseEMsgs []uint32 `json:"responseEMsgs,omitempty"`
	Source        string   `json:"source"`
	Status        string   `json:"status"`
	FeatureFlag   string   `json:"featureFlag,omitempty"`
	Notes         string   `json:"notes,omitempty"`
}

var operationMessageMappings = map[string]MessageMapping{
	"store.refresh":             {Operation: "store.refresh", RequestEMsg: EMsgStoreGetUserData, RequestBody: "CMsgStoreGetUserData", ResponseEMsgs: []uint32{EMsgStoreGetUserDataResponse}, Source: "proto/vendor/gametracking-cs2/Protobufs/base_gcmessages.proto", Status: "exact", FeatureFlag: "enableStoreRead", Notes: "Loads the versioned, compressed GC cash-store price sheet."},
	"store.purchase.initialize": {Operation: "store.purchase.initialize", RequestEMsg: EMsgStorePurchaseInit, RequestBody: "CMsgGCStorePurchaseInit", ResponseEMsgs: []uint32{EMsgStorePurchaseInitResponse}, Source: "proto/vendor/gametracking-cs2/Protobufs/base_gcmessages.proto", Status: "exact", FeatureFlag: "enableStorePurchases", Notes: "The GC response establishes whether initialization was accepted and supplies its order/transaction identifier. Any later Steam authorization handoff is observed independently; it is not assumed to arrive as one specific CM message."},
	"storage.load": {
		Operation:     "storage.load",
		RequestEMsg:   EMsgCasketItemLoadContents,
		RequestBody:   "CMsgCasketItem",
		ResponseEMsgs: []uint32{EMsgItemCustomizationNotification},
		Source:        "proto/vendor/gametracking-cs2/Protobufs/econ_gcmessages.proto",
		Status:        "shared",
		FeatureFlag:   "enableStorageMutations",
		Notes:         "Load casket contents via the same compatible body used for storage mutations.",
	},
	"storage.move-in": {
		Operation:     "storage.move-in",
		RequestEMsg:   EMsgCasketItemAdd,
		RequestBody:   "CMsgCasketItem",
		ResponseEMsgs: []uint32{EMsgItemCustomizationNotification},
		Source:        "proto/vendor/gametracking-cs2/Protobufs/econ_gcmessages.proto",
		Status:        "shared",
		FeatureFlag:   "enableStorageMutations",
		Notes:         "Adds an item into a casket/storage container using the casket item protobuf body.",
	},
	"storage.move-out": {
		Operation:     "storage.move-out",
		RequestEMsg:   EMsgCasketItemExtract,
		RequestBody:   "CMsgCasketItem",
		ResponseEMsgs: []uint32{EMsgItemCustomizationNotification},
		Source:        "proto/vendor/gametracking-cs2/Protobufs/econ_gcmessages.proto",
		Status:        "shared",
		FeatureFlag:   "enableStorageMutations",
		Notes:         "Extracts an item from a casket/storage container using the casket item protobuf body.",
	},
	"containers.open": {
		Operation:     "containers.open",
		RequestEMsg:   EMsgOpenCrate,
		RequestBody:   "CMsgOpenCrate",
		ResponseEMsgs: []uint32{EMsgUnlockCrateResponse, EMsgItemCustomizationNotification},
		Source:        "proto/vendor/gametracking-cs2/Protobufs/base_gcmessages.proto",
		Status:        "exact",
		FeatureFlag:   "enableContainerOpening",
		Notes:         "Uses the open-crate request body and customisation notifications for container unlock responses.",
	},
	"nametags.apply": {
		Operation:   "nametags.apply",
		RequestEMsg: EMsgSetItemName,
		RequestBody: "CMsgSetItemName",
		Source:      "proto/vendor/gametracking-cs2/Protobufs/base_gcmessages.proto",
		Status:      "exact",
		FeatureFlag: "enableNameTags",
		Notes:       "Names an owned item using the item-customization naming request body.",
	},
	"nametags.remove": {
		Operation:   "nametags.remove",
		RequestEMsg: EMsgRemoveItemName,
		RequestBody: "CMsgRemoveItemName",
		Source:      "proto/vendor/gametracking-cs2/Protobufs/base_gcmessages.proto",
		Status:      "exact",
		FeatureFlag: "enableNameTags",
		Notes:       "Removes an existing custom name from an owned item.",
	},
	"items.delete": {
		Operation:   "items.delete",
		RequestEMsg: EMsgDeleteItem,
		RequestBody: "CMsgDeleteItem",
		Source:      "proto/vendor/gametracking-cs2/Protobufs/base_gcmessages.proto",
		Status:      "exact",
		FeatureFlag: "enableItemDeletion",
		Notes:       "Deletes an owned item using the destructive GC delete body.",
	},
	"stattrak.swap": {
		Operation:   "stattrak.swap",
		RequestEMsg: EMsgStatTrakSwap,
		RequestBody: "CMsgApplyStatTrakSwap",
		Source:      "proto/vendor/gametracking-cs2/Protobufs/base_gcmessages.proto",
		Status:      "exact",
		FeatureFlag: "enableStatTrakSwap",
		Notes:       "Applies a StatTrak swap between two items using the matching GC protobuf body.",
	},
	"strange-parts.apply": {
		Operation:   "strange-parts.apply",
		RequestEMsg: EMsgApplyStrangePart,
		RequestBody: "CMsgApplyStrangePart",
		Source:      "proto/vendor/gametracking-cs2/Protobufs/base_gcmessages.proto",
		Status:      "exact",
		FeatureFlag: "enableStrangeParts",
		Notes:       "Applies a strange part to a target item using the strange-part protobuf body.",
	},
	"items.use": {
		Operation:   "items.use",
		RequestEMsg: EMsgUseItemRequest,
		RequestBody: "CMsgUseItem",
		Source:      "proto/vendor/gametracking-cs2/Protobufs/base_gcmessages.proto",
		Status:      "exact",
		FeatureFlag: "enableItemUse",
		Notes:       "Uses a consumable or item with the item-use protobuf body.",
	},
	"items.use-multiple": {
		Operation:   "items.use-multiple",
		RequestEMsg: EMsgUseItemRequest,
		RequestBody: "CMsgUseMultipleItems",
		Source:      "proto/vendor/gametracking-cs2/Protobufs/base_gcmessages.proto",
		Status:      "exact",
		FeatureFlag: "enableItemUse",
		Notes:       "Uses multiple items with the multi-use protobuf body.",
	},
	"tools.apply": {
		Operation:   "tools.apply",
		RequestEMsg: EMsgUseItemRequest,
		RequestBody: "CMsgApplyToolToItem",
		Source:      "proto/vendor/gametracking-cs2/Protobufs/base_gcmessages.proto",
		Status:      "exact",
		FeatureFlag: "enableToolApplication",
		Notes:       "Applies a tool item to a target item using the tool-application protobuf body.",
	},
	"tools.apply-base": {
		Operation:   "tools.apply-base",
		RequestEMsg: EMsgUseItemRequest,
		RequestBody: "CMsgApplyToolToBaseItem",
		Source:      "proto/vendor/gametracking-cs2/Protobufs/base_gcmessages.proto",
		Status:      "exact",
		FeatureFlag: "enableToolApplication",
		Notes:       "Applies a tool item to a base item definition using the base-item tool protobuf body.",
	},
	"gifts.send": {
		Operation:   "gifts.send",
		RequestEMsg: EMsgGiftItem,
		RequestBody: "CMsgGiftItem",
		Source:      "proto/vendor/gametracking-cs2/Protobufs/econ_gcmessages.proto",
		Status:      "exact",
		FeatureFlag: "enableGifting",
		Notes:       "Sends a gift item to a Steam account using the gift protobuf body.",
	},
	"tradeups.preview": {
		Operation:   "tradeups.preview",
		RequestEMsg: EMsgCraft,
		RequestBody: "raw craft payload (little-endian recipe + item ids)",
		Source:      "proto/vendor/gametracking-cs2/Protobufs/econ_gcmessages.proto",
		Status:      "exact",
		FeatureFlag: "enableTradeups",
		Notes:       "Uses the raw little-endian trade-up craft payload rather than a protobuf body; the payload layout is recipe, item count, and item ids.",
	},
	"tradeups.execute": {
		Operation:   "tradeups.execute",
		RequestEMsg: EMsgCraft,
		RequestBody: "raw craft payload (little-endian recipe + item ids)",
		Source:      "proto/vendor/gametracking-cs2/Protobufs/econ_gcmessages.proto",
		Status:      "exact",
		FeatureFlag: "enableTradeups",
		Notes:       "Uses the raw little-endian trade-up craft payload rather than a protobuf body; the payload layout is recipe, item count, and item ids.",
	},
}

func OperationMessageMapping(opType string) (MessageMapping, bool) {
	mapping, ok := operationMessageMappings[opType]
	return mapping, ok
}
