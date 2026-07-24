package econ

import (
	"fmt"
	"math"
	"sort"
	"strconv"
	"strings"
	"time"
)

func (s *Schema) decodeAttributes(values map[uint32]uint32) []DecodedEconAttribute {
	indices := make([]int, 0, len(values))
	for index := range values {
		indices = append(indices, int(index))
	}
	sort.Ints(indices)
	out := make([]DecodedEconAttribute, 0, len(indices))
	for _, numericIndex := range indices {
		index := uint32(numericIndex)
		raw := values[index]
		definition, known := s.attributes[index]
		name := definition.Name
		if name == "" {
			name = fmt.Sprintf("Unknown attribute %d", index)
		}
		out = append(out, DecodedEconAttribute{DefIndex: index, Name: name, Value: s.decodeAttributeValue(raw, definition, known), RawValue: raw})
	}
	return out
}

func (s *Schema) decodeAttributeValue(raw uint32, definition econAttributeDefinition, known bool) string {
	if definition.DescriptionFormat == "value_is_date" || strings.Contains(definition.AttributeClass, "tradable_after") {
		return time.Unix(int64(raw), 0).UTC().Format("2 Jan 2006, 15:04 UTC")
	}
	identity := strings.ToLower(definition.Name + " " + definition.AttributeClass)
	if strings.Contains(identity, "sticker") {
		if sticker, ok := s.stickerKits[raw]; ok {
			name := firstNonEmpty(s.localize(sticker.ItemName), humanizeIdentifier(sticker.Name))
			if name != "" {
				return fmt.Sprintf("%s (kit #%d)", name, raw)
			}
		}
	}
	if definition.StoredAsInteger || !known {
		return strconv.FormatUint(uint64(raw), 10)
	}
	value := math.Float32frombits(raw)
	if math.IsNaN(float64(value)) || math.IsInf(float64(value), 0) {
		return strconv.FormatUint(uint64(raw), 10)
	}
	return strconv.FormatFloat(float64(value), 'f', -1, 32)
}

func (s *Schema) tradableAfterFromAttributes(values map[uint32]uint32) string {
	for index, raw := range values {
		definition := s.attributes[index]
		if definition.DescriptionFormat != "value_is_date" && !strings.Contains(definition.AttributeClass, "tradable_after") {
			continue
		}
		if raw == 0 {
			return ""
		}
		return time.Unix(int64(raw), 0).UTC().Format(time.RFC3339)
	}
	return ""
}
