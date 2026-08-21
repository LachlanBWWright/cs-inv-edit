package app

import (
	"context"

	"cs-inv-edit/backend/internal/econ"
	"cs-inv-edit/backend/internal/transport"
)

func (s *Service) CS2FeaturesWithMetadata(ctx context.Context) transport.CS2FeatureSnapshot {
	snapshot := s.CS2Features()
	if snapshot.Status != "ready" {
		return snapshot
	}
	schema, err := s.econProvider.Load(ctx)
	if err != nil {
		snapshot.Diagnostics = append(snapshot.Diagnostics, "CS2 quest metadata: "+err.Error())
		return snapshot
	}
	enrichCS2Quests(snapshot.Quests, "questid", schema)
	enrichCS2Quests(snapshot.RecurringMissions, "mission_id", schema)
	return snapshot
}

func enrichCS2Quests(entries []map[string]any, idField string, schema *econ.Schema) {
	for _, entry := range entries {
		definition, found := schema.Quest(resultUint32(entry[idField]))
		if !found {
			continue
		}
		entry["name"], entry["description"] = definition.Name, definition.Description
		entry["gamemode"], entry["map"] = definition.GameMode, definition.Map
		entry["mapgroup"], entry["expression"] = definition.MapGroup, definition.Expression
		entry["points_required"], entry["xp_reward"] = definition.Points, definition.XPReward
		entry["operational_points"] = definition.OperationalPoints
	}
}
