package tf2tracking

import (
	_ "embed"
	"fmt"
	"strings"
	"sync"

	"cs-inv-edit/backend/internal/proto/tracking"
	"google.golang.org/protobuf/encoding/protojson"
	"google.golang.org/protobuf/proto"
	"google.golang.org/protobuf/reflect/protodesc"
	"google.golang.org/protobuf/reflect/protoreflect"
	"google.golang.org/protobuf/reflect/protoregistry"
	"google.golang.org/protobuf/types/descriptorpb"
	"google.golang.org/protobuf/types/dynamicpb"
)

//go:embed gametracking_tf2.pb
var descriptorBytes []byte

var (
	descriptorOnce  sync.Once
	descriptorFiles *protoregistry.Files
	descriptorErr   error
)

func Marshal(name string, values map[string]uint64) ([]byte, error) {
	message, err := newMessage(name)
	if err != nil {
		return nil, err
	}
	fields := message.Descriptor().Fields()
	for name, value := range values {
		field := fields.ByName(protoreflect.Name(name))
		if field == nil {
			return nil, fmt.Errorf("TF2 message %s has no field %s", message.Descriptor().Name(), name)
		}
		switch field.Kind() {
		case protoreflect.Int32Kind, protoreflect.Sint32Kind, protoreflect.Sfixed32Kind:
			message.Set(field, protoreflect.ValueOfInt32(int32(value)))
		case protoreflect.Int64Kind, protoreflect.Sint64Kind, protoreflect.Sfixed64Kind:
			message.Set(field, protoreflect.ValueOfInt64(int64(value)))
		case protoreflect.Uint32Kind, protoreflect.Fixed32Kind:
			message.Set(field, protoreflect.ValueOfUint32(uint32(value)))
		case protoreflect.Uint64Kind, protoreflect.Fixed64Kind:
			message.Set(field, protoreflect.ValueOfUint64(value))
		case protoreflect.EnumKind:
			message.Set(field, protoreflect.ValueOfEnum(protoreflect.EnumNumber(value)))
		default:
			return nil, fmt.Errorf("TF2 field %s.%s is not numeric", message.Descriptor().Name(), name)
		}
	}
	return proto.MarshalOptions{Deterministic: true}.Marshal(message)
}

func MarshalFields(name string, values map[string]any) ([]byte, error) {
	message, err := newMessage(name)
	if err != nil {
		return nil, err
	}
	if err := tracking.SetFields(message, values); err != nil {
		return nil, err
	}
	return proto.MarshalOptions{Deterministic: true}.Marshal(message)
}

func UnmarshalMessage(name string, body []byte) (*dynamicpb.Message, error) {
	message, err := newMessage(name)
	if err != nil {
		return nil, err
	}
	if err := proto.Unmarshal(body, message); err != nil {
		return nil, fmt.Errorf("decode TF2 %s: %w", name, err)
	}
	return message, nil
}

func DecodeMessageJSON(name string, body []byte) ([]byte, error) {
	message, err := newMessage(name)
	if err != nil {
		return nil, err
	}
	if err := proto.Unmarshal(body, message); err != nil {
		return nil, fmt.Errorf("decode TF2 %s: %w", name, err)
	}
	return protojson.MarshalOptions{UseProtoNames: true}.Marshal(message)
}

func MessageNameForEMsg(emsg uint32) (string, bool) {
	files, err := files()
	if err != nil {
		return "", false
	}
	// Upstream enum identifiers whose word order does not mechanically match
	// their upstream message name.
	exceptions := map[uint32]string{
		24:   "CMsgSOCacheSubscribed",
		1063: "CMsgSelectPresetForClass",
		1064: "CMsgSetPresetItemPosition",
		1080: "CMsgGCClientMarketDataRequest",
		1081: "CMsgGCClientMarketData",
	}
	if name, ok := exceptions[emsg]; ok {
		if descriptor, findErr := files.FindDescriptorByName(protoreflect.FullName(name)); findErr == nil {
			if _, isMessage := descriptor.(protoreflect.MessageDescriptor); isMessage {
				return name, true
			}
		}
	}
	found := ""
	files.RangeFiles(func(file protoreflect.FileDescriptor) bool {
		enums := file.Enums()
		for index := 0; index < enums.Len(); index++ {
			value := enums.Get(index).Values().ByNumber(protoreflect.EnumNumber(emsg))
			if value == nil || !strings.HasPrefix(string(value.Name()), "k_EMsg") {
				continue
			}
			raw := strings.TrimPrefix(string(value.Name()), "k_EMsg")
			for _, candidate := range []string{"CMsg" + raw, "CMsg" + strings.TrimPrefix(raw, "GC"), "CMsgGC" + strings.TrimPrefix(raw, "GC_")} {
				descriptor, findErr := files.FindDescriptorByName(protoreflect.FullName(candidate))
				if findErr == nil {
					if _, ok := descriptor.(protoreflect.MessageDescriptor); ok {
						found = candidate
						return false
					}
				}
			}
		}
		return true
	})
	return found, found != ""
}

func newMessage(name string) (*dynamicpb.Message, error) {
	files, err := files()
	if err != nil {
		return nil, err
	}
	descriptor, err := files.FindDescriptorByName(protoreflect.FullName(name))
	if err != nil {
		return nil, fmt.Errorf("TF2 descriptor %s: %w", name, err)
	}
	message, ok := descriptor.(protoreflect.MessageDescriptor)
	if !ok {
		return nil, fmt.Errorf("TF2 descriptor %s is not a message", name)
	}
	return dynamicpb.NewMessage(message), nil
}

func files() (*protoregistry.Files, error) {
	descriptorOnce.Do(func() {
		var set descriptorpb.FileDescriptorSet
		if err := proto.Unmarshal(descriptorBytes, &set); err != nil {
			descriptorErr = fmt.Errorf("decode TF2 descriptor set: %w", err)
			return
		}
		descriptorFiles, descriptorErr = protodesc.NewFiles(&set)
	})
	return descriptorFiles, descriptorErr
}
