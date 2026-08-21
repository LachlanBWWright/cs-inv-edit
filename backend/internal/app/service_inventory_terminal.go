package app

import (
	"fmt"
	"sort"
	"strconv"
	"strings"
	"time"

	"cs-inv-edit/backend/internal/domain"
	"cs-inv-edit/backend/internal/econ"
	"cs-inv-edit/backend/internal/protocol"
	"cs-inv-edit/backend/internal/transport"
)

func relatedItemForFauxID(fauxItemID uint64, candidates []domain.RelatedItem) (domain.RelatedItem, bool) {
	type identity struct {
		defindex uint32
		paintKit uint32
	}
	identities := []identity{
		{defindex: uint32(fauxItemID & 0xffff), paintKit: uint32((fauxItemID >> 16) & 0xffff)},
		{defindex: uint32((fauxItemID >> 16) & 0xffff), paintKit: uint32(fauxItemID & 0xffff)},
		{defindex: uint32(fauxItemID), paintKit: uint32(fauxItemID >> 32)},
		{defindex: uint32(fauxItemID >> 32), paintKit: uint32(fauxItemID)},
	}
	for _, identity := range identities {
		for _, candidate := range candidates {
			if candidate.Defindex == identity.defindex && candidate.PaintKit == identity.paintKit {
				return candidate, true
			}
		}
	}
	return domain.RelatedItem{Name: fmt.Sprintf("Volatile terminal offer %d", fauxItemID)}, false
}

func activeTerminalStateDiagnostics(item transport.GCInventoryItem) []string {
	points, pointsPresent := item.Attributes[169]
	expiration, expirationPresent := item.Attributes[183]
	volatileKind, volatilePresent := item.Attributes[315]
	expirationText := "unset"
	if expirationPresent {
		expirationText = time.Unix(int64(expiration), 0).UTC().Format(time.RFC3339)
	}
	return []string{
		fmt.Sprintf(
			"Terminal classification: active=true because schema identity contains terminal and the GC instance is in the active-terminal slot, inventory=%d (0x%08x; active-terminal position=%d), quantity=%d, quality=%d; schema display name is intentionally overridden from sealed to active",
			item.Inventory, item.Inventory, xRayScannerLoadedCaseInventoryPosition, item.Quantity, item.Quality,
		),
		fmt.Sprintf(
			"Terminal state attributes: quest_points_remaining(#169)=%s, expiration_date(#183)=%s [raw=%s], volatile_container(#315)=%s; instance_attribute_count=%d, byte_attributes={%s}",
			optionalAttributeUint32(points, pointsPresent), expirationText, optionalAttributeUint32(expiration, expirationPresent), optionalAttributeUint32(volatileKind, volatilePresent), len(item.Attributes), rawByteAttributeSummary(item.AttributeBytes),
		),
		fmt.Sprintf(
			"Terminal protocol routing: resume/current-offer=EMsg %d CMsgCasketItem(casket=terminal,item=terminal); next/reject=EMsg %d CMsgOpenCrate(tool=terminal,subject=terminal,points_remaining=#169); purchase=Steam store init(item_def_id=%d,supplemental_data=%d,cost=offer_attribute_316)",
			protocol.EMsgVolatileItemLoadContents, protocol.EMsgOpenCrate, item.DefIndex, item.ID,
		),
	}
}

func terminalOfferDiagnostic(item transport.GCInventoryItem, metadata econ.Metadata) string {
	return fmt.Sprintf(
		"Terminal current offer: item_id=%d, original_id=%d, defindex=%d, casket_id=%d, inventory=%d (0x%08x), quantity=%d, quality=%d, rarity=%d, paint_kit=%d, paint_wear=%s, name=%q, market_name=%q, kind=%q, schema_rarity=%q, purchase_price(#316)=%d, attributes={%s}, byte_attributes={%s}",
		item.ID, item.OriginalID, item.DefIndex, gcItemCasketID(item), item.Inventory, item.Inventory, item.Quantity, item.Quality, item.Rarity, item.PaintKit,
		optionalFloatString(item.PaintWear), metadata.Name, metadata.MarketName, metadata.Kind, metadata.Rarity, item.Attributes[316], rawAttributeSummary(item.Attributes), rawByteAttributeSummary(item.AttributeBytes),
	)
}

