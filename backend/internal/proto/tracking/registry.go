package tracking

import (
	"fmt"

	"google.golang.org/protobuf/encoding/protojson"
	"google.golang.org/protobuf/proto"
	"google.golang.org/protobuf/reflect/protodesc"
	"google.golang.org/protobuf/reflect/protoreflect"
	"google.golang.org/protobuf/reflect/protoregistry"
	"google.golang.org/protobuf/types/descriptorpb"
	"google.golang.org/protobuf/types/dynamicpb"
)

// Registry is an isolated view of one GameTracking protobuf tree. Isolation is
// required because Valve's game protobufs intentionally use package-less,
// overlapping message names.
type Registry struct {
	game  string
	files *protoregistry.Files
}

func Load(game string, descriptorSet []byte) (*Registry, error) {
	set := new(descriptorpb.FileDescriptorSet)
	if err := proto.Unmarshal(descriptorSet, set); err != nil {
		return nil, fmt.Errorf("decode %s GameTracking descriptor set: %w", game, err)
	}
	files, err := protodesc.NewFiles(set)
	if err != nil {
		return nil, fmt.Errorf("load %s GameTracking descriptors: %w", game, err)
	}
	return &Registry{game: game, files: files}, nil
}

func (r *Registry) NewMessage(name string) (*dynamicpb.Message, error) {
	descriptor, err := r.files.FindDescriptorByName(protoreflect.FullName(name))
	if err != nil {
		return nil, fmt.Errorf("%s GameTracking descriptor %s: %w", r.game, name, err)
	}
	message, ok := descriptor.(protoreflect.MessageDescriptor)
	if !ok {
		return nil, fmt.Errorf("%s GameTracking descriptor %s is not a message", r.game, name)
	}
	return dynamicpb.NewMessage(message), nil
}

func (r *Registry) Unmarshal(name string, body []byte) (*dynamicpb.Message, error) {
	message, err := r.NewMessage(name)
	if err != nil {
		return nil, err
	}
	if err := proto.Unmarshal(body, message); err != nil {
		return nil, fmt.Errorf("decode %s %s: %w", r.game, name, err)
	}
	return message, nil
}

func (r *Registry) Marshal(name string, fields map[string]any) ([]byte, error) {
	message, err := r.NewMessage(name)
	if err != nil {
		return nil, err
	}
	if err := SetFields(message, fields); err != nil {
		return nil, err
	}
	return proto.MarshalOptions{Deterministic: true}.Marshal(message)
}

func (r *Registry) DecodeJSON(name string, body []byte) ([]byte, error) {
	message, err := r.Unmarshal(name, body)
	if err != nil {
		return nil, err
	}
	return protojson.MarshalOptions{UseProtoNames: true}.Marshal(message)
}

func (r *Registry) EnumValue(enumName, valueName string) (uint32, error) {
	descriptor, err := r.files.FindDescriptorByName(protoreflect.FullName(enumName))
	if err != nil {
		return 0, err
	}
	enum, ok := descriptor.(protoreflect.EnumDescriptor)
	if !ok {
		return 0, fmt.Errorf("%s GameTracking descriptor %s is not an enum", r.game, enumName)
	}
	value := enum.Values().ByName(protoreflect.Name(valueName))
	if value == nil {
		return 0, fmt.Errorf("%s GameTracking enum %s has no value %s", r.game, enumName, valueName)
	}
	return uint32(value.Number()), nil
}

func SetFields(message protoreflect.Message, values map[string]any) error {
	for name, value := range values {
		field := message.Descriptor().Fields().ByName(protoreflect.Name(name))
		if field == nil {
			return fmt.Errorf("GameTracking message %s has no field %s", message.Descriptor().Name(), name)
		}
		if err := setField(message, field, value); err != nil {
			return fmt.Errorf("%s.%s: %w", message.Descriptor().Name(), name, err)
		}
	}
	return nil
}

func setField(message protoreflect.Message, field protoreflect.FieldDescriptor, source any) error {
	if field.IsList() {
		values, ok := source.([]any)
		if !ok {
			return fmt.Errorf("repeated field requires []any, got %T", source)
		}
		list := message.Mutable(field).List()
		for _, value := range values {
			converted, err := fieldValue(field, value)
			if err != nil {
				return err
			}
			list.Append(converted)
		}
		return nil
	}
	value, err := fieldValue(field, source)
	if err != nil {
		return err
	}
	message.Set(field, value)
	return nil
}

