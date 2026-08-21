package app

import (
	"fmt"
	"math"
	"strconv"
	"strings"
	"time"

	"cs-inv-edit/backend/internal/domain"
	"cs-inv-edit/backend/internal/econ"
)

func defaultSettings() domain.Settings {
	return domain.Settings{
		BackendURL:                  "http://127.0.0.1:7331",
		ValidationMode:              true,
		SacrificialAccountMode:      true,
		Animations:                  domain.AnimationSettings{Container: "slot-machine", TradeUp: "slot-machine", Armory: "slot-machine", Terminal: "slot-machine"},
		ArmoryPurchasePacingSeconds: 5,
		FeatureFlags: domain.FeatureFlags{
			EnableStorageMutations: true,
			EnableContainerOpening: true,
			EnableInventoryDebug:   false,
			ShowStorageUnitItems:   false,
			EnableProtocolConsole:  true,
			EnableTradeups:         false,
			EnableNameTags:         false,
			EnableItemDeletion:     false,
			EnableStatTrakSwap:     false,
			EnableStrangeParts:     false,
			EnableItemUse:          false,
			EnableToolApplication:  false,
			EnableGifting:          false,
			EnableArmoryRead:       true,
			EnableArmoryRedemption: true,
			EnableStoreRead:        true,
			EnableStorePurchases:   true,
			EnableFullCS2Store:     false,
			EnableCS2Loadouts:      false,
			EnableTF2Inventory:     true,
			EnableTF2Store:         true,
			EnableTF2Loadouts:      false,
			EnableTF2ItemUse:       false,
			EnableTF2Tools:         false,
			EnableTF2Crafting:      false,
			EnableTF2Unboxing:      false,
			EnableTF2Customization: false,
			EnableSteamInventory:   true,
		},
	}
}

func emptyStore() domain.StoreSnapshot {
	return domain.StoreSnapshot{Status: "requires_connection", Offers: []domain.StoreOffer{}, RefreshedAt: now(), Message: "Connect Steam to load the CS2 cash store."}
}
func emptyTF2Store() domain.StoreSnapshot {
	return domain.StoreSnapshot{Status: "requires_connection", Offers: []domain.StoreOffer{}, RefreshedAt: now(), Message: "Connect Steam to load the TF2 Mann Co. Store."}
}
func cloneStore(store domain.StoreSnapshot) domain.StoreSnapshot {
	offers := make([]domain.StoreOffer, len(store.Offers))
	copy(offers, store.Offers)
	store.Offers = offers
	store.Diagnostics = append([]string(nil), store.Diagnostics...)
	return store
}
func steamCurrencyCode(id int32) string {
	// CS2's economy-store ECurrency values deliberately differ from Steam's
	// public ECurrencyCode values. These are the GC store IDs.
	codes := map[int32]string{0: "USD", 1: "GBP", 2: "EUR", 3: "RUB", 4: "BRL", 8: "JPY", 9: "NOK", 10: "IDR", 11: "MYR", 12: "PHP", 13: "SGD", 14: "THB", 15: "VND", 16: "KRW", 17: "TRY", 18: "UAH", 19: "MXN", 20: "CAD", 21: "AUD", 22: "NZD", 23: "PLN", 24: "CHF", 25: "CNY", 26: "TWD", 27: "HKD", 28: "INR", 29: "AED", 30: "SAR", 31: "ZAR", 32: "COP", 33: "PEN", 34: "CLP"}
	if code := codes[id]; code != "" {
		return code
	}
	return fmt.Sprintf("CURRENCY_%d", id)
}
func steamCurrencyID(code string) int32 {
	for id := int32(0); id <= 34; id++ {
		if steamCurrencyCode(id) == code {
			return id
		}
	}
	return 0
}
func formatStoreAmount(currency string, amount uint64) string {
	symbols := map[string]string{"USD": "$", "GBP": "£", "EUR": "€", "AUD": "A$", "CAD": "C$", "NZD": "NZ$", "JPY": "¥"}
	symbol := symbols[currency]
	if currency == "JPY" {
		return fmt.Sprintf("%s%d", symbol, amount)
	}
	if symbol != "" {
		return fmt.Sprintf("%s%d.%02d", symbol, amount/100, amount%100)
	}
	return fmt.Sprintf("%s %d.%02d", currency, amount/100, amount%100)
}
func stringInput(input map[string]any, key string) string {
	value, _ := input[key].(string)
	return strings.TrimSpace(value)
}
func requiredUint64Input(input map[string]any, key string) (uint64, error) {
	value, ok := input[key]
	if !ok {
		return 0, fmt.Errorf("%s is required", key)
	}
	switch typed := value.(type) {
	case float64:
		if typed < 0 || typed > math.MaxUint64 || typed != math.Trunc(typed) {
			return 0, fmt.Errorf("%s must be an unsigned integer", key)
		}
		return uint64(typed), nil
	case uint64:
		return typed, nil
	case uint32:
		return uint64(typed), nil
	case int:
		if typed >= 0 {
			return uint64(typed), nil
		}
	case string:
		parsed, err := strconv.ParseUint(typed, 10, 64)
		if err == nil {
			return parsed, nil
		}
	}
	return 0, fmt.Errorf("%s must be an unsigned integer", key)
}
func newID() string { return strconv.FormatInt(time.Now().UnixNano(), 36) }

