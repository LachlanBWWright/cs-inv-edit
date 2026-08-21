package app

import (
	"context"
	"encoding/hex"
	"errors"
	"fmt"
	"strconv"
	"time"

	"cs-inv-edit/backend/internal/domain"
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
	Kind containerOpenResultKind `json:"kind"`

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

type containerOpenResultKind string

const (
	containerOpenResultInventoryAward   containerOpenResultKind = "inventory_award"
	containerOpenResultTerminalOffer    containerOpenResultKind = "terminal_offer"
	containerOpenResultTerminalUnsealed containerOpenResultKind = "terminal_unsealed"
)

func (s *Service) isTerminalContainer(item domain.InventoryItem) bool {
	return isTerminalInventoryItem(item)
}

func (s *Service) openContainer(input map[string]any) (bool, string, *containerOpenResult) {
	itemID, _ := input["itemId"].(string)
	result := &containerOpenResult{ConsumedItemID: itemID, Kind: containerOpenResultInventoryAward}
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
	result.Kind = containerOpenResultInventoryAward
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
				if confirmation := terminalContentsConfirmation(message, terminalID, observed); confirmation != nil {
					matching1012Confirmation = confirmation
				}
			}

			if message.EMsg == protocol.EMsgSOCreate || message.EMsg == protocol.EMsgSOUpdate || message.EMsg == protocol.EMsgSOSingleObject || message.EMsg == protocol.EMsgSOCacheSubscribed || message.EMsg == protocol.EMsgSOUpdateMultiple {
				if items, err := transport.DecodeCS2VirtualEconItems(message.EMsg, message.Body); err == nil {
					collectTerminalCandidates(virtualCandidatesByID, items, terminalID, pointsRemaining != nil, previousOfferIDs)
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
		result.Kind = containerOpenResultTerminalOffer
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
