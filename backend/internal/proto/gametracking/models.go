package gametracking

import (
	"cs-inv-edit/backend/internal/proto/tracking"
	"google.golang.org/protobuf/reflect/protoreflect"
)

type SOObject struct {
	TypeID     int32
	ObjectData []byte
}

type SubscribedType struct {
	TypeID     int32
	ObjectData [][]byte
}

type SOCacheSubscribed struct {
	Objects []SubscribedType
	Version uint64
}

type SOSingleObject struct {
	TypeID     int32
	ObjectData []byte
	Version    uint64
}

type SOMultipleObjects struct {
	ObjectsModified []SOObject
	Version         uint64
}

type ClientWelcome struct {
	OutofdateSubscribedCaches []SOCacheSubscribed
}

type VolatileItemOffer struct {
	DefIndex       uint32
	FauxItemIDs    []uint64
	GenerationTime []uint32
}

type XpShop struct {
	GenerationTime    uint32
	RedeemableBalance uint32
	XpTracks          []uint32
	GenerationPresent bool
}

type EconAttribute struct {
	DefIndex   uint32
	Value      uint32
	ValueBytes []byte
}

type EconItem struct {
	ID         uint64
	OriginalID uint64
	DefIndex   uint32
	Quantity   uint32
	Quality    uint32
	Rarity     uint32
	Inventory  uint32
	CustomName string
	CustomDesc string
	Attributes []EconAttribute
	InteriorID uint64
	Equipped   []EconEquipped
	Level      uint32
	Flags      uint32
	Origin     uint32
	Style      uint32
}

type EconEquipped struct {
	Class uint32
	Slot  uint32
}

func DecodeSOCacheSubscribed(body []byte) (SOCacheSubscribed, error) {
	message, err := UnmarshalMessage("CMsgSOCacheSubscribed", body)
	if err != nil {
		return SOCacheSubscribed{}, err
	}
	return subscribed(message), nil
}

func DecodeSOSingleObject(body []byte) (SOSingleObject, error) {
	message, err := UnmarshalMessage("CMsgSOSingleObject", body)
	if err != nil {
		return SOSingleObject{}, err
	}
	return SOSingleObject{
		TypeID:     int32(tracking.Int(message, "type_id")),
		ObjectData: append([]byte(nil), tracking.Bytes(message, "object_data")...),
		Version:    tracking.Uint(message, "version"),
	}, nil
}

func DecodeSOMultipleObjects(body []byte) (SOMultipleObjects, error) {
	message, err := UnmarshalMessage("CMsgSOMultipleObjects", body)
	if err != nil {
		return SOMultipleObjects{}, err
	}
	objects := tracking.List(message, "objects_modified")
	result := SOMultipleObjects{ObjectsModified: make([]SOObject, objects.Len()), Version: tracking.Uint(message, "version")}
	for index := 0; index < objects.Len(); index++ {
		object := objects.Get(index).Message()
		result.ObjectsModified[index] = SOObject{TypeID: int32(tracking.Int(object, "type_id")), ObjectData: append([]byte(nil), tracking.Bytes(object, "object_data")...)}
	}
	return result, nil
}

func DecodeClientWelcome(body []byte) (ClientWelcome, error) {
	message, err := UnmarshalMessage("CMsgClientWelcome", body)
	if err != nil {
		return ClientWelcome{}, err
	}
	caches := tracking.List(message, "outofdate_subscribed_caches")
	result := ClientWelcome{OutofdateSubscribedCaches: make([]SOCacheSubscribed, caches.Len())}
	for index := 0; index < caches.Len(); index++ {
		result.OutofdateSubscribedCaches[index] = subscribed(caches.Get(index).Message())
	}
	return result, nil
}

func subscribed(message protoreflect.Message) SOCacheSubscribed {
	objects := tracking.List(message, "objects")
	result := SOCacheSubscribed{Objects: make([]SubscribedType, objects.Len()), Version: tracking.Uint(message, "version")}
	for index := 0; index < objects.Len(); index++ {
		object := objects.Get(index).Message()
		data := tracking.List(object, "object_data")
		values := make([][]byte, data.Len())
		for dataIndex := 0; dataIndex < data.Len(); dataIndex++ {
			values[dataIndex] = append([]byte(nil), data.Get(dataIndex).Bytes()...)
		}
		result.Objects[index] = SubscribedType{TypeID: int32(tracking.Int(object, "type_id")), ObjectData: values}
	}
	return result
}

