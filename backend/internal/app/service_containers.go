package app

import (
	"context"
	"encoding/hex"
	"errors"
	"fmt"
	"sort"
	"strconv"
	"strings"
	"time"

	"cs-inv-edit/backend/internal/domain"
	"cs-inv-edit/backend/internal/operations"
	cs2pb "cs-inv-edit/backend/internal/proto/gametracking"
	"cs-inv-edit/backend/internal/protocol"
	"cs-inv-edit/backend/internal/transport"
)

func steamErrorDetail(stage string, err error) string {
	if err == nil {
		return ""
	}
	if errors.Is(err, context.DeadlineExceeded) {
		return fmt.Sprintf("%s timed out: %v", stage, err)
	}
	return err.Error()
}

type containerOpenResult struct {
	Kind string `json:"kind"` // "inventory_award", "terminal_offer", "terminal_unsealed"

	OpenedItem *domain.InventoryItem `json:"openedItem,omitempty"`

	TerminalItemID   string              `json:"terminalItemId,omitempty"`
	TerminalDefIndex uint32              `json:"terminalDefIndex,omitempty"`
	OfferItemID      string              `json:"offerItemId,omitempty"`
	Offer            *domain.RelatedItem `json:"offer,omitempty"`
	PurchasePrice    uint32              `json:"purchasePrice,omitempty"`
	PointsRemaining  *uint32             `json:"pointsRemaining,omitempty"`

	ConsumedItemID  string   `json:"consumedItemId,omitempty"`
	RequestEMsg     uint32   `json:"requestEMsg,omitempty"`
	RequestMethod   string   `json:"requestMethod,omitempty"`
	RequestBodyHex  string   `json:"requestBodyHex,omitempty"`
	Confirmation    string   `json:"confirmation,omitempty"`
	ResponseEMsg    uint32   `json:"responseEMsg,omitempty"`
	ResponseBodyHex string   `json:"responseBodyHex,omitempty"`
	BeforeItemCount int      `json:"beforeItemCount,omitempty"`
	AfterItemCount  int      `json:"afterItemCount,omitempty"`
	Diagnostics     []string `json:"diagnostics,omitempty"`
}

func (s *Service) isTerminalContainer(item domain.InventoryItem) bool {
	return isTerminalInventoryItem(item)
}

func (s *Service) openContainer(input map[string]any) (bool, string, *containerOpenResult) {
	itemID, _ := input["itemId"].(string)
	result := &containerOpenResult{ConsumedItemID: itemID, Kind: "inventory_award"}
	if itemID == "" {
		return false, "container item id is required", result
	}
	itemIDUint, err := strconv.ParseUint(itemID, 10, 64)
	if err != nil || itemIDUint == 0 {
		return false, "container item id must be a valid Steam item id", result
	}
	s.mu.Lock()
	beforeInventory := cloneInventory(s.inventory)
	_, accountCtx, _ := s.currentGCSessionKeyLocked(protocol.AppIDCS2)
	s.mu.Unlock()
	result.BeforeItemCount = len(beforeInventory.Items)
	var found *domain.InventoryItem
	for i := range beforeInventory.Items {
		if beforeInventory.Items[i].ID == itemID {
			found = &beforeInventory.Items[i]
			break
		}
	}
	if found == nil {
		return false, "container is not present in the current owned inventory snapshot", result
	}
	if !isContainerLikeInventoryItem(*found) {
		return false, "selected item is not a container or capsule", result
	}

	if s.isTerminalContainer(*found) {
		return s.openTerminal(accountCtx, *found, input, beforeInventory, result)
	}
	return s.openOrdinaryContainer(accountCtx, *found, input, beforeInventory, result)
}

