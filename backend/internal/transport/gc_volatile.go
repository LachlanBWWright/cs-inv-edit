package transport

import (
	"fmt"

	cs2pb "cs-inv-edit/backend/internal/proto/generated"
	"google.golang.org/protobuf/proto"
)

type GCVolatileOfferHistory struct {
	DefIndex        uint32
	FauxItemIDs     []uint64
	GenerationTimes []uint32
}

type GCVolatileClaimedRewards struct {
	DefIndex        uint32
	Rewards         []uint32
	GenerationTimes []uint32
}

type GCTerminalNotification struct {
	Request   uint32
	ItemIDs   []uint64
	ExtraData []uint64
	EMsg      uint32
	Body      []byte
}

type GCVirtualEconItem struct {
	ID             uint64
	OriginalID     uint64
	DefIndex       uint32
	Quantity       uint32
	Quality        uint32
	Rarity         uint32
	Inventory      uint32
	CustomName     string
	PaintKit       uint32
	PaintWear      *float64
	Attributes     map[uint32]uint32
	AttributeBytes map[uint32][]byte
	EquippedStates []GCEquippedState
	InteriorItemID uint64
	Level          uint32
	Flags          uint32
	Origin         uint32
	Style          uint32
	CustomDesc     string
}

func DecodeCS2VolatileOfferHistory(data []byte) (GCVolatileOfferHistory, bool) {
	var offer cs2pb.CSOVolatileItemOffer
	if err := proto.Unmarshal(data, &offer); err != nil {
		return GCVolatileOfferHistory{}, false
	}
	defIndex := offer.GetDefidx()
	if defIndex == 0 || defIndex > 1_000_000 || len(offer.GetFauxItemid()) == 0 {
		return GCVolatileOfferHistory{}, false
	}
	return GCVolatileOfferHistory{
		DefIndex:        defIndex,
		FauxItemIDs:     offer.GetFauxItemid(),
		GenerationTimes: offer.GetGenerationTime(),
	}, true
}

func DecodeCS2VolatileClaimedRewards(data []byte) (GCVolatileClaimedRewards, bool) {
	var rewards cs2pb.CSOVolatileItemClaimedRewards
	if err := proto.Unmarshal(data, &rewards); err != nil {
		return GCVolatileClaimedRewards{}, false
	}
	defIndex := rewards.GetDefidx()
	if defIndex == 0 || defIndex > 1_000_000 || len(rewards.GetReward()) == 0 {
		return GCVolatileClaimedRewards{}, false
	}
	return GCVolatileClaimedRewards{
		DefIndex:        defIndex,
		Rewards:         rewards.GetReward(),
		GenerationTimes: rewards.GetGenerationTime(),
	}, true
}

func decodeVirtualEconItemFromProto(item *cs2pb.CSOEconItem) GCVirtualEconItem {
	attributes := econAttributes(item)
	attributeBytes := econAttributeBytes(item)
	interiorID := uint64(0)
	if item.InteriorItem != nil {
		interiorID = item.InteriorItem.GetId()
	}
	return GCVirtualEconItem{
		ID:             item.GetId(),
		OriginalID:     item.GetOriginalId(),
		DefIndex:       item.GetDefIndex(),
		Quantity:       item.GetQuantity(),
		Quality:        item.GetQuality(),
		Rarity:         item.GetRarity(),
		Inventory:      item.GetInventory(),
		CustomName:     item.GetCustomName(),
		PaintKit:       econPaintKit(item),
		PaintWear:      econPaintWear(item),
		Attributes:     attributes,
		AttributeBytes: attributeBytes,
		InteriorItemID: interiorID,
		Level:          item.GetLevel(),
		Flags:          item.GetFlags(),
		Origin:         item.GetOrigin(),
		Style:          item.GetStyle(),
		CustomDesc:     item.GetCustomDesc(),
	}
}

func DecodeCS2VirtualEconItems(emsg uint32, data []byte) ([]GCVirtualEconItem, error) {
	var rawDataList [][]byte

	switch emsg {
	case 21, 22, 23: // EMsgSOCreate (21), EMsgSOUpdate (22), EMsgSOSingleObject / EMsgSODestroy (23)
		var single cs2pb.CMsgSOSingleObject
		if err := proto.Unmarshal(data, &single); err == nil && single.GetTypeId() == 1 {
			rawDataList = append(rawDataList, single.GetObjectData())
		}
	case 26: // EMsgSOUpdateMultiple (26)
		var multiple cs2pb.CMsgSOMultipleObjects
		if err := proto.Unmarshal(data, &multiple); err == nil {
			for _, object := range multiple.GetObjectsModified() {
				if object.GetTypeId() == 1 {
					rawDataList = append(rawDataList, object.GetObjectData())
				}
			}
		}
	case 24: // EMsgSOCacheSubscribed (24)
		var subscribed cs2pb.CMsgSOCacheSubscribed
		if err := proto.Unmarshal(data, &subscribed); err == nil {
			for _, objectType := range subscribed.GetObjects() {
				if objectType.GetTypeId() == 1 {
					rawDataList = append(rawDataList, objectType.GetObjectData()...)
				}
			}
		}
	}

	if len(rawDataList) == 0 {
		var item cs2pb.CSOEconItem
		if err := proto.Unmarshal(data, &item); err == nil && item.GetId() != 0 && item.GetDefIndex() != 0 {
			return []GCVirtualEconItem{decodeVirtualEconItemFromProto(&item)}, nil
		}
		return nil, nil
	}

	results := make([]GCVirtualEconItem, 0, len(rawDataList))
	for _, raw := range rawDataList {
		var item cs2pb.CSOEconItem
		if err := proto.Unmarshal(raw, &item); err == nil && item.GetId() != 0 {
			results = append(results, decodeVirtualEconItemFromProto(&item))
		}
	}
	return results, nil
}

func DecodeCS2VirtualEconItem(data []byte) (GCVirtualEconItem, error) {
	items, err := DecodeCS2VirtualEconItems(0, data)
	if err != nil {
		return GCVirtualEconItem{}, err
	}
	if len(items) > 0 {
		return items[0], nil
	}
	return GCVirtualEconItem{}, fmt.Errorf("no virtual econ item found")
}
