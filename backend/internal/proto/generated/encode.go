package cs2pb

import (
	"fmt"
	"strings"

	"google.golang.org/protobuf/proto"
)

type ItemPositionInput struct {
	LegacyItemID uint32 `json:"legacyItemId"`
	Position     uint32 `json:"position"`
	ItemID       uint64 `json:"itemId"`
}

type SetItemNameInput struct {
	SubjectItemID uint64 `json:"subjectItemId"`
	ToolItemID    uint64 `json:"toolItemId"`
	Name          string `json:"name"`
}

type RemoveItemNameInput struct {
	ItemID uint64 `json:"itemId"`
}

type DeleteItemInput struct {
	ItemID uint64 `json:"itemId"`
}

type ApplyStatTrakSwapInput struct {
	ToolItemID uint64 `json:"toolItemId"`
	Item1ID    uint64 `json:"item1ItemId"`
	Item2ID    uint64 `json:"item2ItemId"`
}

type ApplyStrangePartInput struct {
	StrangePartItemID uint64 `json:"strangePartItemId"`
	ItemItemID        uint64 `json:"itemItemId"`
}

type UseItemInput struct {
	ItemID               uint64   `json:"itemId"`
	TargetSteamID        *uint64  `json:"targetSteamId,omitempty"`
	GiftPotentialTargets []uint32 `json:"giftPotentialTargets,omitempty"`
	DuelClassLock        *uint32  `json:"duelClassLock,omitempty"`
	InitiatorSteamID     *uint64  `json:"initiatorSteamId,omitempty"`
}

type UseMultipleItemsInput struct {
	ItemIDs []uint64 `json:"itemIds"`
}

type ApplyToolToItemInput struct {
	ToolItemID    uint64 `json:"toolItemId"`
	SubjectItemID uint64 `json:"subjectItemId"`
}

type ApplyToolToBaseItemInput struct {
	ToolItemID       uint64 `json:"toolItemId"`
	BaseitemDefIndex uint32 `json:"baseitemDefIndex"`
}

type GiftItemInput struct {
	ItemID            uint64 `json:"itemId"`
	ReceiverAccountID uint32 `json:"receiverAccountId"`
	GiftMessage       string `json:"giftMessage"`
}

type CraftItemsInput struct {
	Recipe  int32    `json:"recipe"`
	ItemIDs []uint64 `json:"itemIds"`
}

func EncodeCasketItem(casketID, itemID uint64) ([]byte, error) {
	msg := &CMsgCasketItem{
		CasketItemId: proto.Uint64(casketID),
		ItemItemId:   proto.Uint64(itemID),
	}
	return proto.Marshal(msg)
}

func EncodeLoadCasketContents(casketID uint64) ([]byte, error) {
	return EncodeCasketItem(casketID, casketID)
}

func EncodeExtractSticker(itemID uint64, slot uint32) ([]byte, error) {
	return encodeStickerCustomization(itemID, slot, uint32(EGCItemCustomizationNotification_k_EGCItemCustomizationNotification_ExtractSticker))
}

func EncodeSetItemName(input SetItemNameInput) ([]byte, error) {
	if err := requireID("subject item id", input.SubjectItemID); err != nil {
		return nil, err
	}
	if err := requireID("tool item id", input.ToolItemID); err != nil {
		return nil, err
	}
	name := strings.TrimSpace(input.Name)
	if name == "" {
		return nil, fmt.Errorf("name is required")
	}
	msg := &CMsgSetItemName{
		SubjectItemId: proto.Uint64(input.SubjectItemID),
		ToolItemId:    proto.Uint64(input.ToolItemID),
		Name:          proto.String(name),
	}
	return proto.Marshal(msg)
}

func EncodeRemoveItemName(input RemoveItemNameInput) ([]byte, error) {
	if err := requireID("item id", input.ItemID); err != nil {
		return nil, err
	}
	msg := &CMsgRemoveItemName{ItemId: proto.Uint64(input.ItemID)}
	return proto.Marshal(msg)
}

func EncodeDeleteItem(input DeleteItemInput) ([]byte, error) {
	if err := requireID("item id", input.ItemID); err != nil {
		return nil, err
	}
	msg := &CMsgDeleteItem{ItemId: proto.Uint64(input.ItemID)}
	return proto.Marshal(msg)
}

func EncodeApplyStatTrakSwap(input ApplyStatTrakSwapInput) ([]byte, error) {
	if err := requireID("tool item id", input.ToolItemID); err != nil {
		return nil, err
	}
	if err := requireID("item 1 id", input.Item1ID); err != nil {
		return nil, err
	}
	if err := requireID("item 2 id", input.Item2ID); err != nil {
		return nil, err
	}
	msg := &CMsgApplyStatTrakSwap{
		ToolItemId:   proto.Uint64(input.ToolItemID),
		Item_1ItemId: proto.Uint64(input.Item1ID),
		Item_2ItemId: proto.Uint64(input.Item2ID),
	}
	return proto.Marshal(msg)
}