func (s *Service) openOrdinaryContainer(accountCtx context.Context, container domain.InventoryItem, input map[string]any, beforeInventory domain.InventorySnapshot, result *containerOpenResult) (bool, string, *containerOpenResult) {
	result.Kind = "inventory_award"
	itemIDUint, _ := strconv.ParseUint(container.ID, 10, 64)
	toolItemID, err := optionalUint64Input(input, "keyItemId")
	if err != nil {
		return false, err.Error(), result
	}
	if len(container.RequiredKeyDefIndexes) > 0 && toolItemID == 0 {
		return false, "this container requires a compatible key, but none is owned", result
	}
	if len(container.RequiredKeyDefIndexes) == 0 && toolItemID != 0 {
		return false, "this container is keyless and must be opened without a key/tool", result
	}
	if toolItemID != 0 {
		if toolItemID == itemIDUint {
			return false, "opening key/tool must be different from the container", result
		}
		var tool *domain.InventoryItem
		for i := range beforeInventory.Items {
			candidateID, parseErr := strconv.ParseUint(beforeInventory.Items[i].ID, 10, 64)
			if parseErr == nil && candidateID == toolItemID {
				tool = &beforeInventory.Items[i]
				break
			}
		}
		if tool == nil {
			return false, "opening key/tool is not present in the current owned inventory snapshot", result
		}
		compatible := false
		if tool.Defindex != nil {
			for _, defIndex := range container.RequiredKeyDefIndexes {
				if *tool.Defindex == defIndex {
					compatible = true
					break
				}
			}
		}
		if !compatible {
			return false, "selected opening key is not compatible with this container", result
		}
	}
	pointsRemaining, err := optionalUint32PointerInput(input, "pointsRemaining")
	if err != nil {
		return false, err.Error(), result
	}
	volatileLimit, err := optionalUint32PointerInput(input, "volatileLimit")
	if err != nil {
		return false, err.Error(), result
	}
	if pointsRemaining != nil || volatileLimit != nil {
		return false, "terminal offer fields cannot be used with an ordinary container", result
	}

	s.mu.Lock()
	requestKey, _, _ := s.currentGCSessionKeyLocked(protocol.AppIDCS2)
	s.mu.Unlock()

	result.RequestEMsg = protocol.EMsgOpenCrate
	result.RequestMethod = "open_crate_proto"
	body, err := cs2pb.EncodeOpenCrate(itemIDUint, toolItemID, nil, nil)
	if err != nil {
		return false, "encode container open request failed: " + err.Error(), result
	}
	result.RequestBodyHex = hex.EncodeToString(body)
	ctx, cancel := context.WithTimeout(accountCtx, 8*time.Second)
	defer cancel()
	if err := s.ensureGCSession(ctx, protocol.AppIDCS2); err != nil {
		return false, "CS2 GC session is not ready; container open was not sent: " + err.Error(), result
	}
	if err := s.gcClient.SendProtoToGC(ctx, protocol.AppIDCS2, protocol.EMsgOpenCrate, body); err != nil {
		return false, "send container open request failed: " + err.Error(), result
	}
	confirmation := s.waitForContainerOpenConfirmation(ctx, itemIDUint)
	result.Confirmation = confirmation.Message
	result.ResponseEMsg = confirmation.EMsg
	result.ResponseBodyHex = confirmation.BodyHex
	result.Diagnostics = confirmation.Diagnostics
	if confirmation.Err != nil {
		return false, confirmation.Err.Error(), result
	}
	if snapshot, openedItem, err := s.reconcileContainerResultOnce(accountCtx, beforeInventory, false); err == nil && openedItem != nil {
		result.AfterItemCount = len(snapshot.Items)
		result.OpenedItem = openedItem
		snapshot.Message = fmt.Sprintf("Container opened: %s", openedInventoryItemName(openedItem))
		s.mu.Lock()
		currentKey, _, keyErr := s.currentGCSessionKeyLocked(protocol.AppIDCS2)
		if keyErr != nil || currentKey != requestKey {
			s.mu.Unlock()
			return false, "container result superseded by an account change", result
		}
		s.inventory = snapshot
		s.mu.Unlock()
		return true, snapshot.Message, result
	} else if err != nil {
		result.Diagnostics = append(result.Diagnostics, err.Error())
	}
	return false, "container open response received, but the awarded item could not be decoded from GC response", result
}

