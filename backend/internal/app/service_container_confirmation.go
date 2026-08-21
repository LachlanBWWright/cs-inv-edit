package app

import (
	"context"
	"encoding/hex"
	"fmt"
	"slices"
	"strings"
	"time"

	cs2pb "cs-inv-edit/backend/internal/proto/gametracking"
	"cs-inv-edit/backend/internal/protocol"
	"cs-inv-edit/backend/internal/transport"
)

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

func terminalContentsConfirmation(message transport.GCMessage, terminalID uint64, observed []string) *containerOpenConfirmation {
	notification, err := cs2pb.DecodeItemCustomizationNotification(message.Body)
	if err != nil || notification.Request != protocol.CustomizationCasketContents {
		return nil
	}
	if len(notification.ItemIDs) > 0 && !slices.Contains(notification.ItemIDs, terminalID) {
		return nil
	}
	return &containerOpenConfirmation{
		EMsg: message.EMsg, Request: notification.Request, ItemIDs: notification.ItemIDs,
		ExtraData: notification.ExtraData, BodyHex: hex.EncodeToString(message.Body),
		Message:     "CS2 GC confirmed terminal casket contents (request 1012)",
		Diagnostics: append([]string(nil), observed...),
	}
}

func collectTerminalCandidates(target map[uint64]transport.GCVirtualEconItem, items []transport.GCVirtualEconItem, terminalID uint64, excludePrevious bool, previous map[uint64]struct{}) {
	for _, item := range items {
		if !virtualItemBelongsToTerminal(item, terminalID) {
			continue
		}
		if _, found := previous[item.ID]; excludePrevious && found {
			continue
		}
		target[item.ID] = item
	}
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
