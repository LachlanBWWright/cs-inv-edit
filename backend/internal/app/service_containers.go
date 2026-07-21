package app

import (
	"context"
	"encoding/hex"
	"errors"
	"fmt"
	"strconv"
	"strings"
	"time"

	"cs-inv-edit/backend/internal/domain"
	cs2pb "cs-inv-edit/backend/internal/proto/generated"
	"cs-inv-edit/backend/internal/protocol"
	"cs-inv-edit/backend/internal/transport"

	"google.golang.org/protobuf/proto"
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
	OpenedItem      *domain.InventoryItem `json:"openedItem,omitempty"`
	ConsumedItemID  string                `json:"consumedItemId,omitempty"`
	RequestEMsg     uint32                `json:"requestEMsg,omitempty"`
	RequestMethod   string                `json:"requestMethod,omitempty"`
	RequestBodyHex  string                `json:"requestBodyHex,omitempty"`
	Confirmation    string                `json:"confirmation,omitempty"`
	ResponseEMsg    uint32                `json:"responseEMsg,omitempty"`
	ResponseBodyHex string                `json:"responseBodyHex,omitempty"`
	BeforeItemCount int                   `json:"beforeItemCount,omitempty"`
	AfterItemCount  int                   `json:"afterItemCount,omitempty"`
	Diagnostics     []string              `json:"diagnostics,omitempty"`
}

func (s *Service) openContainer(input map[string]any) (bool, string, *containerOpenResult) {
	itemID, _ := input["itemId"].(string)
	result := &containerOpenResult{ConsumedItemID: itemID}
	if itemID == "" {
		return false, "container item id is required", result
	}
	itemIDUint, err := strconv.ParseUint(itemID, 10, 64)
	if err != nil || itemIDUint == 0 {
		return false, "container item id must be a valid Steam item id", result
	}
	s.mu.Lock()
	beforeInventory := cloneInventory(s.inventory)
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
	toolItemID, err := optionalUint64Input(input, "keyItemId")
	if err != nil {
		return false, err.Error(), result
	}
	if len(found.RequiredKeyDefIndexes) > 0 && toolItemID == 0 {
		return false, "this container requires a compatible key, but none is owned", result
	}
	if len(found.RequiredKeyDefIndexes) == 0 && toolItemID != 0 {
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
			for _, defIndex := range found.RequiredKeyDefIndexes {
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
	result.RequestEMsg = protocol.EMsgOpenCrate
	result.RequestMethod = "open_crate_proto"
	body, err := proto.Marshal(openCrateMessage(itemIDUint, toolItemID))
	if err != nil {
		return false, "encode container open request failed: " + err.Error(), result
	}
	result.RequestBodyHex = hex.EncodeToString(body)
	ctx, cancel := context.WithTimeout(context.Background(), 8*time.Second)
	defer cancel()
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
	if snapshot, openedItem, err := s.reconcileContainerOpenOnce(beforeInventory); err == nil && openedItem != nil {
		result.AfterItemCount = len(snapshot.Items)
		result.OpenedItem = openedItem
		snapshot.Message = fmt.Sprintf("Container opened: %s", openedInventoryItemName(openedItem))
		s.mu.Lock()
		s.inventory = snapshot
		s.mu.Unlock()
		return true, snapshot.Message, result
	} else if err != nil {
		result.Diagnostics = append(result.Diagnostics, err.Error())
	}
	return false, "container open response received, but the awarded item could not be decoded from GC response", result
}

func openCrateMessage(subjectItemID uint64, toolItemID uint64) *cs2pb.CMsgOpenCrate {
	message := &cs2pb.CMsgOpenCrate{SubjectItemId: proto.Uint64(subjectItemID)}
	if toolItemID != 0 {
		message.ToolItemId = proto.Uint64(toolItemID)
	}
	return message
}

func (s *Service) reconcileContainerOpenOnce(before domain.InventorySnapshot) (domain.InventorySnapshot, *domain.InventoryItem, error) {
	beforeIDs := make(map[string]struct{}, len(before.Items))
	for _, item := range before.Items {
		beforeIDs[item.ID] = struct{}{}
	}
	snapshot, err := s.fetchInventory(nil)
	if err != nil {
		return domain.InventorySnapshot{}, nil, fmt.Errorf("post-open inventory refresh failed: %w", err)
	}
	for i := range snapshot.Items {
		if _, existed := beforeIDs[snapshot.Items[i].ID]; !existed {
			return snapshot, &snapshot.Items[i], nil
		}
	}
	return snapshot, nil, fmt.Errorf("post-open inventory refresh found no new item; before_count=%d after_count=%d", len(before.Items), len(snapshot.Items))
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
	haystack := strings.ToLower(item.Kind + " " + item.Name + " " + item.MarketName)
	return item.Kind == "container" || len(item.ContainerItems) > 0 || strings.Contains(haystack, "capsule") || strings.Contains(haystack, "case") || strings.Contains(haystack, "container") || strings.Contains(haystack, "graffiti box")
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
				notification := new(cs2pb.CMsgGCItemCustomizationNotification)
				if err := proto.Unmarshal(message.Body, notification); err != nil {
					return containerOpenConfirmation{EMsg: message.EMsg, BodyHex: hex.EncodeToString(message.Body), Diagnostics: append([]string(nil), observed...), Err: fmt.Errorf("container open response decode failed: %w", err)}
				}
				switch notification.GetRequest() {
				case protocol.CustomizationUnlockCrate:
					return containerOpenConfirmation{EMsg: message.EMsg, Message: "CS2 GC confirmed container unlock", BodyHex: hex.EncodeToString(message.Body), Diagnostics: append([]string(nil), observed...)}
				case protocol.CustomizationXRayItemReveal:
					return containerOpenConfirmation{EMsg: message.EMsg, Message: "CS2 GC confirmed container reveal", BodyHex: hex.EncodeToString(message.Body), Diagnostics: append([]string(nil), observed...)}
				case protocol.CustomizationXRayItemClaim:
					return containerOpenConfirmation{EMsg: message.EMsg, Message: "CS2 GC confirmed container claim", BodyHex: hex.EncodeToString(message.Body), Diagnostics: append([]string(nil), observed...)}
				}
				for _, id := range notification.GetItemId() {
					if id == itemID {
						return containerOpenConfirmation{EMsg: message.EMsg, Message: fmt.Sprintf("CS2 GC accepted container open request request=%d", notification.GetRequest()), BodyHex: hex.EncodeToString(message.Body), Diagnostics: append([]string(nil), observed...)}
					}
				}
				return containerOpenConfirmation{EMsg: message.EMsg, Message: fmt.Sprintf("CS2 GC sent item customization notification request=%d", notification.GetRequest()), BodyHex: hex.EncodeToString(message.Body), Diagnostics: append([]string(nil), observed...)}
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
			s.inventory.Items[i].MarketName = s.inventory.Items[i].MarketName
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