func EncodeApplyStrangePart(input ApplyStrangePartInput) ([]byte, error) {
	if err := requireID("strange part item id", input.StrangePartItemID); err != nil {
		return nil, err
	}
	if err := requireID("item id", input.ItemItemID); err != nil {
		return nil, err
	}
	msg := &CMsgApplyStrangePart{
		StrangePartItemId: proto.Uint64(input.StrangePartItemID),
		ItemItemId:        proto.Uint64(input.ItemItemID),
	}
	return proto.Marshal(msg)
}

func EncodeUseItem(input UseItemInput) ([]byte, error) {
	if err := requireID("item id", input.ItemID); err != nil {
		return nil, err
	}
	msg := &CMsgUseItem{
		ItemId:                proto.Uint64(input.ItemID),
		Gift_PotentialTargets: append([]uint32(nil), input.GiftPotentialTargets...),
	}
	if input.TargetSteamID != nil {
		msg.TargetSteamId = proto.Uint64(*input.TargetSteamID)
	}
	if input.DuelClassLock != nil {
		msg.Duel_ClassLock = proto.Uint32(*input.DuelClassLock)
	}
	if input.InitiatorSteamID != nil {
		msg.InitiatorSteamId = proto.Uint64(*input.InitiatorSteamID)
	}
	return proto.Marshal(msg)
}

func EncodeUseMultipleItems(input UseMultipleItemsInput) ([]byte, error) {
	if len(input.ItemIDs) == 0 {
		return nil, fmt.Errorf("at least one item id is required")
	}
	for index, itemID := range input.ItemIDs {
		if err := requireID(fmt.Sprintf("item id at index %d", index), itemID); err != nil {
			return nil, err
		}
	}
	msg := &CMsgUseMultipleItems{ItemIds: append([]uint64(nil), input.ItemIDs...)}
	return proto.Marshal(msg)
}

func EncodeApplyToolToItem(input ApplyToolToItemInput) ([]byte, error) {
	if err := requireID("tool item id", input.ToolItemID); err != nil {
		return nil, err
	}
	if err := requireID("subject item id", input.SubjectItemID); err != nil {
		return nil, err
	}
	msg := &CMsgApplyToolToItem{
		ToolItemId:    proto.Uint64(input.ToolItemID),
		SubjectItemId: proto.Uint64(input.SubjectItemID),
	}
	return proto.Marshal(msg)
}

func EncodeApplyToolToBaseItem(input ApplyToolToBaseItemInput) ([]byte, error) {
	if err := requireID("tool item id", input.ToolItemID); err != nil {
		return nil, err
	}
	if input.BaseitemDefIndex == 0 {
		return nil, fmt.Errorf("base item defindex is required")
	}
	msg := &CMsgApplyToolToBaseItem{
		ToolItemId:       proto.Uint64(input.ToolItemID),
		BaseitemDefIndex: proto.Uint32(input.BaseitemDefIndex),
	}
	return proto.Marshal(msg)
}

func EncodeGiftItem(input GiftItemInput) ([]byte, error) {
	if err := requireID("item id", input.ItemID); err != nil {
		return nil, err
	}
	if input.ReceiverAccountID == 0 {
		return nil, fmt.Errorf("receiver account id is required")
	}
	msg := &CMsgGiftItem{
		ItemId:            proto.Uint64(input.ItemID),
		ReceiverAccountId: proto.Uint32(input.ReceiverAccountID),
	}
	if text := strings.TrimSpace(input.GiftMessage); text != "" {
		msg.GiftMessage = proto.String(text)
	}
	return proto.Marshal(msg)
}

func EncodeCraftItems(input CraftItemsInput) ([]byte, error) {
	if len(input.ItemIDs) == 0 {
		return nil, fmt.Errorf("at least one item id is required")
	}
	for index, itemID := range input.ItemIDs {
		if err := requireID(fmt.Sprintf("item id at index %d", index), itemID); err != nil {
			return nil, err
		}
	}
	msg := &CMsgCraftItems{
		Recipe:  proto.Int32(input.Recipe),
		ItemIds: append([]uint64(nil), input.ItemIDs...),
	}
	return proto.Marshal(msg)
}

func EncodeSetItemPositions(itemPositions []ItemPositionInput) ([]byte, error) {
	positions := make([]*CMsgSetItemPositions_ItemPosition, 0, len(itemPositions))
	for _, position := range itemPositions {
		positions = append(positions, &CMsgSetItemPositions_ItemPosition{
			LegacyItemId: proto.Uint32(position.LegacyItemID),
			Position:     proto.Uint32(position.Position),
			ItemId:       proto.Uint64(position.ItemID),
		})
	}
	msg := &CMsgSetItemPositions{ItemPositions: positions}
	return proto.Marshal(msg)
}

func encodeStickerCustomization(itemID uint64, slot uint32, request uint32) ([]byte, error) {
	if err := requireID("item id", itemID); err != nil {
		return nil, err
	}
	msg := &CMsgGCItemCustomizationNotification{
		ItemId:    []uint64{itemID},
		Request:   proto.Uint32(request),
		ExtraData: []uint64{uint64(slot)},
	}
	return proto.Marshal(msg)
}

func requireID(name string, value uint64) error {
	if value == 0 {
		return fmt.Errorf("%s is required", name)
	}
	return nil
}
