package transport

import (
	"context"
	"fmt"

	cs2pb "cs-inv-edit/backend/internal/proto/gametracking"
	"cs-inv-edit/backend/internal/protocol"
)

type cs2IncrementalInventoryUpdate struct {
	Items          []GCInventoryItem
	VolatileOffers map[uint32][]GCVolatileOffer
}

func (s *SteamGCClient) WaitForNewCS2InventoryItem(ctx context.Context, knownIDs map[uint64]struct{}) (GCInventoryItem, error) {
	candidates := make(map[uint64]GCInventoryItem)
	confirmedIDs := make(map[uint64]struct{})
	for {
		select {
		case <-ctx.Done():
			return GCInventoryItem{}, fmt.Errorf("wait for CS2 economy item creation: %w", ctx.Err())
		case event := <-s.events:
			message, ok := event.Payload.(GCMessage)
			if !ok || event.Type != "gc.message" || message.AppID != protocol.AppIDCS2 {
				continue
			}
			if message.EMsg == protocol.EMsgItemCustomizationNotification {
				notification, err := cs2pb.DecodeItemCustomizationNotification(message.Body)
				if err != nil {
					return GCInventoryItem{}, fmt.Errorf("decode Armory item confirmation: %w", err)
				}
				if notification.Request != protocol.CustomizationClientRedeemMissionReward {
					continue
				}
				for _, itemID := range notification.ItemIDs {
					if item, found := candidates[itemID]; found {
						return item, nil
					}
					confirmedIDs[itemID] = struct{}{}
				}
				continue
			}
			update, found, err := decodeCS2IncrementalInventory(message)
			if err != nil {
				return GCInventoryItem{}, err
			}
			if !found {
				continue
			}
			for _, item := range update.Items {
				if item.ID == 0 {
					continue
				}
				if _, known := knownIDs[item.ID]; !known {
					if _, confirmed := confirmedIDs[item.ID]; confirmed {
						return item, nil
					}
					candidates[item.ID] = item
				}
			}
		}
	}
}

// The current CS2 client registers
// CProtoBufSharedObject<CSOVolatileItemOffer, 20>. The MSVC symbol in the
// authoritative GameTracking client strings encodes 20 as $0BE@.
const cs2VolatileItemOfferSOTypeID int32 = 20

func decodeCS2IncrementalInventory(message GCMessage) (cs2IncrementalInventoryUpdate, bool, error) {
	switch message.EMsg {
	case protocol.EMsgSOCacheSubscribed:
		subscribed, err := cs2pb.DecodeSOCacheSubscribed(message.Body)
		if err != nil {
			return cs2IncrementalInventoryUpdate{}, true, fmt.Errorf("decode CS2 subscribed SOCache: %w", err)
		}
		return decodeCS2SubscribedTypes(subscribed.Objects)
	case protocol.EMsgSOCreate, protocol.EMsgSOUpdate:
		single, err := cs2pb.DecodeSOSingleObject(message.Body)
		if err != nil {
			return cs2IncrementalInventoryUpdate{}, true, fmt.Errorf("decode CS2 single SO: %w", err)
		}
		if single.TypeID == 1 {
			item, err := decodeCS2EconItem(single.ObjectData)
			if err != nil {
				return cs2IncrementalInventoryUpdate{}, true, err
			}
			return cs2IncrementalInventoryUpdate{Items: []GCInventoryItem{item}}, true, nil
		}
		if single.TypeID != cs2VolatileItemOfferSOTypeID {
			return cs2IncrementalInventoryUpdate{}, false, nil
		}
		offer, ok := decodeCS2VolatileOffer(single.ObjectData)
		if !ok {
			return cs2IncrementalInventoryUpdate{}, false, nil
		}
		return cs2IncrementalInventoryUpdate{VolatileOffers: map[uint32][]GCVolatileOffer{offer.DefIndex: domainVolatileOffers(offer)}}, true, nil
	case protocol.EMsgSOUpdateMultiple:
		multiple, err := cs2pb.DecodeSOMultipleObjects(message.Body)
		if err != nil {
			return cs2IncrementalInventoryUpdate{}, true, fmt.Errorf("decode CS2 multiple SO update: %w", err)
		}
		update := cs2IncrementalInventoryUpdate{Items: make([]GCInventoryItem, 0), VolatileOffers: make(map[uint32][]GCVolatileOffer)}
		for _, object := range multiple.ObjectsModified {
			if object.TypeID != 1 {
				if object.TypeID != cs2VolatileItemOfferSOTypeID {
					continue
				}
				if offer, ok := decodeCS2VolatileOffer(object.ObjectData); ok {
					update.VolatileOffers[offer.DefIndex] = domainVolatileOffers(offer)
				}
				continue
			}
			item, err := decodeCS2EconItem(object.ObjectData)
			if err != nil {
				return cs2IncrementalInventoryUpdate{}, true, err
			}
			update.Items = append(update.Items, item)
		}
		return update, len(update.Items) > 0 || len(update.VolatileOffers) > 0, nil
	default:
		return cs2IncrementalInventoryUpdate{}, false, nil
	}
}