func (s *Service) openTerminal(accountCtx context.Context, terminal domain.InventoryItem, input map[string]any, beforeInventory domain.InventorySnapshot, result *containerOpenResult) (bool, string, *containerOpenResult) {
	terminalID, _ := strconv.ParseUint(terminal.ID, 10, 64)
	activeTerminal := terminal.IsActiveTerminal

	pointsRemaining, err := optionalUint32PointerInput(input, "pointsRemaining")
	if err != nil {
		return false, err.Error(), result
	}
	volatileLimit, err := optionalUint32PointerInput(input, "volatileLimit")
	if err != nil {
		return false, err.Error(), result
	}

	result.TerminalItemID = terminal.ID
	if terminal.Defindex != nil {
		result.TerminalDefIndex = *terminal.Defindex
	}
	result.PointsRemaining = pointsRemaining

	s.mu.Lock()
	requestKey, _, _ := s.currentGCSessionKeyLocked(protocol.AppIDCS2)
	s.mu.Unlock()

	ctx, cancel := context.WithTimeout(accountCtx, 30*time.Second)
	defer cancel()

	if err := s.ensureGCSession(ctx, protocol.AppIDCS2); err != nil {
		return false, "CS2 GC session is not ready; terminal request was not sent: " + err.Error(), result
	}

	// Stage A: Unseal if still sealed
	if !activeTerminal {
		result.RequestEMsg = protocol.EMsgOpenCrate
		result.RequestMethod = "terminal_unseal_proto"
		unsealBody, err := cs2pb.EncodeOpenCrate(terminalID, 0, pointsRemaining, volatileLimit)
		if err != nil {
			return false, "encode terminal unseal request failed: " + err.Error(), result
		}
		result.RequestBodyHex = hex.EncodeToString(unsealBody)
		if err := s.gcClient.SendProtoToGC(ctx, protocol.AppIDCS2, protocol.EMsgOpenCrate, unsealBody); err != nil {
			return false, "send terminal unseal request failed: " + err.Error(), result
		}
		confirmation := s.waitForContainerOpenConfirmation(ctx, terminalID)
		result.Confirmation = confirmation.Message
		result.ResponseEMsg = confirmation.EMsg
		result.ResponseBodyHex = confirmation.BodyHex
		result.Diagnostics = confirmation.Diagnostics
		if confirmation.Err != nil {
			return false, confirmation.Err.Error(), result
		}
		result.Diagnostics = append(result.Diagnostics,
			fmt.Sprintf("UNSEAL SEND emsg=%d body_hex=%s", protocol.EMsgOpenCrate, result.RequestBodyHex),
			fmt.Sprintf("UNSEAL RECV emsg=%d body_hex=%s confirmation=%q", confirmation.EMsg, confirmation.BodyHex, confirmation.Message),
		)
		if len(confirmation.ItemIDs) == 0 || confirmation.ItemIDs[0] == 0 {
			return false, "CS2 confirmed terminal unsealing but did not return the active terminal item id", result
		}
		terminalID = confirmation.ItemIDs[0]
		terminal.ID = strconv.FormatUint(terminalID, 10)
		terminal.Name = activeTerminalName(terminal.Name)
		terminal.MarketName = activeTerminalName(terminal.MarketName)
		terminal.IsTerminal = true
		terminal.IsActiveTerminal = true
		result.TerminalItemID = terminal.ID
		// Panorama generates the first offer with UseToolWithIntArg(active,
		// active, 0), not with the current-offer/casket resume route.
		firstOfferCounter := uint32(0)
		pointsRemaining = &firstOfferCounter
		result.PointsRemaining = pointsRemaining
	}

	// Stage B: Request / Resume offer & resolve virtual casket item
	result.RequestMethod = "terminal_offer_request"
	reqBody, err := cs2pb.EncodeOpenCrate(terminalID, terminalID, pointsRemaining, volatileLimit)
	if err != nil {
		return false, "encode terminal offer request failed: " + err.Error(), result
	}
	result.RequestEMsg = protocol.EMsgOpenCrate
	result.RequestBodyHex = hex.EncodeToString(reqBody)

	previousOfferIDs := make(map[uint64]struct{}, len(terminal.TerminalOffers))
	for _, offer := range terminal.TerminalOffers {
		if id, parseErr := strconv.ParseUint(offer.FauxItemID, 10, 64); parseErr == nil {
			previousOfferIDs[id] = struct{}{}
		}
	}
	virtualCandidatesByID := make(map[uint64]transport.GCVirtualEconItem)
	var matching1012Confirmation *containerOpenConfirmation

	offerCtx, offerCancel := context.WithTimeout(ctx, 12*time.Second)
	defer offerCancel()

	if err := s.gcClient.SendProtoToGC(offerCtx, protocol.AppIDCS2, protocol.EMsgOpenCrate, reqBody); err != nil {
		return false, "send terminal offer request failed: " + err.Error(), result
	}

	observed := make([]string, 0, 8)
	for {
		select {
		case <-offerCtx.Done():
			if matching1012Confirmation == nil {
				return false, "terminal offer request timed out waiting for request 1012 confirmation", result
			}
			goto ResolveCandidates
		case event := <-s.gcClient.Events():
			if event.Type != "gc.message" {
				continue
			}
			message, ok := event.Payload.(transport.GCMessage)
			if !ok || message.AppID != protocol.AppIDCS2 {
				continue
			}
			observed = append(observed, fmt.Sprintf("emsg=%d bytes=%d", message.EMsg, len(message.Body)))

			if message.EMsg == protocol.EMsgItemCustomizationNotification {
				notification, decodeErr := cs2pb.DecodeItemCustomizationNotification(message.Body)
				if decodeErr == nil {
					if notification.Request == protocol.CustomizationCasketContents {
						matchesTerminal := false
						for _, id := range notification.ItemIDs {
							if id == terminalID {
								matchesTerminal = true
								break
							}
						}
						if matchesTerminal || len(notification.ItemIDs) == 0 {
							matching1012Confirmation = &containerOpenConfirmation{
								EMsg:        message.EMsg,
								Request:     notification.Request,
								ItemIDs:     notification.ItemIDs,
								ExtraData:   notification.ExtraData,
								Message:     "CS2 GC confirmed terminal casket contents (request 1012)",
								BodyHex:     hex.EncodeToString(message.Body),
								Diagnostics: append([]string(nil), observed...),
							}
						}
					}
				}
			}

			if message.EMsg == protocol.EMsgSOCreate || message.EMsg == protocol.EMsgSOUpdate || message.EMsg == protocol.EMsgSOSingleObject || message.EMsg == protocol.EMsgSOCacheSubscribed || message.EMsg == protocol.EMsgSOUpdateMultiple {
				if items, err := transport.DecodeCS2VirtualEconItems(message.EMsg, message.Body); err == nil {
					for _, item := range items {
						if !virtualItemBelongsToTerminal(item, terminalID) {
							continue
						}
						if pointsRemaining != nil {
							if _, previous := previousOfferIDs[item.ID]; previous {
								continue
							}
						}
						virtualCandidatesByID[item.ID] = item
					}
				}
			}
			if matching1012Confirmation != nil && len(virtualCandidatesByID) > 0 {
				goto ResolveCandidates
			}
		}
	}

ResolveCandidates:
	result.Diagnostics = append(result.Diagnostics, observed...)
	if matching1012Confirmation != nil {
		result.Confirmation = matching1012Confirmation.Message
		result.ResponseEMsg = matching1012Confirmation.EMsg
		result.ResponseBodyHex = matching1012Confirmation.BodyHex
	}

	virtualCandidates := rankedTerminalVirtualCandidates(virtualCandidatesByID)
	if len(virtualCandidates) > 1 {
		result.Diagnostics = append(result.Diagnostics, fmt.Sprintf("Request 1012 returned %d new exact-casket virtual items for terminal %d; selected newest priced item_id=%d", len(virtualCandidates), terminalID, virtualCandidates[0].ID))
		virtualCandidates = virtualCandidates[:1]
	}
	switch len(virtualCandidates) {
	case 1:
		offerItem, err := s.resolveTerminalOffer(ctx, virtualCandidates[0])
		if err != nil {
			return false, err.Error(), result
		}
		offerItemID := strconv.FormatUint(virtualCandidates[0].ID, 10)
		result.Kind = "terminal_offer"
		result.TerminalItemID = terminal.ID
		result.OfferItemID = offerItemID
		result.Offer = &offerItem
		result.PurchasePrice = virtualCandidates[0].Attributes[316]
		result.PointsRemaining = pointsRemaining

		s.mu.Lock()
		currentKey, _, keyErr := s.currentGCSessionKeyLocked(protocol.AppIDCS2)
		if keyErr == nil && currentKey == requestKey {
			for i := range s.inventory.Items {
				if s.inventory.Items[i].ID == terminal.ID {
					s.inventory.Items[i].TerminalOffers = []domain.TerminalOffer{{
						FauxItemID:    offerItemID,
						PurchasePrice: result.PurchasePrice,
						Item:          offerItem,
					}}
					break
				}
			}
		}
		s.mu.Unlock()
		return true, fmt.Sprintf("Terminal offer resolved: %s", offerItem.Name), result
	case 0:
		if matching1012Confirmation != nil {
			result.Diagnostics = append(result.Diagnostics, fmt.Sprintf("Request 1012 received for terminal %d, but no correlated virtual casket item was found; item_ids=%v extra_data=%v", terminalID, matching1012Confirmation.ItemIDs, matching1012Confirmation.ExtraData))
		}
		return false, "terminal offer request sent, but no correlated virtual item was found", result
	}
	return false, "terminal offer request failed to resolve a current offer", result
}

