package protocol

type CS2FeatureOperation struct {
	EMsg        uint32
	FeatureFlag string
}

func CS2FeatureOperationMapping(operation string) (CS2FeatureOperation, bool) {
	mappings := map[string]CS2FeatureOperation{
		"cs2.loadout.set":         {EMsg: mustGameTrackingEnum("EGCItemMsg", "k_EMsgGCAdjustEquipSlotsManual"), FeatureFlag: "enableCs2Loadouts"},
		"cs2.matches.recent":      {EMsg: mustGameTrackingEnum("ECsgoGCMsg", "k_EMsgGCCStrike15_v2_MatchListRequestRecentUserGames")},
		"cs2.matches.details":     {EMsg: mustGameTrackingEnum("ECsgoGCMsg", "k_EMsgGCCStrike15_v2_MatchListRequestFullGameInfo")},
		"cs2.inspect.resolve":     {EMsg: mustGameTrackingEnum("ECsgoGCMsg", "k_EMsgGCCStrike15_v2_Client2GCEconPreviewDataBlockRequest")},
		"cs2.progression.refresh": {EMsg: mustGameTrackingEnum("ECsgoGCMsg", "k_EMsgGCCStrike15_v2_RequestRecurringMissionSchedule")},
	}
	mapping, ok := mappings[operation]
	return mapping, ok
}
