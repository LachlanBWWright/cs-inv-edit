package app

import (
	"context"
	"fmt"
	"strconv"
	"time"

	"cs-inv-edit/backend/internal/domain"
	"cs-inv-edit/backend/internal/econ"
	"cs-inv-edit/backend/internal/operations"
	"cs-inv-edit/backend/internal/proto/gametracking"
	"cs-inv-edit/backend/internal/protocol"
	"cs-inv-edit/backend/internal/transport"
)

func (s *Service) RefreshArmory() operations.Receipt {
	receipt := s.newReceipt("armory.refresh")
	s.mu.Lock()
	if !s.settings.FeatureFlags.EnableArmoryRead {
		s.mu.Unlock()
		receipt.State, receipt.Message = "blocked_by_feature_flag", "Armory reads are disabled"
		s.addEvent(receipt, receipt.State, receipt.Message)
		return receipt
	}
	if s.connection.State != domain.ConnectionStateConnected {
		s.armory = emptyArmory()
		s.mu.Unlock()
		receipt.State, receipt.Message = "requires_connection", "connect a Steam account to load Armory stars"
		s.addEvent(receipt, receipt.State, receipt.Message)
		return receipt
	}
	s.armory.Status = domain.SnapshotStatusLoading
	s.armory.Message = "Waiting for CS2 Game Coordinator Armory state"
	s.mu.Unlock()
	gcCtx, cancelGC := context.WithTimeout(context.Background(), 10*time.Second)
	err := s.ensureGCSession(gcCtx, protocol.AppIDCS2)
	var state transport.GCArmorySnapshot
	if err == nil {
		state, err = s.gcClient.RequestArmory(gcCtx)
	}
	cancelGC()
	var catalog []econ.ArmoryOffer
	var metadata *econ.Schema
	if err == nil {
		s.setArmoryLoadingStage("Armory balance received; loading the current CS2 item schema")
		metadataCtx, cancelMetadata := context.WithTimeout(context.Background(), 20*time.Second)
		var metadataErr error
		metadata, metadataErr = s.econProvider.Load(metadataCtx)
		cancelMetadata()
		if metadataErr != nil {
			err = fmt.Errorf("load live CS2 Armory catalogue: %w", metadataErr)
		} else {
			catalog = metadata.ArmoryOffers()
			if len(catalog) == 0 {
				err = fmt.Errorf("live CS2 items_game contained no xpshop redeemable goods")
			} else {
				s.setArmoryLoadingStage(fmt.Sprintf("Building %d Armory offers and tracked item previews", len(catalog)))
				// The tracked image index already resolves catalogue previews. Do not
				// burst hundreds of optional Steam Market searches here: Steam returns
				// HTTP 429 and delays the entire Armory response for up to a minute.
			}
		}
	}
	s.mu.Lock()
	if err != nil {
		s.armory = domain.ArmorySnapshot{Status: "error", Message: err.Error(), RefreshedAt: now(), ItemIDs: []string{}, Offers: []domain.ArmoryOffer{}}
		s.mu.Unlock()
		receipt.State, receipt.Message = "failed", err.Error()
		s.addEvent(receipt, receipt.State, receipt.Message)
		return receipt
	}
	s.armory = armoryFromGC(state, catalog)
	s.armorySchema = metadata
	s.mu.Unlock()
	receipt.State, receipt.Message = "completed", "Armory star balance refreshed"
	s.addEvent(receipt, receipt.State, receipt.Message)
	return receipt
}

func (s *Service) setArmoryLoadingStage(message string) {
	s.mu.Lock()
	if s.armory.Status == domain.SnapshotStatusLoading {
		s.armory.Message = message
	}
	s.mu.Unlock()
}

