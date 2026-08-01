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
	s.armory.Status = "loading"
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
	if err == nil {
		s.setArmoryLoadingStage("Armory balance received; loading the current CS2 item schema")
		metadataCtx, cancelMetadata := context.WithTimeout(context.Background(), 20*time.Second)
		metadata, metadataErr := s.econProvider.Load(metadataCtx)
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
	s.mu.Unlock()
	receipt.State, receipt.Message = "completed", "Armory star balance refreshed"
	s.addEvent(receipt, receipt.State, receipt.Message)
	return receipt
}

func (s *Service) setArmoryLoadingStage(message string) {
	s.mu.Lock()
	if s.armory.Status == "loading" {
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
	if s.connection.State != domain.ConnectionStateConnected || s.armory.Status != "ready" || s.armory.GenerationTime != generation || s.armory.Balance != balance {
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
		var rewardErr error
		for {
			reward, rewardErr = s.gcClient.WaitForNewCS2InventoryItem(resultCtx, knownIDs)
			if rewardErr != nil || armoryRewardMatchesOffer(reward, *matchedOffer) {
				break
			}
			knownIDs[reward.ID] = struct{}{}
		}
		cancelResult()
		if rewardErr == nil {
			openedItem := armoryRewardFromIncremental(reward, *matchedOffer)
			receipt.State, receipt.Message = "completed", "Armory reward confirmed by CS2"
			receipt.Result = map[string]any{"requestEMsg": protocol.EMsgGCCStrike15V2ClientRedeemMissionReward, "campaignId": campaignID, "redeemId": redeemID, "expectedCost": cost, "quantity": quantity, "preBalance": balance, "generationTime": generation, "pacingSeconds": pacing, "openedItem": openedItem}
			s.mu.Lock()
			s.inventory.Items = append(s.inventory.Items, openedItem)
			s.applyConfirmedArmoryRedemptionLocked(cost)
			s.mu.Unlock()
			s.addEvent(receipt, receipt.State, receipt.Message)
			return receipt
		}
		receipt.State, receipt.Message = "awaiting_gc_confirmation", "Armory purchase sent; incremental reward was not observed before fallback reconciliation"
		result := map[string]any{"requestEMsg": protocol.EMsgGCCStrike15V2ClientRedeemMissionReward, "campaignId": campaignID, "redeemId": redeemID, "expectedCost": cost, "quantity": quantity, "preBalance": balance, "generationTime": generation, "pacingSeconds": pacing}
		receipt.Result = result
	} else {
		receipt.State, receipt.Message = "awaiting_gc_confirmation", fmt.Sprintf("%d Armory purchase message(s) sent; refresh to reconcile stars and inventory", quantity)
		result := map[string]any{"requestEMsg": protocol.EMsgGCCStrike15V2ClientRedeemMissionReward, "campaignId": campaignID, "redeemId": redeemID, "expectedCost": cost, "quantity": quantity, "preBalance": balance, "generationTime": generation, "pacingSeconds": pacing}
		receipt.Result = result
	}
	s.addEvent(receipt, receipt.State, receipt.Message)
	return receipt
}

func armoryRewardMatchesOffer(item transport.GCInventoryItem, offer domain.ArmoryOffer) bool {
	for _, candidate := range offer.Items {
		if candidate.Defindex == item.DefIndex && candidate.PaintKit == item.PaintKit {
			return true
		}
	}
	return false
}

func armoryRewardFromIncremental(item transport.GCInventoryItem, offer domain.ArmoryOffer) domain.InventoryItem {
	result := domain.InventoryItem{ID: strconv.FormatUint(item.ID, 10), Name: offer.ItemName, Kind: "cs2_econ_item", Defindex: &item.DefIndex, CustomName: item.CustomName, PaintWear: item.PaintWear, IsStatTrak: item.Quality == 9, IsSouvenir: item.Quality == 12}
	for _, candidate := range offer.Items {
		if candidate.Defindex != item.DefIndex || candidate.PaintKit != item.PaintKit {
			continue
		}
		result.Name, result.MarketName, result.ImageURL = candidate.Name, candidate.MarketName, candidate.ImageURL
		result.Kind, result.Rarity = candidate.Kind, candidate.Rarity
		result.PaintWearMin, result.PaintWearMax = candidate.WearMin, candidate.WearMax
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

func (s *Service) reconcileArmoryReward(ctx context.Context, before domain.InventorySnapshot) (domain.InventorySnapshot, *domain.InventoryItem, error) {
	const attempts = 4
	var lastSnapshot domain.InventorySnapshot
	var lastErr error
	for attempt := 0; attempt < attempts; attempt++ {
		if attempt > 0 {
			time.Sleep(time.Second)
		}
		snapshot, openedItem, err := s.reconcileNewInventoryItemOnce(ctx, before)
		lastSnapshot = snapshot
		if err == nil && openedItem != nil {
			return snapshot, openedItem, nil
		}
		lastErr = err
	}
	return lastSnapshot, nil, fmt.Errorf("Armory reward was not present after %d GC inventory reconciliations: %w", attempts, lastErr)
}