func virtualItemBelongsToTerminal(item transport.GCVirtualEconItem, terminalID uint64) bool {
	if item.ID == 0 {
		return false
	}
	if item.InteriorItemID == terminalID {
		return true
	}
	low, lowPresent := item.Attributes[272]
	high, highPresent := item.Attributes[273]
	return lowPresent && highPresent && uint64(high)<<32|uint64(low) == terminalID
}

func rankedTerminalVirtualCandidates(candidates map[uint64]transport.GCVirtualEconItem) []transport.GCVirtualEconItem {
	result := make([]transport.GCVirtualEconItem, 0, len(candidates))
	for _, candidate := range candidates {
		result = append(result, candidate)
	}
	sort.Slice(result, func(left, right int) bool {
		leftPriced := result[left].Attributes[316] > 0
		rightPriced := result[right].Attributes[316] > 0
		if leftPriced != rightPriced {
			return leftPriced
		}
		return result[left].ID > result[right].ID
	})
	return result
}

func (s *Service) resumeTerminalOffer(accountCtx context.Context, terminalIDText string) (bool, operations.State, string, *containerOpenResult) {
	s.mu.Lock()
	var terminalItem *domain.InventoryItem
	for i := range s.inventory.Items {
		if s.inventory.Items[i].ID == terminalIDText {
			itemCopy := s.inventory.Items[i]
			terminalItem = &itemCopy
			break
		}
	}
	beforeInventory := cloneInventory(s.inventory)
	s.mu.Unlock()

	// EMsg 2536 only reloads a current volatile offer. An active terminal can
	// legitimately have no offer yet when it was unsealed by another client or
	// the first-offer request was interrupted. Panorama starts that state with
	// UseToolWithIntArg(active, active, 0), encoded as CMsgOpenCrate.
	if shouldRequestFirstTerminalOffer(terminalItem) {
		firstOfferCounter := uint32(0)
		result := &containerOpenResult{
			Kind:            "terminal_offer",
			TerminalItemID:  terminalIDText,
			PointsRemaining: &firstOfferCounter,
			BeforeItemCount: len(beforeInventory.Items),
		}
		ok, message, opened := s.openTerminal(
			accountCtx,
			*terminalItem,
			map[string]any{"pointsRemaining": float64(firstOfferCounter)},
			beforeInventory,
			result,
		)
		if ok {
			return true, "completed", message, opened
		}
		return false, "failed", message, opened
	}
	return s.resumeTerminalOfferVia(accountCtx, terminalIDText, protocol.EMsgVolatileItemLoadContents)
}

