package gametracking

import (
	_ "embed"
	"fmt"
	"strings"
	"sync"

	"google.golang.org/protobuf/encoding/protojson"
	"google.golang.org/protobuf/proto"
	"google.golang.org/protobuf/reflect/protodesc"
	"google.golang.org/protobuf/reflect/protoreflect"
	"google.golang.org/protobuf/reflect/protoregistry"
	"google.golang.org/protobuf/types/descriptorpb"
	"google.golang.org/protobuf/types/dynamicpb"
)

//go:embed gametracking_store.pb
var descriptorBytes []byte

var descriptorOnce sync.Once
var descriptorFiles *protoregistry.Files
var descriptorErr error

type StoreUserData struct {
	Result            int32
	Currency          int32
	Country           string
	PriceSheetVersion uint32
	PriceSheet        []byte
}
type StorePurchaseLine struct {
	ItemDefID            uint32
	Quantity             uint32
	Cost                 uint64
	PurchaseType         uint32
	SupplementalData     uint64
	OmitItemDefID        bool
	OmitQuantity         bool
	OmitCost             bool
	PurchaseTypePresent  bool
	OmitSupplementalData bool
}
type StorePurchaseRequest struct {
	Country         string
	Language        int32
	Currency        int32
	CountryPresent  bool
	LanguagePresent bool
	OmitCurrency    bool
	Lines           []StorePurchaseLine
}
type StorePurchaseResponse struct {
	Result        int32
	TransactionID uint64
	URL           string
	ItemIDs       []uint64
}

type ClientWelcomeStoreContext struct {
	Currency int32
	Country  string
}

func EnumValue(enumName, valueName string) (uint32, error) {
	files, err := files()
	if err != nil {
		return 0, err
	}
	descriptor, err := files.FindDescriptorByName(protoreflect.FullName(enumName))
	if err != nil {
		return 0, err
	}
	enum, ok := descriptor.(protoreflect.EnumDescriptor)
	if !ok {
		return 0, fmt.Errorf("GameTracking descriptor %s is not an enum", enumName)
	}
	value := enum.Values().ByName(protoreflect.Name(valueName))
	if value == nil {
		return 0, fmt.Errorf("GameTracking enum %s has no value %s", enumName, valueName)
	}
	return uint32(value.Number()), nil
}

func DecodeMessageJSON(name string, body []byte) ([]byte, error) {
	message, err := newMessage(name)
	if err != nil {
		return nil, err
	}
	if err := proto.Unmarshal(body, message); err != nil {
		return nil, fmt.Errorf("decode %s: %w", name, err)
	}
	return protojson.MarshalOptions{UseProtoNames: true, EmitUnpopulated: false}.Marshal(message)
}

