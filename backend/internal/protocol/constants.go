package protocol

import cs2pb "cs-inv-edit/backend/internal/proto/generated"

const AppIDCS2 = 730

const (
	EMsgDeleteItem                    = uint32(cs2pb.EGCItemMsg_k_EMsgGCDelete)
	EMsgSetItemName                   = uint32(cs2pb.EGCItemMsg_k_EMsgGCNameItem)
	EMsgCraft                         = uint32(cs2pb.EGCItemMsg_k_EMsgGCCraft)
	EMsgCraftResponse                 = uint32(cs2pb.EGCItemMsg_k_EMsgGCCraftResponse)
	EMsgUnlockCrateResponse           = uint32(cs2pb.EGCItemMsg_k_EMsgGCUnlockCrateResponse)
	EMsgUseItemRequest                = uint32(cs2pb.EGCItemMsg_k_EMsgGCUseItemRequest)
	EMsgRemoveItemName                = uint32(cs2pb.EGCItemMsg_k_EMsgGCRemoveItemName)
	EMsgApplyStrangePart              = uint32(cs2pb.EGCItemMsg_k_EMsgGCApplyStrangePart)
	EMsgSetItemPositions              = uint32(cs2pb.EGCItemMsg_k_EMsgGCSetItemPositions)
	EMsgStatTrakSwap                  = uint32(cs2pb.EGCItemMsg_k_EMsgGCStatTrakSwap)
	EMsgItemCustomizationNotification = uint32(cs2pb.EGCItemMsg_k_EMsgGCItemCustomizationNotification)
	EMsgCasketItemAdd                 = uint32(cs2pb.EGCItemMsg_k_EMsgGCCasketItemAdd)
	EMsgCasketItemExtract             = uint32(cs2pb.EGCItemMsg_k_EMsgGCCasketItemExtract)
	EMsgCasketItemLoadContents        = uint32(cs2pb.EGCItemMsg_k_EMsgGCCasketItemLoadContents)
	EMsgGiftItem                      = uint32(cs2pb.EGCItemMsg_k_EMsgGCDeliverGift)
	EMsgOpenCrate                     = uint32(cs2pb.EGCItemMsg_k_EMsgGCOpenCrate)

	CustomizationExtractSticker     = uint32(cs2pb.EGCItemCustomizationNotification_k_EGCItemCustomizationNotification_ExtractSticker)
	CustomizationEncapsulateSticker = uint32(cs2pb.EGCItemCustomizationNotification_k_EGCItemCustomizationNotification_EncapsulateSticker)
	CustomizationUnlockCrate        = uint32(cs2pb.EGCItemCustomizationNotification_k_EGCItemCustomizationNotification_UnlockCrate)
	CustomizationXRayItemReveal     = uint32(cs2pb.EGCItemCustomizationNotification_k_EGCItemCustomizationNotification_XRayItemReveal)
	CustomizationXRayItemClaim      = uint32(cs2pb.EGCItemCustomizationNotification_k_EGCItemCustomizationNotification_XRayItemClaim)

	EMsgGCClientWelcome          = uint32(cs2pb.EGCBaseClientMsg_k_EMsgGCClientWelcome)
	EMsgGCClientHello            = uint32(cs2pb.EGCBaseClientMsg_k_EMsgGCClientHello)
	EMsgGCClientHelloR2          = uint32(cs2pb.EGCBaseClientMsg_k_EMsgGCClientHelloR2)
	EMsgGCClientHelloR3          = uint32(cs2pb.EGCBaseClientMsg_k_EMsgGCClientHelloR3)
	EMsgGCClientHelloR4          = uint32(cs2pb.EGCBaseClientMsg_k_EMsgGCClientHelloR4)
	EMsgGCClientConnectionStatus = uint32(cs2pb.EGCBaseClientMsg_k_EMsgGCClientConnectionStatus)

	EMsgGCCStrike15V2GC2ClientGlobalStats      = uint32(cs2pb.ECsgoGCMsg_k_EMsgGCCStrike15_v2_GC2ClientGlobalStats)
	EMsgGCCStrike15V2ClientLogonFatalError     = uint32(cs2pb.ECsgoGCMsg_k_EMsgGCCStrike15_v2_ClientLogonFatalError)
	EMsgGCCStrike15V2ClientRedeemMissionReward = uint32(cs2pb.ECsgoGCMsg_k_EMsgGCCStrike15_v2_ClientRedeemMissionReward)
)