func shouldRequestFirstTerminalOffer(terminal *domain.InventoryItem) bool {
	return terminal != nil && terminal.IsActiveTerminal && terminal.TerminalPointsRemaining == nil
}

func (s *Service) resumeTerminalOfferVia(accountCtx context.Context, terminalIDText string, requestEMsg uint32) (bool, operations.State, string, *containerOpenResult) {
	result := &containerOpenResult{Kind: "terminal_offer", TerminalItemID: terminalIDText}
	terminalID, err := strconv.ParseUint(terminalIDText, 10, 64)
	if err != nil || terminalID == 0 {
		return false, "failed", "terminal id must be a valid Steam item id", result
	}

	s.mu.Lock()
	requestKey, _, _ := s.currentGCSessionKeyLocked(protocol.AppIDCS2)
	var terminalItem *domain.InventoryItem
	for i := range s.inventory.Items {
		if s.inventory.Items[i].ID == terminalIDText {
			terminalItem = &s.inventory.Items[i]
			break
		}
	}
	s.mu.Unlock()

	if terminalItem != nil && terminalItem.Defindex != nil {
		result.TerminalDefIndex = *terminalItem.Defindex
	}

	ctx, cancel := context.WithTimeout(accountCtx, 8*time.Second)
	defer cancel()

	if err := s.ensureGCSession(ctx, protocol.AppIDCS2); err != nil {
		return false, "failed", "CS2 GC session is not ready; terminal offer request was not sent: " + err.Error(), result
	}

	body, encodeErr := cs2pb.EncodeLoadCasketContents(terminalID)
	if encodeErr != nil {
		return false, "failed", "encode terminal offer request failed: " + encodeErr.Error(), result
	}

	result.RequestEMsg = requestEMsg
	result.RequestMethod = "terminal_current_offer_request"
	result.RequestBodyHex = hex.EncodeToString(body)

	if err := s.gcClient.SendProtoToGC(ctx, protocol.AppIDCS2, requestEMsg, body); err != nil {
		return false, "failed", "send terminal offer request failed: " + err.Error(), result
	}

	virtualCandidatesByID := make(map[uint64]transport.GCVirtualEconItem)
	var matching1012Confirmation *containerOpenConfirmation

	offerCtx, offerCancel := context.WithTimeout(ctx, 5*time.Second)
	defer offerCancel()

	observed := make([]string, 0, 8)
	for {
		select {
		case <-offerCtx.Done():
			if len(virtualCandidatesByID) > 0 {
				goto ResolveCandidates
			}
			if matching1012Confirmation == nil {
				return true, "awaiting_gc_confirmation", "terminal offer requested from CS2", result
			}
			goto ResolveCandidates
		case event := <-s.gcClient.Events():
			if event.Type != "gc.message" {
				continue
			}
			message, ok := event.Payload.(transport.GCMessage)
			if !ok || message.AppID != protocol.AppIDCS2 {
				continue
			}
			observed = append(observed, fmt.Sprintf("emsg=%d bytes=%d", message.EMsg, len(message.Body)))

			if message.EMsg == protocol.EMsgItemCustomizationNotification {
				notification, decodeErr := cs2pb.DecodeItemCustomizationNotification(message.Body)
				if decodeErr == nil {
					if notification.Request == protocol.CustomizationCasketContents {
						matchesTerminal := false
						for _, id := range notification.ItemIDs {
							if id == terminalID {
								matchesTerminal = true
								break
							}
						}
						if matchesTerminal || len(notification.ItemIDs) == 0 {
							matching1012Confirmation = &containerOpenConfirmation{
								EMsg:        message.EMsg,
								Request:     notification.Request,
								ItemIDs:     notification.ItemIDs,
								ExtraData:   notification.ExtraData,
								Message:     "CS2 GC confirmed terminal casket contents (request 1012)",
								BodyHex:     hex.EncodeToString(message.Body),
								Diagnostics: append([]string(nil), observed...),
							}
						}
					}
				}
			}

			if message.EMsg == protocol.EMsgSOCreate || message.EMsg == protocol.EMsgSOUpdate || message.EMsg == protocol.EMsgSOSingleObject || message.EMsg == protocol.EMsgSOCacheSubscribed || message.EMsg == protocol.EMsgSOUpdateMultiple {
				if items, err := transport.DecodeCS2VirtualEconItems(message.EMsg, message.Body); err == nil {
					for _, item := range items {
						if virtualItemBelongsToTerminal(item, terminalID) {
							virtualCandidatesByID[item.ID] = item
						}
					}
				}
			}
			if matching1012Confirmation != nil && len(virtualCandidatesByID) > 0 {
				goto ResolveCandidates
			}
		}
	}

ResolveCandidates:
	result.Diagnostics = append(result.Diagnostics, observed...)
	if matching1012Confirmation != nil {
		result.Confirmation = matching1012Confirmation.Message
		result.ResponseEMsg = matching1012Confirmation.EMsg
		result.ResponseBodyHex = matching1012Confirmation.BodyHex
	}

	virtualCandidates := rankedTerminalVirtualCandidates(virtualCandidatesByID)
	if len(virtualCandidates) > 1 {
		result.Diagnostics = append(result.Diagnostics, fmt.Sprintf("Request 1012 returned %d exact-casket virtual items for terminal %d; selected newest priced item_id=%d", len(virtualCandidates), terminalID, virtualCandidates[0].ID))
		virtualCandidates = virtualCandidates[:1]
	}
	switch len(virtualCandidates) {
	case 1:
		offerItem, err := s.resolveTerminalOffer(ctx, virtualCandidates[0])
		if err != nil {
			return false, "failed", err.Error(), result
		}
		offerItemID := strconv.FormatUint(virtualCandidates[0].ID, 10)
		result.Kind = "terminal_offer"
		result.TerminalItemID = terminalIDText
		result.OfferItemID = offerItemID
		result.Offer = &offerItem
		result.PurchasePrice = virtualCandidates[0].Attributes[316]

		s.mu.Lock()
		currentKey, _, keyErr := s.currentGCSessionKeyLocked(protocol.AppIDCS2)
		if keyErr == nil && currentKey == requestKey {
			for i := range s.inventory.Items {
				if s.inventory.Items[i].ID == terminalIDText {
					s.inventory.Items[i].TerminalOffers = []domain.TerminalOffer{{
						FauxItemID:    offerItemID,
						PurchasePrice: result.PurchasePrice,
						Item:          offerItem,
					}}
					break
				}
			}
		}
		s.mu.Unlock()
		return true, "completed", fmt.Sprintf("Terminal offer loaded: %s", offerItem.Name), result
	case 0:
		if matching1012Confirmation != nil {
			result.Diagnostics = append(result.Diagnostics, fmt.Sprintf("Request 1012 received for terminal %d, but no correlated virtual casket item was found; item_ids=%v extra_data=%v", terminalID, matching1012Confirmation.ItemIDs, matching1012Confirmation.ExtraData))
		}
		return false, "failed", "No current offer was returned by the CS2 Game Coordinator.", result
	}
	return false, "failed", "terminal offer request failed to resolve a current offer", result
}