func cloneInventory(inventory domain.InventorySnapshot) domain.InventorySnapshot {
	items := make([]domain.InventoryItem, len(inventory.Items))
	copy(items, inventory.Items)
	return domain.InventorySnapshot{Items: items, Collections: append([]domain.Collection(nil), inventory.Collections...), RefreshedAt: inventory.RefreshedAt, Status: inventory.Status, Message: inventory.Message, Error: inventory.Error, Diagnostics: append([]string(nil), inventory.Diagnostics...)}
}

func domainCollections(collections []econ.Collection) []domain.Collection {
	result := make([]domain.Collection, 0, len(collections))
	for _, collection := range collections {
		result = append(result, domain.Collection{Name: collection.Name, Items: domainRelatedItems(collection.Items)})
	}
	return result
}

func cloneGameInventory(inventory domain.GameInventorySnapshot) domain.GameInventorySnapshot {
	items := make([]domain.EconomyInventoryItem, len(inventory.Items))
	for index, item := range inventory.Items {
		items[index] = item
		items[index].Tags = append([]domain.EconomyTag{}, item.Tags...)
		items[index].Descriptions = append([]string(nil), item.Descriptions...)
		items[index].Details.Attributes = make(map[string]uint32, len(item.Details.Attributes))
		for key, value := range item.Details.Attributes {
			items[index].Details.Attributes[key] = value
		}
		items[index].Details.AttributeBytes = make(map[string]string, len(item.Details.AttributeBytes))
		for key, value := range item.Details.AttributeBytes {
			items[index].Details.AttributeBytes[key] = value
		}
		items[index].Details.EquippedStates = append([]domain.EquippedState(nil), item.Details.EquippedStates...)
		items[index].Details.UsableClasses = append([]string(nil), item.Details.UsableClasses...)
		if item.Details.Capabilities != nil {
			items[index].Details.Capabilities = make(map[string]string, len(item.Details.Capabilities))
			for key, value := range item.Details.Capabilities {
				items[index].Details.Capabilities[key] = value
			}
		}
	}
	inventory.Items = items
	inventory.Diagnostics = append([]string{}, inventory.Diagnostics...)
	return inventory
}

func cloneArmory(armory domain.ArmorySnapshot) domain.ArmorySnapshot {
	// Keep API collections as [] instead of null so clients can safely render
	// empty Armory snapshots, including partially initialized GC state.
	armory.ItemIDs = append([]string{}, armory.ItemIDs...)
	armory.Offers = append([]domain.ArmoryOffer{}, armory.Offers...)
	armory.Diagnostics = append([]string(nil), armory.Diagnostics...)
	return armory
}

func cloneSettings(settings domain.Settings) domain.Settings {
	return domain.Settings{BackendURL: settings.BackendURL, ValidationMode: settings.ValidationMode, SacrificialAccountMode: settings.SacrificialAccountMode, FeatureFlags: settings.FeatureFlags, Animations: settings.Animations, ArmoryPurchasePacingSeconds: settings.ArmoryPurchasePacingSeconds}
}

func ptrUint32(value uint32) *uint32 { return &value }

func ptrInt(value int) *int { return &value }

func stringsHasPrefixAny(value string, prefixes ...string) bool {
	for _, prefix := range prefixes {
		if len(value) >= len(prefix) && value[:len(prefix)] == prefix {
			return true
		}
	}
	return false
}

func now() string {
	return time.Now().UTC().Format(time.RFC3339Nano)
}

func UnsupportedProtocolError(operation string) error {
	return fmt.Errorf("%s is scaffolded but not wired to Steam GC yet", operation)
}