func decodeCS2SubscribedTypes(types []cs2pb.SubscribedType) (cs2IncrementalInventoryUpdate, bool, error) {
	update := cs2IncrementalInventoryUpdate{Items: make([]GCInventoryItem, 0), VolatileOffers: make(map[uint32][]GCVolatileOffer)}
	found := false
	for _, objectType := range types {
		if objectType.TypeID != 1 {
			if objectType.TypeID != cs2VolatileItemOfferSOTypeID {
				continue
			}
			for _, objectData := range objectType.ObjectData {
				if offer, ok := decodeCS2VolatileOffer(objectData); ok {
					update.VolatileOffers[offer.DefIndex] = domainVolatileOffers(offer)
					found = true
				}
			}
			continue
		}
		found = true
		for _, objectData := range objectType.ObjectData {
			item, err := decodeCS2EconItem(objectData)
			if err != nil {
				return cs2IncrementalInventoryUpdate{}, true, err
			}
			update.Items = append(update.Items, item)
		}
	}
	return update, found, nil
}

func decodeCS2VolatileOffer(body []byte) (cs2pb.VolatileItemOffer, bool) {
	offer, err := cs2pb.DecodeVolatileItemOffer(body)
	if err != nil || offer.DefIndex == 0 || offer.DefIndex > 1_000_000 || len(offer.FauxItemIDs) == 0 {
		return cs2pb.VolatileItemOffer{}, false
	}
	return offer, true
}

func domainVolatileOffers(offer cs2pb.VolatileItemOffer) []GCVolatileOffer {
	result := make([]GCVolatileOffer, 0, len(offer.FauxItemIDs))
	for index, fauxItemID := range offer.FauxItemIDs {
		generationTime := uint32(0)
		if index < len(offer.GenerationTime) {
			generationTime = offer.GenerationTime[index]
		}
		result = append(result, GCVolatileOffer{FauxItemID: fauxItemID, GenerationTime: generationTime})
	}
	return result
}

func attachVolatileOffers(items []GCInventoryItem, offers map[uint32][]GCVolatileOffer) {
	for index := range items {
		if values := offers[items[index].DefIndex]; len(values) > 0 {
			items[index].VolatileOffers = append([]GCVolatileOffer(nil), values...)
		}
	}
}

func mergeInventoryItemMap(items []GCInventoryItem, additional map[uint64]GCInventoryItem) []GCInventoryItem {
	indexByID := make(map[uint64]int, len(items)+len(additional))
	for index := range items {
		indexByID[items[index].ID] = index
	}
	for id, item := range additional {
		if index, exists := indexByID[id]; exists {
			items[index] = item
			continue
		}
		indexByID[id] = len(items)
		items = append(items, item)
	}
	return items
}