func fieldValue(field protoreflect.FieldDescriptor, source any) (protoreflect.Value, error) {
	switch field.Kind() {
	case protoreflect.BoolKind:
		value, ok := source.(bool)
		if !ok {
			return protoreflect.Value{}, fmt.Errorf("requires bool, got %T", source)
		}
		return protoreflect.ValueOfBool(value), nil
	case protoreflect.StringKind:
		value, ok := source.(string)
		if !ok {
			return protoreflect.Value{}, fmt.Errorf("requires string, got %T", source)
		}
		return protoreflect.ValueOfString(value), nil
	case protoreflect.BytesKind:
		value, ok := source.([]byte)
		if !ok {
			return protoreflect.Value{}, fmt.Errorf("requires []byte, got %T", source)
		}
		return protoreflect.ValueOfBytes(value), nil
	case protoreflect.Int32Kind, protoreflect.Sint32Kind, protoreflect.Sfixed32Kind:
		value, ok := signed(source)
		if !ok {
			return protoreflect.Value{}, fmt.Errorf("requires integer, got %T", source)
		}
		return protoreflect.ValueOfInt32(int32(value)), nil
	case protoreflect.Int64Kind, protoreflect.Sint64Kind, protoreflect.Sfixed64Kind:
		value, ok := signed(source)
		if !ok {
			return protoreflect.Value{}, fmt.Errorf("requires integer, got %T", source)
		}
		return protoreflect.ValueOfInt64(value), nil
	case protoreflect.Uint32Kind, protoreflect.Fixed32Kind:
		value, ok := unsigned(source)
		if !ok {
			return protoreflect.Value{}, fmt.Errorf("requires unsigned integer, got %T", source)
		}
		return protoreflect.ValueOfUint32(uint32(value)), nil
	case protoreflect.Uint64Kind, protoreflect.Fixed64Kind:
		value, ok := unsigned(source)
		if !ok {
			return protoreflect.Value{}, fmt.Errorf("requires unsigned integer, got %T", source)
		}
		return protoreflect.ValueOfUint64(value), nil
	case protoreflect.FloatKind:
		value, ok := source.(float32)
		if !ok {
			return protoreflect.Value{}, fmt.Errorf("requires float32, got %T", source)
		}
		return protoreflect.ValueOfFloat32(value), nil
	case protoreflect.DoubleKind:
		value, ok := source.(float64)
		if !ok {
			return protoreflect.Value{}, fmt.Errorf("requires float64, got %T", source)
		}
		return protoreflect.ValueOfFloat64(value), nil
	case protoreflect.EnumKind:
		value, ok := signed(source)
		if !ok {
			return protoreflect.Value{}, fmt.Errorf("requires enum number, got %T", source)
		}
		return protoreflect.ValueOfEnum(protoreflect.EnumNumber(value)), nil
	case protoreflect.MessageKind, protoreflect.GroupKind:
		values, ok := source.(map[string]any)
		if !ok {
			return protoreflect.Value{}, fmt.Errorf("requires map[string]any, got %T", source)
		}
		nested := dynamicpb.NewMessage(field.Message())
		if err := SetFields(nested, values); err != nil {
			return protoreflect.Value{}, err
		}
		return protoreflect.ValueOfMessage(nested), nil
	default:
		return protoreflect.Value{}, fmt.Errorf("unsupported kind %s", field.Kind())
	}
}

func unsigned(value any) (uint64, bool) {
	switch typed := value.(type) {
	case uint:
		return uint64(typed), true
	case uint32:
		return uint64(typed), true
	case uint64:
		return typed, true
	case int:
		return uint64(typed), typed >= 0
	case int32:
		return uint64(typed), typed >= 0
	case int64:
		return uint64(typed), typed >= 0
	default:
		return 0, false
	}
}

func signed(value any) (int64, bool) {
	switch typed := value.(type) {
	case int:
		return int64(typed), true
	case int32:
		return int64(typed), true
	case int64:
		return typed, true
	case uint32:
		return int64(typed), true
	case uint64:
		return int64(typed), typed <= uint64(^uint64(0)>>1)
	default:
		return 0, false
	}
}

func Field(message protoreflect.Message, name string) protoreflect.FieldDescriptor {
	return message.Descriptor().Fields().ByName(protoreflect.Name(name))
}

func Uint(message protoreflect.Message, name string) uint64 {
	field := Field(message, name)
	if field == nil {
		return 0
	}
	if field.Kind() == protoreflect.EnumKind {
		return uint64(message.Get(field).Enum())
	}
	return message.Get(field).Uint()
}

func Int(message protoreflect.Message, name string) int64 {
	field := Field(message, name)
	if field == nil {
		return 0
	}
	return message.Get(field).Int()
}

func String(message protoreflect.Message, name string) string {
	field := Field(message, name)
	if field == nil {
		return ""
	}
	return message.Get(field).String()
}

func Bytes(message protoreflect.Message, name string) []byte {
	field := Field(message, name)
	if field == nil {
		return nil
	}
	return message.Get(field).Bytes()
}

func Bool(message protoreflect.Message, name string) bool {
	field := Field(message, name)
	return field != nil && message.Get(field).Bool()
}

func Has(message protoreflect.Message, name string) bool {
	field := Field(message, name)
	return field != nil && message.Has(field)
}

func List(message protoreflect.Message, name string) protoreflect.List {
	return message.Get(Field(message, name)).List()
}