func (s *Service) resolveTerminalOffer(ctx context.Context, raw transport.GCVirtualEconItem) (domain.RelatedItem, error) {
	s.mu.Lock()
	econProvider := s.econProvider
	s.mu.Unlock()

	var name, marketName, rarity, imageURL, price, kind string
	var wearMin, wearMax *float64
	if econProvider != nil {
		if schema, err := econProvider.Load(ctx); err == nil && schema != nil {
			meta := schema.Metadata(raw.DefIndex, raw.PaintKit, raw.Attributes)
			name = meta.Name
			marketName = meta.MarketName
			rarity = meta.Rarity
			imageURL = meta.ImageURL
			kind = meta.Kind
			wearMin = meta.PaintWearMin
			wearMax = meta.PaintWearMax
		}
	}
	if name == "" {
		name = fmt.Sprintf("CS2 item #%d", raw.DefIndex)
	}
	if marketName == "" {
		marketName = name
	}
	if kind == "" {
		kind = "weapon_skin"
	}
	return domain.RelatedItem{
		Defindex:    raw.DefIndex,
		PaintKit:    raw.PaintKit,
		Name:        name,
		MarketName:  marketName,
		ListingName: marketName,
		Kind:        kind,
		Rarity:      rarity,
		ImageURL:    imageURL,
		Price:       price,
		PaintWear:   raw.PaintWear,
		WearMin:     wearMin,
		WearMax:     wearMax,
	}, nil
}

func (s *Service) reconcileContainerResultOnce(ctx context.Context, before domain.InventorySnapshot, terminal bool) (domain.InventorySnapshot, *domain.InventoryItem, error) {
	snapshot, err := s.fetchInventory(ctx, nil)
	if err != nil {
		return domain.InventorySnapshot{}, nil, fmt.Errorf("post-open inventory refresh failed: %w", err)
	}
	if openedItem := firstNewInventoryItem(before, snapshot); openedItem != nil {
		return snapshot, openedItem, nil
	}
	if terminal {
		if transitioned := firstChangedTerminalItem(before, snapshot); transitioned != nil {
			return snapshot, transitioned, nil
		}
	}
	return snapshot, nil, fmt.Errorf("post-open inventory refresh found no new item; before_count=%d after_count=%d", len(before.Items), len(snapshot.Items))
}

func (s *Service) reconcileNewInventoryItemOnce(ctx context.Context, before domain.InventorySnapshot) (domain.InventorySnapshot, *domain.InventoryItem, error) {
	return s.reconcileContainerResultOnce(ctx, before, false)
}