func rawAttributeSummary(attributes map[uint32]uint32) string {
	ids := make([]int, 0, len(attributes))
	for id := range attributes {
		ids = append(ids, int(id))
	}
	sort.Ints(ids)
	parts := make([]string, 0, len(ids))
	for _, id := range ids {
		value := attributes[uint32(id)]
		parts = append(parts, fmt.Sprintf("#%d=%d/0x%08x", id, value, value))
	}
	if len(parts) == 0 {
		return "none"
	}
	return strings.Join(parts, ",")
}

func rawByteAttributeSummary(attributes map[uint32][]byte) string {
	ids := make([]int, 0, len(attributes))
	for id := range attributes {
		ids = append(ids, int(id))
	}
	sort.Ints(ids)
	parts := make([]string, 0, len(ids))
	for _, id := range ids {
		parts = append(parts, fmt.Sprintf("#%d=%x", id, attributes[uint32(id)]))
	}
	if len(parts) == 0 {
		return "none"
	}
	return strings.Join(parts, ",")
}

func optionalAttributeUint32(value uint32, present bool) string {
	if !present {
		return "unset"
	}
	return fmt.Sprintf("%d/0x%08x", value, value)
}

func optionalUint32String(value *uint32) string {
	if value == nil {
		return "unset"
	}
	return strconv.FormatUint(uint64(*value), 10)
}

func activeTerminalItemIDs(metadata *econ.Schema, items []transport.GCInventoryItem) []uint64 {
	result := make([]uint64, 0)
	for _, item := range items {
		itemMetadata := metadata.Metadata(item.DefIndex, item.PaintKit, item.Attributes)
		if isActiveTerminalGCItem(item, itemMetadata) {
			result = append(result, item.ID)
		}
	}
	return result
}

const xRayScannerLoadedCaseInventoryPosition uint32 = 0xc0000005

// The GC retains the consumed container used by the X-Ray Scanner as a
// zero-quantity economy object in a scanner-only inventory position. CS2's
// Panorama client exposes it through the separate "xraymachine" filter rather
// than the player's regular inventory.
func isXRayScannerLoadedCase(item transport.GCInventoryItem, metadata econ.Metadata) bool {
	return metadata.Kind == domain.ItemKindContainer &&
		!isTerminalGCItem(item, metadata) &&
		item.Quantity == 0 &&
		item.Inventory == xRayScannerLoadedCaseInventoryPosition
}

const volatileContainerAttributeDefIndex uint32 = 315

func isTerminalGCItem(item transport.GCInventoryItem, metadata econ.Metadata) bool {
	value, present := item.Attributes[volatileContainerAttributeDefIndex]
	return metadata.IsVolatileContainer || present && value != 0
}

func isActiveTerminalGCItem(item transport.GCInventoryItem, metadata econ.Metadata) bool {
	return isTerminalGCItem(item, metadata) &&
		item.Quantity == 0 &&
		item.Inventory == xRayScannerLoadedCaseInventoryPosition
}

func activeTerminalName(name string) string {
	trimmed := strings.TrimSpace(name)
	if trimmed == "" || strings.HasPrefix(strings.ToLower(trimmed), "active ") {
		return trimmed
	}
	if strings.HasPrefix(strings.ToLower(trimmed), "sealed ") {
		trimmed = strings.TrimSpace(trimmed[len("sealed "):])
	}
	return "Active " + trimmed
}

func boolPointer(value bool) *bool {
	return &value
}

func gcItemCasketID(item transport.GCInventoryItem) uint64 {
	return uint64(item.Attributes[272]) | uint64(item.Attributes[273])<<32
}
