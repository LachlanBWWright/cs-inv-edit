package app

import (
	"context"
	"encoding/hex"
	"fmt"
	"sort"
	"strconv"
	"time"

	"cs-inv-edit/backend/internal/domain"
	"cs-inv-edit/backend/internal/operations"
	cs2pb "cs-inv-edit/backend/internal/proto/gametracking"
	"cs-inv-edit/backend/internal/protocol"
	"cs-inv-edit/backend/internal/transport"
)

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
			Kind:            containerOpenResultTerminalOffer,
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
	result := &containerOpenResult{Kind: containerOpenResultTerminalOffer, TerminalItemID: terminalIDText}
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
				if confirmation := terminalContentsConfirmation(message, terminalID, observed); confirmation != nil {
					matching1012Confirmation = confirmation
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
		result.Kind = containerOpenResultTerminalOffer
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

	var name, marketName, rarity, imageURL, price string
	var kind domain.ItemKind
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
		kind = domain.ItemKindWeaponSkin
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
