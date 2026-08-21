package transport

import (
	"fmt"

	cs2pb "cs-inv-edit/backend/internal/proto/gametracking"
	"cs-inv-edit/backend/internal/proto/tracking"
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
	offer, err := cs2pb.DecodeVolatileItemOffer(data)
	if err != nil {
		return GCVolatileOfferHistory{}, false
	}
	if offer.DefIndex == 0 || offer.DefIndex > 1_000_000 || len(offer.FauxItemIDs) == 0 {
		return GCVolatileOfferHistory{}, false
	}
	return GCVolatileOfferHistory{
		DefIndex:        offer.DefIndex,
		FauxItemIDs:     offer.FauxItemIDs,
		GenerationTimes: offer.GenerationTime,
	}, true
}

func DecodeCS2VolatileClaimedRewards(data []byte) (GCVolatileClaimedRewards, bool) {
	rewards, err := cs2pb.UnmarshalMessage("CSOVolatileItemClaimedRewards", data)
	if err != nil {
		return GCVolatileClaimedRewards{}, false
	}
	defIndex := uint32(tracking.Uint(rewards, "defidx"))
	rewardList := tracking.List(rewards, "reward")
	generationList := tracking.List(rewards, "generation_time")
	if defIndex == 0 || defIndex > 1_000_000 || rewardList.Len() == 0 {
		return GCVolatileClaimedRewards{}, false
	}
	rewardValues := make([]uint32, rewardList.Len())
	for index := range rewardValues {
		rewardValues[index] = uint32(rewardList.Get(index).Uint())
	}
	generationValues := make([]uint32, generationList.Len())
	for index := range generationValues {
		generationValues[index] = uint32(generationList.Get(index).Uint())
	}
	return GCVolatileClaimedRewards{
		DefIndex:        defIndex,
		Rewards:         rewardValues,
		GenerationTimes: generationValues,
	}, true
}

func decodeVirtualEconItemFromProto(item cs2pb.EconItem) GCVirtualEconItem {
	attributes := econAttributes(item)
	attributeBytes := econAttributeBytes(item)
	equipped := make([]GCEquippedState, len(item.Equipped))
	for index, state := range item.Equipped {
		equipped[index] = GCEquippedState{Class: state.Class, Slot: state.Slot}
	}
	return GCVirtualEconItem{
		ID:             item.ID,
		OriginalID:     item.OriginalID,
		DefIndex:       item.DefIndex,
		Quantity:       item.Quantity,
		Quality:        item.Quality,
		Rarity:         item.Rarity,
		Inventory:      item.Inventory,
		CustomName:     item.CustomName,
		PaintKit:       econPaintKit(item),
		PaintWear:      econPaintWear(item),
		Attributes:     attributes,
		AttributeBytes: attributeBytes,
		InteriorItemID: item.InteriorID,
		EquippedStates: equipped,
		Level:          item.Level,
		Flags:          item.Flags,
		Origin:         item.Origin,
		Style:          item.Style,
		CustomDesc:     item.CustomDesc,
	}
}

func DecodeCS2VirtualEconItems(emsg uint32, data []byte) ([]GCVirtualEconItem, error) {
	var rawDataList [][]byte

	switch emsg {
	case 21, 22, 23: // EMsgSOCreate (21), EMsgSOUpdate (22), EMsgSOSingleObject / EMsgSODestroy (23)
		if single, err := cs2pb.DecodeSOSingleObject(data); err == nil && single.TypeID == 1 {
			rawDataList = append(rawDataList, single.ObjectData)
		}
	case 26: // EMsgSOUpdateMultiple (26)
		if multiple, err := cs2pb.DecodeSOMultipleObjects(data); err == nil {
			for _, object := range multiple.ObjectsModified {
				if object.TypeID == 1 {
					rawDataList = append(rawDataList, object.ObjectData)
				}
			}
		}
	case 24: // EMsgSOCacheSubscribed (24)
		if subscribed, err := cs2pb.DecodeSOCacheSubscribed(data); err == nil {
			for _, objectType := range subscribed.Objects {
				if objectType.TypeID == 1 {
					rawDataList = append(rawDataList, objectType.ObjectData...)
				}
			}
		}
	}

	if len(rawDataList) == 0 {
		if item, err := cs2pb.DecodeEconItem(data); err == nil && item.ID != 0 && item.DefIndex != 0 {
			return []GCVirtualEconItem{decodeVirtualEconItemFromProto(item)}, nil
		}
		return nil, nil
	}

	results := make([]GCVirtualEconItem, 0, len(rawDataList))
	for _, raw := range rawDataList {
		if item, err := cs2pb.DecodeEconItem(raw); err == nil && item.ID != 0 {
			results = append(results, decodeVirtualEconItemFromProto(item))
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