func firstChangedTerminalItem(before domain.InventorySnapshot, after domain.InventorySnapshot) *domain.InventoryItem {
	beforeByID := make(map[string]domain.InventoryItem, len(before.Items))
	for _, item := range before.Items {
		beforeByID[item.ID] = item
	}
	for index := range after.Items {
		item := &after.Items[index]
		if !isTerminalInventoryItem(*item) {
			continue
		}
		previous, existed := beforeByID[item.ID]
		if !existed || previous.Name != item.Name || previous.MarketName != item.MarketName || !sameDefindex(previous.Defindex, item.Defindex) || !sameTerminalOffers(previous.TerminalOffers, item.TerminalOffers) {
			return item
		}
	}
	return nil
}

func sameTerminalOffers(left []domain.TerminalOffer, right []domain.TerminalOffer) bool {
	if len(left) != len(right) {
		return false
	}
	for index := range left {
		if left[index].FauxItemID != right[index].FauxItemID {
			return false
		}
	}
	return true
}

func sameDefindex(left *uint32, right *uint32) bool {
	if left == nil || right == nil {
		return left == nil && right == nil
	}
	return *left == *right
}

func firstNewInventoryItem(before domain.InventorySnapshot, after domain.InventorySnapshot) *domain.InventoryItem {
	beforeIDs := make(map[string]struct{}, len(before.Items))
	for _, item := range before.Items {
		beforeIDs[item.ID] = struct{}{}
	}
	for i := range after.Items {
		if _, existed := beforeIDs[after.Items[i].ID]; !existed {
			return &after.Items[i]
		}
	}
	return nil
}

func openedInventoryItemName(item *domain.InventoryItem) string {
	if item == nil {
		return "unknown item"
	}
	if item.MarketName != "" {
		return item.MarketName
	}
	if item.Name != "" {
		return item.Name
	}
	if item.Defindex != nil {
		return fmt.Sprintf("CS2 item #%d", *item.Defindex)
	}
	return item.ID
}

func isContainerLikeInventoryItem(item domain.InventoryItem) bool {
	if item.IsTerminal {
		return true
	}
	haystack := strings.ToLower(item.Kind + " " + item.Name + " " + item.MarketName)
	return item.Kind == "container" || len(item.ContainerItems) > 0 || strings.Contains(haystack, "capsule") || strings.Contains(haystack, "case") || strings.Contains(haystack, "container") || strings.Contains(haystack, "graffiti box")
}

func isTerminalInventoryItem(item domain.InventoryItem) bool {
	return item.IsTerminal
}

func optionalUint64Input(input map[string]any, key string) (uint64, error) {
	value, ok := input[key]
	if !ok || value == nil {
		return 0, nil
	}
	switch typed := value.(type) {
	case string:
		if strings.TrimSpace(typed) == "" {
			return 0, nil
		}
		parsed, err := strconv.ParseUint(typed, 10, 64)
		if err != nil {
			return 0, fmt.Errorf("%s must be a valid Steam item id", key)
		}
		return parsed, nil
	case float64:
		if typed < 0 || typed != float64(uint64(typed)) {
			return 0, fmt.Errorf("%s must be a valid Steam item id", key)
		}
		return uint64(typed), nil
	default:
		return 0, fmt.Errorf("%s must be a string item id", key)
	}
}

func optionalUint32PointerInput(input map[string]any, key string) (*uint32, error) {
	value, ok := input[key]
	if !ok || value == nil {
		return nil, nil
	}
	parsed, err := requiredUint32Input(input, key)
	if err != nil {
		return nil, err
	}
	return &parsed, nil
}

func requiredUint32Input(input map[string]any, key string) (uint32, error) {
	value, ok := input[key]
	if !ok {
		return 0, fmt.Errorf("%s is required", key)
	}
	var parsed uint64
	var err error
	switch v := value.(type) {
	case float64:
		if v < 0 || v != float64(uint64(v)) {
			return 0, fmt.Errorf("%s must be an unsigned integer", key)
		}
		parsed = uint64(v)
	case string:
		parsed, err = strconv.ParseUint(v, 10, 32)
	default:
		return 0, fmt.Errorf("%s must be an unsigned integer", key)
	}
	if err != nil || parsed > uint64(^uint32(0)) {
		return 0, fmt.Errorf("%s must fit uint32", key)
	}
	return uint32(parsed), nil
}

func firstError(errors ...error) error {
	for _, err := range errors {
		if err != nil {
			return err
		}
	}
	return nil
}

type containerOpenConfirmation struct {
	EMsg        uint32
	Request     uint32
	ItemIDs     []uint64
	ExtraData   []uint64
	Message     string
	BodyHex     string
	Diagnostics []string
	Err         error
}