func DecodeVolatileItemOffer(body []byte) (VolatileItemOffer, error) {
	message, err := UnmarshalMessage("CSOVolatileItemOffer", body)
	if err != nil {
		return VolatileItemOffer{}, err
	}
	return VolatileItemOffer{
		DefIndex:       uint32(tracking.Uint(message, "defidx")),
		FauxItemIDs:    uint64List(message, "faux_itemid"),
		GenerationTime: uint32List(message, "generation_time"),
	}, nil
}

func DecodeXpShop(body []byte) (XpShop, error) {
	message, err := UnmarshalMessage("CSOAccountXpShop", body)
	if err != nil {
		return XpShop{}, err
	}
	return XpShop{
		GenerationTime:    uint32(tracking.Uint(message, "generation_time")),
		RedeemableBalance: uint32(tracking.Uint(message, "redeemable_balance")),
		XpTracks:          uint32List(message, "xp_tracks"),
		GenerationPresent: tracking.Has(message, "generation_time"),
	}, nil
}

func DecodeEconItem(body []byte) (EconItem, error) {
	message, err := UnmarshalMessage("CSOEconItem", body)
	if err != nil {
		return EconItem{}, err
	}
	attributes := tracking.List(message, "attribute")
	result := EconItem{
		ID:         tracking.Uint(message, "id"),
		OriginalID: tracking.Uint(message, "original_id"),
		DefIndex:   uint32(tracking.Uint(message, "def_index")),
		Quantity:   uint32(tracking.Uint(message, "quantity")),
		Quality:    uint32(tracking.Uint(message, "quality")),
		Rarity:     uint32(tracking.Uint(message, "rarity")),
		Inventory:  uint32(tracking.Uint(message, "inventory")),
		CustomName: tracking.String(message, "custom_name"),
		CustomDesc: tracking.String(message, "custom_desc"),
		Level:      uint32(tracking.Uint(message, "level")),
		Flags:      uint32(tracking.Uint(message, "flags")),
		Origin:     uint32(tracking.Uint(message, "origin")),
		Style:      uint32(tracking.Uint(message, "style")),
		Attributes: make([]EconAttribute, attributes.Len()),
	}
	interiorField := tracking.Field(message, "interior_item")
	if message.Has(interiorField) {
		result.InteriorID = tracking.Uint(message.Get(interiorField).Message(), "id")
	}
	equipped := tracking.List(message, "equipped_state")
	result.Equipped = make([]EconEquipped, equipped.Len())
	for index := 0; index < equipped.Len(); index++ {
		state := equipped.Get(index).Message()
		result.Equipped[index] = EconEquipped{Class: uint32(tracking.Uint(state, "new_class")), Slot: uint32(tracking.Uint(state, "new_slot"))}
	}
	for index := 0; index < attributes.Len(); index++ {
		attribute := attributes.Get(index).Message()
		result.Attributes[index] = EconAttribute{
			DefIndex:   uint32(tracking.Uint(attribute, "def_index")),
			Value:      uint32(tracking.Uint(attribute, "value")),
			ValueBytes: append([]byte(nil), tracking.Bytes(attribute, "value_bytes")...),
		}
	}
	return result, nil
}

func uint64List(message protoreflect.Message, name string) []uint64 {
	list := tracking.List(message, name)
	result := make([]uint64, list.Len())
	for index := 0; index < list.Len(); index++ {
		result[index] = list.Get(index).Uint()
	}
	return result
}

func uint32List(message protoreflect.Message, name string) []uint32 {
	list := tracking.List(message, name)
	result := make([]uint32, list.Len())
	for index := 0; index < list.Len(); index++ {
		result[index] = uint32(list.Get(index).Uint())
	}
	return result
}
