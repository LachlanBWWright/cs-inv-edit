package multigame

import (
	"strings"

	"cs-inv-edit/backend/internal/domain"
)

func cloneGameSnapshot(snapshot domain.GameInventorySnapshot) domain.GameInventorySnapshot {
	clone := snapshot
	clone.Diagnostics = append([]string{}, snapshot.Diagnostics...)
	clone.Items = make([]domain.EconomyInventoryItem, len(snapshot.Items))
	for index, item := range snapshot.Items {
		clone.Items[index] = item
		clone.Items[index].Tags = append([]domain.EconomyTag{}, item.Tags...)
		clone.Items[index].Descriptions = append([]string(nil), item.Descriptions...)
		clone.Items[index].Details.Attributes = copyMap(item.Details.Attributes)
		clone.Items[index].Details.AttributeBytes = copyMap(item.Details.AttributeBytes)
		clone.Items[index].Details.Capabilities = copyMap(item.Details.Capabilities)
		clone.Items[index].Details.UsableClasses = append([]string(nil), item.Details.UsableClasses...)
		clone.Items[index].Details.EquippedStates = append([]domain.EquippedState(nil), item.Details.EquippedStates...)
		clone.Items[index].Details.EquipConflicts = append([]string(nil), item.Details.EquipConflicts...)
		clone.Items[index].Details.LoadoutSlots = copyMap(item.Details.LoadoutSlots)
		clone.Items[index].Details.PrefabChain = append([]string(nil), item.Details.PrefabChain...)
		clone.Items[index].Details.ContainerItems = append([]domain.TF2RelatedItem(nil), item.Details.ContainerItems...)
		clone.Items[index].Details.DecodedAttributes = append([]domain.TF2Attribute(nil), item.Details.DecodedAttributes...)
	}
	return clone
}

func copyMap[K comparable, V any](source map[K]V) map[K]V {
	if source == nil {
		return nil
	}
	result := make(map[K]V, len(source))
	for key, value := range source {
		result[key] = value
	}
	return result
}
func steamIconURL(token string) string {
	token = strings.TrimSpace(token)
	if token == "" {
		return ""
	}
	if strings.HasPrefix(token, "https://") || strings.HasPrefix(token, "http://") {
		return token
	}
	return "https://community.fastly.steamstatic.com/economy/image/" + token
}
func firstNonEmpty(values ...string) string {
	for _, value := range values {
		if strings.TrimSpace(value) != "" {
			return value
		}
	}
	return ""
}
