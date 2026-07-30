package gametracking

import (
	"fmt"
	"strings"
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

type ItemCustomizationNotification struct {
	ItemIDs   []uint64
	Request   uint32
	ExtraData []uint64
}

func EncodeCasketItem(casketID, itemID uint64) ([]byte, error) {
	return MarshalMessage("CMsgCasketItem", map[string]any{"casket_item_id": casketID, "item_item_id": itemID})
}

func EncodeOpenCrate(subjectItemID, toolItemID uint64, pointsRemaining, volatileLimit *uint32) ([]byte, error) {
	fields := map[string]any{"subject_item_id": subjectItemID}
	if toolItemID != 0 {
		fields["tool_item_id"] = toolItemID
	}
	if pointsRemaining != nil {
		fields["points_remaining"] = *pointsRemaining
	}
	if volatileLimit != nil {
		fields["volatile_limit"] = *volatileLimit
	}
	return MarshalMessage("CMsgOpenCrate", fields)
}

func DecodeItemCustomizationNotification(body []byte) (ItemCustomizationNotification, error) {
	message, err := UnmarshalMessage("CMsgGCItemCustomizationNotification", body)
	if err != nil {
		return ItemCustomizationNotification{}, err
	}
	itemField := message.Descriptor().Fields().ByName("item_id")
	itemList := message.Get(itemField).List()
	items := make([]uint64, itemList.Len())
	for index := 0; index < itemList.Len(); index++ {
		items[index] = itemList.Get(index).Uint()
	}
	extraField := message.Descriptor().Fields().ByName("extra_data")
	extraList := message.Get(extraField).List()
	extra := make([]uint64, extraList.Len())
	for index := 0; index < extraList.Len(); index++ {
		extra[index] = extraList.Get(index).Uint()
	}
	requestField := message.Descriptor().Fields().ByName("request")
	return ItemCustomizationNotification{ItemIDs: items, Request: uint32(message.Get(requestField).Uint()), ExtraData: extra}, nil
}

func EncodeLoadCasketContents(casketID uint64) ([]byte, error) {
	return EncodeCasketItem(casketID, casketID)
}

func EncodeExtractSticker(itemID uint64, slot uint32) ([]byte, error) {
	request, err := EnumValue("EGCItemCustomizationNotification", "k_EGCItemCustomizationNotification_ExtractSticker")
	if err != nil {
		return nil, err
	}
	return encodeStickerCustomization(itemID, slot, request)
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
	return MarshalMessage("CMsgSetItemName", map[string]any{"subject_item_id": input.SubjectItemID, "tool_item_id": input.ToolItemID, "name": name})
}

func EncodeRemoveItemName(input RemoveItemNameInput) ([]byte, error) {
	if err := requireID("item id", input.ItemID); err != nil {
		return nil, err
	}
	return MarshalMessage("CMsgRemoveItemName", map[string]any{"item_id": input.ItemID})
}

func EncodeDeleteItem(input DeleteItemInput) ([]byte, error) {
	if err := requireID("item id", input.ItemID); err != nil {
		return nil, err
	}
	return MarshalMessage("CMsgDeleteItem", map[string]any{"item_id": input.ItemID})
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
	return MarshalMessage("CMsgApplyStatTrakSwap", map[string]any{"tool_item_id": input.ToolItemID, "item_1_item_id": input.Item1ID, "item_2_item_id": input.Item2ID})
}

func EncodeApplyStrangePart(input ApplyStrangePartInput) ([]byte, error) {
	if err := requireID("strange part item id", input.StrangePartItemID); err != nil {
		return nil, err
	}
	if err := requireID("item id", input.ItemItemID); err != nil {
		return nil, err
	}
	return MarshalMessage("CMsgApplyStrangePart", map[string]any{"strange_part_item_id": input.StrangePartItemID, "item_item_id": input.ItemItemID})
}

func EncodeUseItem(input UseItemInput) ([]byte, error) {
	if err := requireID("item id", input.ItemID); err != nil {
		return nil, err
	}
	fields := map[string]any{"item_id": input.ItemID}
	if len(input.GiftPotentialTargets) > 0 {
		values := make([]any, len(input.GiftPotentialTargets))
		for index, value := range input.GiftPotentialTargets {
			values[index] = value
		}
		fields["gift__potential_targets"] = values
	}
	if input.TargetSteamID != nil {
		fields["target_steam_id"] = *input.TargetSteamID
	}
	if input.DuelClassLock != nil {
		fields["duel__class_lock"] = *input.DuelClassLock
	}
	if input.InitiatorSteamID != nil {
		fields["initiator_steam_id"] = *input.InitiatorSteamID
	}
	return MarshalMessage("CMsgUseItem", fields)
}

func EncodeUseMultipleItems(input UseMultipleItemsInput) ([]byte, error) {
	values, err := checkedIDs(input.ItemIDs)
	if err != nil {
		return nil, err
	}
	return MarshalMessage("CMsgUseMultipleItems", map[string]any{"item_ids": values})
}

func EncodeApplyToolToItem(input ApplyToolToItemInput) ([]byte, error) {
	if err := requireID("tool item id", input.ToolItemID); err != nil {
		return nil, err
	}
	if err := requireID("subject item id", input.SubjectItemID); err != nil {
		return nil, err
	}
	return MarshalMessage("CMsgApplyToolToItem", map[string]any{"tool_item_id": input.ToolItemID, "subject_item_id": input.SubjectItemID})
}

func EncodeApplyToolToBaseItem(input ApplyToolToBaseItemInput) ([]byte, error) {
	if err := requireID("tool item id", input.ToolItemID); err != nil {
		return nil, err
	}
	if input.BaseitemDefIndex == 0 {
		return nil, fmt.Errorf("base item defindex is required")
	}
	return MarshalMessage("CMsgApplyToolToBaseItem", map[string]any{"tool_item_id": input.ToolItemID, "baseitem_def_index": input.BaseitemDefIndex})
}

func EncodeGiftItem(input GiftItemInput) ([]byte, error) {
	if err := requireID("item id", input.ItemID); err != nil {
		return nil, err
	}
	if input.ReceiverAccountID == 0 {
		return nil, fmt.Errorf("receiver account id is required")
	}
	fields := map[string]any{"item_id": input.ItemID, "receiver_account_id": input.ReceiverAccountID}
	if message := strings.TrimSpace(input.GiftMessage); message != "" {
		fields["gift_message"] = message
	}
	return MarshalMessage("CMsgGiftItem", fields)
}

func EncodeCraftItems(input CraftItemsInput) ([]byte, error) {
	values, err := checkedIDs(input.ItemIDs)
	if err != nil {
		return nil, err
	}
	return MarshalMessage("CMsgCraftItems", map[string]any{"recipe": input.Recipe, "item_ids": values})
}

func EncodeSetItemPositions(positions []ItemPositionInput) ([]byte, error) {
	values := make([]any, len(positions))
	for index, position := range positions {
		values[index] = map[string]any{"legacy_item_id": position.LegacyItemID, "position": position.Position, "item_id": position.ItemID}
	}
	return MarshalMessage("CMsgSetItemPositions", map[string]any{"item_positions": values})
}

func encodeStickerCustomization(itemID uint64, slot uint32, request uint32) ([]byte, error) {
	if err := requireID("item id", itemID); err != nil {
		return nil, err
	}
	return MarshalMessage("CMsgGCItemCustomizationNotification", map[string]any{
		"item_id":    []any{itemID},
		"request":    request,
		"extra_data": []any{uint64(slot)},
	})
}

func checkedIDs(ids []uint64) ([]any, error) {
	if len(ids) == 0 {
		return nil, fmt.Errorf("at least one item id is required")
	}
	values := make([]any, len(ids))
	for index, id := range ids {
		if err := requireID(fmt.Sprintf("item id at index %d", index), id); err != nil {
			return nil, err
		}
		values[index] = id
	}
	return values, nil
}

func requireID(name string, value uint64) error {
	if value == 0 {
		return fmt.Errorf("%s is required", name)
	}
	return nil
}
