package transport

import (
	"encoding/hex"
	"fmt"
	"unicode/utf8"

	"google.golang.org/protobuf/encoding/protowire"
)

func decodeRawProtoWireFormat(body []byte) (map[string]any, bool) {
	if len(body) == 0 {
		return map[string]any{}, true
	}
	result := make(map[string]any)
	for len(body) > 0 {
		num, wireType, consumed := protowire.ConsumeTag(body)
		if consumed < 0 {
			return nil, false
		}
		body = body[consumed:]
		fieldName := fmt.Sprintf("field_%d", num)
		value, remaining, ok := consumeRawProtoValue(body, wireType)
		if !ok {
			return nil, false
		}
		body = remaining
		appendRawField(result, fieldName, value)
	}
	return result, true
}

func consumeRawProtoValue(body []byte, wireType protowire.Type) (any, []byte, bool) {
	switch wireType {
	case protowire.VarintType:
		value, consumed := protowire.ConsumeVarint(body)
		return consumedRawValue(value, body, consumed)
	case protowire.Fixed32Type:
		value, consumed := protowire.ConsumeFixed32(body)
		return consumedRawValue(value, body, consumed)
	case protowire.Fixed64Type:
		value, consumed := protowire.ConsumeFixed64(body)
		return consumedRawValue(value, body, consumed)
	case protowire.BytesType:
		value, consumed := protowire.ConsumeBytes(body)
		if consumed < 0 {
			return nil, body, false
		}
		return decodeRawBytes(value), body[consumed:], true
	default:
		return nil, body, false
	}
}

func consumedRawValue(value any, body []byte, consumed int) (any, []byte, bool) {
	if consumed < 0 {
		return nil, body, false
	}
	return value, body[consumed:], true
}

func decodeRawBytes(value []byte) any {
	if utf8.Valid(value) && len(value) > 0 {
		return string(value)
	}
	if fields, ok := decodeRawProtoWireFormat(value); ok && len(fields) > 0 {
		return fields
	}
	return hex.EncodeToString(value)
}

func appendRawField(fields map[string]any, key string, value any) {
	existing, exists := fields[key]
	if !exists {
		fields[key] = value
		return
	}
	if values, isList := existing.([]any); isList {
		fields[key] = append(values, value)
		return
	}
	fields[key] = []any{existing, value}
}