func (s *Service) waitForContainerOpenConfirmation(ctx context.Context, itemID uint64) containerOpenConfirmation {
	timeout := time.NewTimer(8 * time.Second)
	defer timeout.Stop()
	observed := make([]string, 0, 8)
	for {
		select {
		case <-ctx.Done():
			return containerOpenConfirmation{Err: fmt.Errorf("container open request timed out waiting for CS2 GC response: %w%s", ctx.Err(), formatObservedGCMessages(observed))}
		case <-timeout.C:
			return containerOpenConfirmation{Err: fmt.Errorf("container open request sent but CS2 GC did not confirm before timeout%s", formatObservedGCMessages(observed))}
		case event := <-s.gcClient.Events():
			if event.Type != "gc.message" {
				continue
			}
			message, ok := event.Payload.(transport.GCMessage)
			if !ok || message.AppID != protocol.AppIDCS2 {
				continue
			}
			observed = append(observed, fmt.Sprintf("emsg=%d bytes=%d", message.EMsg, len(message.Body)))
			if message.EMsg == protocol.EMsgUnlockCrateResponse {
				confirmation := containerOpenConfirmation{
					EMsg:        message.EMsg,
					Message:     "CS2 GC sent unlock crate response",
					BodyHex:     hex.EncodeToString(message.Body),
					Diagnostics: append([]string(nil), observed...),
				}
				confirmation.Err = fmt.Errorf("CS2 GC unlock crate response received, but no generated protobuf schema is available for response body: emsg=%d body_hex=%s", message.EMsg, confirmation.BodyHex)
				return confirmation
			}
			if message.EMsg == protocol.EMsgItemCustomizationNotification {
				notification, err := cs2pb.DecodeItemCustomizationNotification(message.Body)
				if err != nil {
					return containerOpenConfirmation{EMsg: message.EMsg, BodyHex: hex.EncodeToString(message.Body), Diagnostics: append([]string(nil), observed...), Err: fmt.Errorf("container open response decode failed: %w", err)}
				}
				req := notification.Request
				itemIDs := notification.ItemIDs
				extraData := notification.ExtraData

				confirmation := containerOpenConfirmation{
					EMsg:        message.EMsg,
					Request:     req,
					ItemIDs:     itemIDs,
					ExtraData:   extraData,
					BodyHex:     hex.EncodeToString(message.Body),
					Diagnostics: append([]string(nil), observed...),
				}

				switch req {
				case protocol.CustomizationUnlockCrate:
					confirmation.Message = "CS2 GC confirmed container unlock"
					return confirmation
				case protocol.CustomizationXRayItemReveal:
					confirmation.Message = "CS2 GC confirmed container reveal"
					return confirmation
				case protocol.CustomizationXRayItemClaim:
					confirmation.Message = "CS2 GC confirmed container claim"
					return confirmation
				case protocol.CustomizationCasketContents:
					confirmation.Message = "CS2 GC confirmed terminal offer contents (request 1012)"
					return confirmation
				}
				for _, id := range itemIDs {
					if id == itemID {
						confirmation.Message = fmt.Sprintf("CS2 GC accepted container open request request=%d", req)
						return confirmation
					}
				}
				confirmation.Message = fmt.Sprintf("CS2 GC sent item customization notification request=%d", req)
				return confirmation
			}
			if message.EMsg == protocol.EMsgGCClientWelcome {
				return containerOpenConfirmation{EMsg: message.EMsg, Message: "CS2 GC sent inventory update after container open request", BodyHex: hex.EncodeToString(message.Body), Diagnostics: append([]string(nil), observed...)}
			}
		}
	}
}

func formatObservedGCMessages(observed []string) string {
	if len(observed) == 0 {
		return "; observed_gc_messages=none"
	}
	return "; observed_gc_messages=" + strings.Join(observed, ",")
}

func (s *Service) applyNameTag(input map[string]any) (bool, string) {
	subjectItemID, _ := input["subjectItemId"].(string)
	toolItemID, _ := input["toolItemId"].(string)
	name, _ := input["name"].(string)
	if subjectItemID == "" || toolItemID == "" || name == "" {
		return false, "subject item, name tag tool, and custom name are required"
	}
	toolFound := false
	for _, item := range s.inventory.Items {
		if item.ID == toolItemID && item.IsNameTagTool {
			toolFound = true
			break
		}
	}
	if !toolFound {
		return false, "no usable name tag tool found in the current inventory"
	}
	for i := range s.inventory.Items {
		if s.inventory.Items[i].ID == subjectItemID {
			s.inventory.Items[i].CustomName = name
			s.inventory.Items[i].HasCustomName = true
			s.inventory.RefreshedAt = now()
			return true, "custom name applied"
		}
	}
	return false, "target item not found"
}

func (s *Service) removeNameTag(input map[string]any) (bool, string) {
	itemID, _ := input["itemId"].(string)
	if itemID == "" {
		return false, "item id is required"
	}
	for i := range s.inventory.Items {
		if s.inventory.Items[i].ID == itemID {
			if !s.inventory.Items[i].HasCustomName {
				return false, "selected item does not have a custom name"
			}
			s.inventory.Items[i].CustomName = ""
			s.inventory.Items[i].HasCustomName = false
			s.inventory.RefreshedAt = now()
			return true, "custom name removed"
		}
	}
	return false, "target item not found"
}
