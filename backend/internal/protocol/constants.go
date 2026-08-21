package protocol

import (
	"cs-inv-edit/backend/internal/proto/gametracking"
)

// SteamTracking/GameTracking-CS2 Protobufs/gcsystemmsgs.proto, enum ESOMsg.
const (
	EMsgSOCreate          uint32 = 21
	EMsgSOUpdate          uint32 = 22
	EMsgSOSingleObject    uint32 = 23
	EMsgSOCacheSubscribed uint32 = 24
	EMsgSOUpdateMultiple  uint32 = 26
)

var (
	EMsgStoreGetUserData          = mustGameTrackingEnum("EGCItemMsg", "k_EMsgGCStoreGetUserData")
	EMsgStoreGetUserDataResponse  = mustGameTrackingEnum("EGCItemMsg", "k_EMsgGCStoreGetUserDataResponse")
	EMsgStorePurchaseInit         = mustGameTrackingEnum("EGCItemMsg", "k_EMsgGCStorePurchaseInit")
	EMsgStorePurchaseInitResponse = mustGameTrackingEnum("EGCItemMsg", "k_EMsgGCStorePurchaseInitResponse")
)

func mustGameTrackingEnum(enumName, valueName string) uint32 {
	value, err := gametracking.EnumValue(enumName, valueName)
	if err != nil {
		panic(err)
	}
	return value
}

const AppIDCS2 = 730

var (
	EMsgDeleteItem                    = mustGameTrackingEnum("EGCItemMsg", "k_EMsgGCDelete")
	EMsgSetItemName                   = mustGameTrackingEnum("EGCItemMsg", "k_EMsgGCNameItem")
	EMsgCraft                         = mustGameTrackingEnum("EGCItemMsg", "k_EMsgGCCraft")
	EMsgCraftResponse                 = mustGameTrackingEnum("EGCItemMsg", "k_EMsgGCCraftResponse")
	EMsgUnlockCrateResponse           = mustGameTrackingEnum("EGCItemMsg", "k_EMsgGCUnlockCrateResponse")
	EMsgUseItemRequest                = mustGameTrackingEnum("EGCItemMsg", "k_EMsgGCUseItemRequest")
	EMsgRemoveItemName                = mustGameTrackingEnum("EGCItemMsg", "k_EMsgGCRemoveItemName")
	EMsgApplyStrangePart              = mustGameTrackingEnum("EGCItemMsg", "k_EMsgGCApplyStrangePart")
	EMsgSetItemPositions              = mustGameTrackingEnum("EGCItemMsg", "k_EMsgGCSetItemPositions")
	EMsgStatTrakSwap                  = mustGameTrackingEnum("EGCItemMsg", "k_EMsgGCStatTrakSwap")
	EMsgItemCustomizationNotification = mustGameTrackingEnum("EGCItemMsg", "k_EMsgGCItemCustomizationNotification")
	EMsgCasketItemAdd                 = mustGameTrackingEnum("EGCItemMsg", "k_EMsgGCCasketItemAdd")
	EMsgCasketItemExtract             = mustGameTrackingEnum("EGCItemMsg", "k_EMsgGCCasketItemExtract")
	EMsgCasketItemLoadContents        = mustGameTrackingEnum("EGCItemMsg", "k_EMsgGCCasketItemLoadContents")
	EMsgGiftItem                      = mustGameTrackingEnum("EGCItemMsg", "k_EMsgGCDeliverGift")
	EMsgOpenCrate                     = mustGameTrackingEnum("EGCItemMsg", "k_EMsgGCOpenCrate")
	EMsgVolatileItemLoadContents      = mustGameTrackingEnum("EGCItemMsg", "k_EMsgGCVolatileItemLoadContents")
	EMsgVolatileItemClaimReward       = mustGameTrackingEnum("ECsgoGCMsg", "k_EMsgGCCStrike15_v2_VolatileItemClaimReward")
	EMsgVolatileShopSubscribe         = mustGameTrackingEnum("ECsgoGCMsg", "k_EMsgGCCStrike15_v2_VolatileShopSubscribe")

	CustomizationEncapsulateSticker        = mustGameTrackingEnum("EGCItemCustomizationNotification", "k_EGCItemCustomizationNotification_EncapsulateSticker")
	CustomizationUnlockCrate               = mustGameTrackingEnum("EGCItemCustomizationNotification", "k_EGCItemCustomizationNotification_UnlockCrate")
	CustomizationXRayItemReveal            = mustGameTrackingEnum("EGCItemCustomizationNotification", "k_EGCItemCustomizationNotification_XRayItemReveal")
	CustomizationXRayItemClaim             = mustGameTrackingEnum("EGCItemCustomizationNotification", "k_EGCItemCustomizationNotification_XRayItemClaim")
	CustomizationCasketContents            = mustGameTrackingEnum("EGCItemCustomizationNotification", "k_EGCItemCustomizationNotification_CasketContents")
	CustomizationClientRedeemMissionReward = mustGameTrackingEnum("EGCItemCustomizationNotification", "k_EGCItemCustomizationNotification_ClientRedeemMissionReward")

	EMsgGCClientWelcome          = mustGameTrackingEnum("EGCBaseClientMsg", "k_EMsgGCClientWelcome")
	EMsgGCClientHello            = mustGameTrackingEnum("EGCBaseClientMsg", "k_EMsgGCClientHello")
	EMsgGCClientHelloR2          = mustGameTrackingEnum("EGCBaseClientMsg", "k_EMsgGCClientHelloR2")
	EMsgGCClientHelloR3          = mustGameTrackingEnum("EGCBaseClientMsg", "k_EMsgGCClientHelloR3")
	EMsgGCClientHelloR4          = mustGameTrackingEnum("EGCBaseClientMsg", "k_EMsgGCClientHelloR4")
	EMsgGCClientConnectionStatus = mustGameTrackingEnum("EGCBaseClientMsg", "k_EMsgGCClientConnectionStatus")

	EMsgGCCStrike15V2GC2ClientGlobalStats      = mustGameTrackingEnum("ECsgoGCMsg", "k_EMsgGCCStrike15_v2_GC2ClientGlobalStats")
	EMsgGCCStrike15V2ClientLogonFatalError     = mustGameTrackingEnum("ECsgoGCMsg", "k_EMsgGCCStrike15_v2_ClientLogonFatalError")
	EMsgGCCStrike15V2ClientRedeemMissionReward = mustGameTrackingEnum("ECsgoGCMsg", "k_EMsgGCCStrike15_v2_ClientRedeemMissionReward")
	EMsgGCCStrike15V2GC2ClientNotifyXPShop     = mustGameTrackingEnum("ECsgoGCMsg", "k_EMsgGCCStrike15_v2_GC2ClientNotifyXPShop")
)