func (s *Service) RedeemArmory(input map[string]any) operations.Receipt {
	receipt := s.newReceipt("armory.redeem")
	s.mu.Lock()
	if !s.settings.FeatureFlags.EnableArmoryRedemption {
		s.mu.Unlock()
		receipt.State, receipt.Message = "blocked_by_feature_flag", "Armory purchases are disabled"
		s.addEvent(receipt, receipt.State, receipt.Message)
		return receipt
	}
	campaignID, err1 := requiredUint32Input(input, "campaignId")
	redeemID, err2 := requiredUint32Input(input, "redeemId")
	balance, err3 := requiredUint32Input(input, "redeemableBalance")
	cost, err4 := requiredUint32Input(input, "expectedCost")
	generation, err5 := requiredUint32Input(input, "generationTime")
	quantity := uint32(1)
	var quantityErr error
	if _, present := input["quantity"]; present {
		quantity, quantityErr = requiredUint32Input(input, "quantity")
	}
	if err := firstError(err1, err2, err3, err4, err5, quantityErr); err != nil {
		s.mu.Unlock()
		receipt.State, receipt.Message = "failed", err.Error()
		s.addEvent(receipt, receipt.State, receipt.Message)
		return receipt
	}
	if s.connection.State != domain.ConnectionStateConnected || s.armory.Status != domain.SnapshotStatusReady || s.armory.GenerationTime != generation || s.armory.Balance != balance {
		s.mu.Unlock()
		receipt.State, receipt.Message = "failed", "Armory snapshot is stale; refresh before purchasing"
		s.addEvent(receipt, receipt.State, receipt.Message)
		return receipt
	}
	var matchedOffer *domain.ArmoryOffer
	for _, offer := range s.armory.Offers {
		if offer.CampaignID == campaignID && offer.RedeemID == redeemID && offer.ExpectedCost == cost {
			matched := offer
			matchedOffer = &matched
			break
		}
	}
	if quantity == 0 || matchedOffer == nil || uint64(cost)*uint64(quantity) > uint64(balance) {
		s.mu.Unlock()
		receipt.State, receipt.Message = "failed", "Armory offer or cost does not match the latest GC snapshot"
		s.addEvent(receipt, receipt.State, receipt.Message)
		return receipt
	}
	pacing := s.settings.ArmoryPurchasePacingSeconds
	if pacing == 0 {
		pacing = 5
	}
	knownIDs := make(map[uint64]struct{}, len(s.inventory.Items))
	for _, item := range s.inventory.Items {
		if id, parseErr := strconv.ParseUint(item.ID, 10, 64); parseErr == nil {
			knownIDs[id] = struct{}{}
		}
	}
	beforeInventory := cloneInventory(s.inventory)
	_, accountCtx, _ := s.currentGCSessionKeyLocked(protocol.AppIDCS2)
	s.mu.Unlock()
	// A cached Armory snapshot can outlive the GC session that produced it. Prove
	// that CS2 has accepted a fresh ClientHello before sending the irreversible
	// redemption message; otherwise a stale session can silently discard it.
	preflightCtx, cancelPreflight := context.WithTimeout(accountCtx, 15*time.Second)
	preflightErr := s.ensureGCSession(preflightCtx, protocol.AppIDCS2)
	cancelPreflight()
	if preflightErr != nil {
		receipt.State = "failed"
		receipt.Message = fmt.Sprintf("Armory purchase was not sent because the CS2 GC session could not be refreshed: %v", preflightErr)
		s.addEvent(receipt, receipt.State, receipt.Message)
		return receipt
	}
	var err error
	for index := uint32(0); index < quantity; index++ {
		prePurchaseBalance := balance - index*cost
		body, marshalErr := gametracking.MarshalMessage("CMsgGCCstrike15_v2_ClientRedeemMissionReward", map[string]any{"campaign_id": campaignID, "redeem_id": redeemID, "redeemable_balance": prePurchaseBalance, "expected_cost": cost})
		if marshalErr != nil {
			err = marshalErr
			break
		}
		if err = s.gcClient.SendProtoToGC(accountCtx, protocol.AppIDCS2, protocol.EMsgGCCStrike15V2ClientRedeemMissionReward, body); err != nil {
			break
		}
		if index+1 < quantity {
			time.Sleep(time.Duration(pacing) * time.Second)
		}
	}
	if err != nil {
		receipt.State, receipt.Message = "failed", fmt.Sprintf("Armory purchase send failed: %v", err)
	} else if quantity == 1 {
		resultCtx, cancelResult := context.WithTimeout(accountCtx, 5*time.Second)
		var reward transport.GCInventoryItem
		reward, rewardErr := s.gcClient.WaitForNewCS2InventoryItem(resultCtx, knownIDs)
		cancelResult()
		if rewardErr == nil {
			openedItem := s.armoryRewardFromIncremental(reward, *matchedOffer)
			receipt.State, receipt.Message = "completed", "Armory reward confirmed by CS2"
			receipt.Result = armoryRedemptionResult(campaignID, redeemID, cost, quantity, balance, generation, pacing, &openedItem)
			s.mu.Lock()
			s.inventory.Items = append(s.inventory.Items, openedItem)
			s.applyConfirmedArmoryRedemptionLocked(cost)
			s.mu.Unlock()
			s.addEvent(receipt, receipt.State, receipt.Message)
			return receipt
		}
		reconcileCtx, cancelReconcile := context.WithTimeout(accountCtx, 20*time.Second)
		snapshot, openedItem, reconcileErr := s.reconcileArmoryReward(reconcileCtx, beforeInventory, *matchedOffer)
		cancelReconcile()
		if reconcileErr == nil && openedItem != nil {
			receipt.State, receipt.Message = "completed", "Armory reward confirmed by full CS2 inventory reconciliation"
			receipt.Result = armoryRedemptionResult(campaignID, redeemID, cost, quantity, balance, generation, pacing, openedItem)
			s.mu.Lock()
			s.inventory = snapshot
			s.applyConfirmedArmoryRedemptionLocked(cost)
			s.mu.Unlock()
			s.addEvent(receipt, receipt.State, receipt.Message)
			return receipt
		}
		receipt.State, receipt.Message = "awaiting_gc_confirmation", fmt.Sprintf("Armory purchase sent, but CS2 did not expose the reward through incremental or full inventory reconciliation: %v", reconcileErr)
		receipt.Result = armoryRedemptionResult(campaignID, redeemID, cost, quantity, balance, generation, pacing, nil)
	} else {
		receipt.State, receipt.Message = "awaiting_gc_confirmation", fmt.Sprintf("%d Armory purchase message(s) sent; refresh to reconcile stars and inventory", quantity)
		result := map[string]any{"requestEMsg": protocol.EMsgGCCStrike15V2ClientRedeemMissionReward, "campaignId": campaignID, "redeemId": redeemID, "expectedCost": cost, "quantity": quantity, "preBalance": balance, "generationTime": generation, "pacingSeconds": pacing}
		receipt.Result = result
	}
	s.addEvent(receipt, receipt.State, receipt.Message)
	return receipt
}