func MessageNameForEMsg(emsg uint32) (string, bool) {
	files, err := files()
	if err != nil {
		return "", false
	}
	// The shared GC system enum retains "GC" in these EMsg identifiers, but
	// the corresponding gcsdk message types do not. Keep these authoritative
	// upstream exceptions explicit instead of guessing a nonexistent name.
	baseGCMessageNames := map[uint32]string{
		21:   "CMsgSOSingleObject",
		22:   "CMsgSOSingleObject",
		23:   "CMsgSOSingleObject",
		24:   "CMsgSOCacheSubscribed",
		25:   "CMsgSOCacheUnsubscribed",
		26:   "CMsgSOMultipleObjects",
		27:   "CMsgSOCacheSubscriptionCheck",
		28:   "CMsgSOCacheSubscriptionRefresh",
		1094: "CMsgCasketItem",
		2536: "CMsgCasketItem",
		4004: "CMsgClientWelcome",
		4006: "CMsgClientHello",
		4007: "CMsgServerHello",
	}
	if candidate, ok := baseGCMessageNames[emsg]; ok {
		if descriptor, descriptorErr := files.FindDescriptorByName(protoreflect.FullName(candidate)); descriptorErr == nil {
			if _, isMessage := descriptor.(protoreflect.MessageDescriptor); isMessage {
				return candidate, true
			}
		}
	}
	found := ""
	files.RangeFiles(func(file protoreflect.FileDescriptor) bool {
		enums := file.Enums()
		for i := 0; i < enums.Len(); i++ {
			value := enums.Get(i).Values().ByNumber(protoreflect.EnumNumber(emsg))
			if value == nil {
				continue
			}
			valueName := string(value.Name())
			if !strings.HasPrefix(valueName, "k_EMsg") && !strings.HasPrefix(valueName, "k_ESOMsg") {
				continue
			}
			raw := strings.TrimPrefix(strings.TrimPrefix(valueName, "k_EMsg"), "k_ESOMsg")
			candidates := []string{
				"CMsg" + raw,
				"CMsg" + strings.TrimPrefix(raw, "GC"),
				"CMsgSO" + raw,
				"CMsgSO" + strings.TrimPrefix(raw, "_"),
				"CMsgSOCache" + raw,
				"CMsgSOCache" + strings.TrimPrefix(raw, "_"),
				"CMsgSOSingleObject",
				"CMsgSOMultipleObjects",
			}
			for _, candidate := range candidates {
				if descriptor, descriptorErr := files.FindDescriptorByName(protoreflect.FullName(candidate)); descriptorErr == nil {
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

func MarshalStoreGetUserData(version uint32, currency int32) ([]byte, error) {
	message, err := newMessage("CMsgStoreGetUserData")
	if err != nil {
		return nil, err
	}
	setUint(message, "price_sheet_version", uint64(version))
	setInt(message, "currency", int64(currency))
	return proto.MarshalOptions{Deterministic: true}.Marshal(message)
}
func UnmarshalStoreGetUserDataResponse(body []byte) (StoreUserData, error) {
	message, err := newMessage("CMsgStoreGetUserDataResponse")
	if err != nil {
		return StoreUserData{}, err
	}
	if err := proto.Unmarshal(body, message); err != nil {
		return StoreUserData{}, err
	}
	return StoreUserData{Result: int32(getInt(message, "result")), Currency: int32(getInt(message, "currency_deprecated")), Country: getString(message, "country_deprecated"), PriceSheetVersion: uint32(getUint(message, "price_sheet_version")), PriceSheet: append([]byte(nil), getBytes(message, "price_sheet")...)}, nil
}
func MarshalStorePurchaseInit(request StorePurchaseRequest) ([]byte, error) {
	message, err := newMessage("CMsgGCStorePurchaseInit")
	if err != nil {
		return nil, err
	}
	// Match the CS2 client wire shape: default-valued proto2 store context
	// fields are absent, not explicitly present with an empty/zero value.
	if request.Country != "" || request.CountryPresent {
		setString(message, "country", request.Country)
	}
	if request.Language != 0 || request.LanguagePresent {
		setInt(message, "language", int64(request.Language))
	}
	if !request.OmitCurrency {
		setInt(message, "currency", int64(request.Currency))
	}
	field := message.Descriptor().Fields().ByName("line_items")
	list := message.Mutable(field).List()
	for _, source := range request.Lines {
		line, err := newMessage("CGCStorePurchaseInit_LineItem")
		if err != nil {
			return nil, err
		}
		if !source.OmitItemDefID {
			setUint(line, "item_def_id", uint64(source.ItemDefID))
		}
		if !source.OmitQuantity {
			setUint(line, "quantity", uint64(source.Quantity))
		}
		if !source.OmitCost {
			setUint(line, "cost_in_local_currency", source.Cost)
		}
		if source.PurchaseType != 0 || source.PurchaseTypePresent {
			setUint(line, "purchase_type", uint64(source.PurchaseType))
		}
		// StoreAPI only supplies supplemental_data for parenthesized purchase
		// entries such as "defindex(asset_id)".
		if !source.OmitSupplementalData {
			setUint(line, "supplemental_data", source.SupplementalData)
		}
		list.Append(protoreflect.ValueOfMessage(line))
	}
	return proto.MarshalOptions{Deterministic: true}.Marshal(message)
}
func UnmarshalStorePurchaseInitResponse(body []byte) (StorePurchaseResponse, error) {
	message, err := newMessage("CMsgGCStorePurchaseInitResponse")
	if err != nil {
		return StorePurchaseResponse{}, err
	}
	if err := proto.Unmarshal(body, message); err != nil {
		return StorePurchaseResponse{}, err
	}
	field := message.Descriptor().Fields().ByName("item_ids")
	list := message.Get(field).List()
	ids := make([]uint64, list.Len())
	for i := 0; i < list.Len(); i++ {
		ids[i] = list.Get(i).Uint()
	}
	return StorePurchaseResponse{Result: int32(getInt(message, "result")), TransactionID: getUint(message, "txn_id"), URL: getString(message, "url"), ItemIDs: ids}, nil
}

func UnmarshalClientWelcomeStoreContext(body []byte) (ClientWelcomeStoreContext, error) {
	message, err := newMessage("CMsgClientWelcome")
	if err != nil {
		return ClientWelcomeStoreContext{}, err
	}
	if err := proto.Unmarshal(body, message); err != nil {
		return ClientWelcomeStoreContext{}, err
	}
	return ClientWelcomeStoreContext{Currency: int32(getUint(message, "currency")), Country: getString(message, "txn_country_code")}, nil
}

func files() (*protoregistry.Files, error) {
	descriptorOnce.Do(func() {
		var set descriptorpb.FileDescriptorSet
		if err := proto.Unmarshal(descriptorBytes, &set); err != nil {
			descriptorErr = fmt.Errorf("decode GameTracking descriptor set: %w", err)
			return
		}
		descriptorFiles, descriptorErr = protodesc.NewFiles(&set)
	})
	return descriptorFiles, descriptorErr
}
func newMessage(name string) (*dynamicpb.Message, error) {
	files, err := files()
	if err != nil {
		return nil, err
	}
	descriptor, err := files.FindDescriptorByName(protoreflect.FullName(name))
	if err != nil {
		return nil, err
	}
	message, ok := descriptor.(protoreflect.MessageDescriptor)
	if !ok {
		return nil, fmt.Errorf("GameTracking descriptor %s is not a message", name)
	}
	return dynamicpb.NewMessage(message), nil
}
func field(message *dynamicpb.Message, name protoreflect.Name) protoreflect.FieldDescriptor {
	return message.Descriptor().Fields().ByName(name)
}
func setUint(message *dynamicpb.Message, name protoreflect.Name, value uint64) {
	descriptor := field(message, name)
	if descriptor.Kind() == protoreflect.Uint32Kind || descriptor.Kind() == protoreflect.Fixed32Kind {
		message.Set(descriptor, protoreflect.ValueOfUint32(uint32(value)))
		return
	}
	message.Set(descriptor, protoreflect.ValueOfUint64(value))
}
func setInt(message *dynamicpb.Message, name protoreflect.Name, value int64) {
	message.Set(field(message, name), protoreflect.ValueOfInt32(int32(value)))
}
func setString(message *dynamicpb.Message, name protoreflect.Name, value string) {
	message.Set(field(message, name), protoreflect.ValueOfString(value))
}
func getUint(message *dynamicpb.Message, name protoreflect.Name) uint64 {
	return message.Get(field(message, name)).Uint()
}
func getInt(message *dynamicpb.Message, name protoreflect.Name) int64 {
	return message.Get(field(message, name)).Int()
}
func getString(message *dynamicpb.Message, name protoreflect.Name) string {
	return message.Get(field(message, name)).String()
}
func getBytes(message *dynamicpb.Message, name protoreflect.Name) []byte {
	return message.Get(field(message, name)).Bytes()
}