func armoryRedemptionResult(campaignID, redeemID, cost, quantity, balance, generation, pacing uint32, openedItem *domain.InventoryItem) map[string]any {
	result := map[string]any{"requestEMsg": protocol.EMsgGCCStrike15V2ClientRedeemMissionReward, "campaignId": campaignID, "redeemId": redeemID, "expectedCost": cost, "quantity": quantity, "preBalance": balance, "generationTime": generation, "pacingSeconds": pacing}
	if openedItem != nil {
		result["openedItem"] = *openedItem
	}
	return result
}

func (s *Service) armoryRewardFromIncremental(item transport.GCInventoryItem, offer domain.ArmoryOffer) domain.InventoryItem {
	result := domain.InventoryItem{ID: strconv.FormatUint(item.ID, 10), Kind: domain.ItemKindCS2EconItem, Defindex: &item.DefIndex, CustomName: item.CustomName, PaintWear: item.PaintWear, IsStatTrak: item.Quality == 9, IsSouvenir: item.Quality == 12}
	s.mu.Lock()
	schema := s.armorySchema
	s.mu.Unlock()
	if schema != nil {
		metadata := schema.Metadata(item.DefIndex, item.PaintKit, item.Attributes)
		result.Name, result.MarketName = metadata.Name, metadata.MarketName
		result.ImageURL, result.Kind, result.Rarity = metadata.ImageURL, metadata.Kind, metadata.Rarity
		result.PaintWearMin, result.PaintWearMax = metadata.PaintWearMin, metadata.PaintWearMax
	}
	for _, candidate := range offer.Items {
		if candidate.Defindex != item.DefIndex || candidate.PaintKit != item.PaintKit {
			continue
		}
		if result.Name == "" {
			result.Name = candidate.Name
		}
		if result.MarketName == "" {
			result.MarketName = candidate.MarketName
		}
		if result.ImageURL == "" {
			result.ImageURL = candidate.ImageURL
		}
		if result.Kind == "" || result.Kind == domain.ItemKindCS2EconItem {
			result.Kind = candidate.Kind
		}
		if result.Rarity == "" {
			result.Rarity = candidate.Rarity
		}
		if result.PaintWearMin == nil {
			result.PaintWearMin = candidate.WearMin
		}
		if result.PaintWearMax == nil {
			result.PaintWearMax = candidate.WearMax
		}
		break
	}
	if result.Name == "" {
		result.Name = result.MarketName
	}
	if result.Name == "" {
		result.Name = fmt.Sprintf("CS2 item #%d", item.DefIndex)
	}
	return result
}

func includeGCInventoryIDs(snapshot domain.InventorySnapshot, items []transport.GCInventoryItem) domain.InventorySnapshot {
	known := make(map[string]struct{}, len(snapshot.Items)+len(items))
	for _, item := range snapshot.Items {
		known[item.ID] = struct{}{}
	}
	for _, item := range items {
		id := fmt.Sprintf("%d", item.ID)
		if _, exists := known[id]; exists {
			continue
		}
		snapshot.Items = append(snapshot.Items, domain.InventoryItem{ID: id})
		known[id] = struct{}{}
	}
	return snapshot
}

func (s *Service) applyConfirmedArmoryRedemptionLocked(cost uint32) {
	if cost > s.armory.Balance {
		return
	}
	s.armory.Balance -= cost
	s.armory.RefreshedAt = now()
	s.armory.Message = fmt.Sprintf("Armory reward confirmed; %d stars remaining", s.armory.Balance)
}

func (s *Service) reconcileArmoryReward(ctx context.Context, before domain.InventorySnapshot, offer domain.ArmoryOffer) (domain.InventorySnapshot, *domain.InventoryItem, error) {
	const attempts = 4
	var lastSnapshot domain.InventorySnapshot
	var lastErr error
	for attempt := 0; attempt < attempts; attempt++ {
		if attempt > 0 {
			time.Sleep(time.Second)
		}
		snapshot, err := s.fetchInventory(ctx, nil)
		lastSnapshot = snapshot
		if err == nil {
			if openedItem := matchingArmoryReward(before, snapshot, offer); openedItem != nil {
				return snapshot, openedItem, nil
			}
			err = fmt.Errorf("full inventory refresh found no unambiguous reward; before_count=%d after_count=%d", len(before.Items), len(snapshot.Items))
		}
		lastErr = err
	}
	return lastSnapshot, nil, fmt.Errorf("Armory reward was not present after %d GC inventory reconciliations: %w", attempts, lastErr)
}

func matchingArmoryReward(before, after domain.InventorySnapshot, offer domain.ArmoryOffer) *domain.InventoryItem {
	beforeIDs := make(map[string]struct{}, len(before.Items))
	for _, item := range before.Items {
		beforeIDs[item.ID] = struct{}{}
	}
	newItems := make([]*domain.InventoryItem, 0, 1)
	for index := range after.Items {
		item := &after.Items[index]
		if _, existed := beforeIDs[item.ID]; existed {
			continue
		}
		newItems = append(newItems, item)
		for _, candidate := range offer.Items {
			if candidate.MarketName != "" && candidate.MarketName == item.MarketName {
				return item
			}
		}
	}
	if len(newItems) == 1 {
		return newItems[0]
	}
	return nil
}
