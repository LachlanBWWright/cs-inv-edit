package app

import (
	"context"
	"fmt"
	"time"

	"cs-inv-edit/backend/internal/domain"
	"cs-inv-edit/backend/internal/econ"
	"cs-inv-edit/backend/internal/operations"
	cs2pb "cs-inv-edit/backend/internal/proto/generated"
	"cs-inv-edit/backend/internal/protocol"

	"google.golang.org/protobuf/proto"
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
	if s.connection.State != "connected" {
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
	state, err := s.gcClient.RequestArmory(gcCtx)
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
	if s.settings.ValidationMode {
		s.mu.Unlock()
		receipt.State, receipt.Message = "requires_validation", "disable validation mode only after verifying the live Armory offer"
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
	if s.connection.State != "connected" || s.armory.Status != "ready" || s.armory.GenerationTime != generation || s.armory.Balance != balance {
		s.mu.Unlock()
		receipt.State, receipt.Message = "failed", "Armory snapshot is stale; refresh before purchasing"
		s.addEvent(receipt, receipt.State, receipt.Message)
		return receipt
	}
	matched := false
	for _, offer := range s.armory.Offers {
		if offer.CampaignID == campaignID && offer.RedeemID == redeemID && offer.ExpectedCost == cost {
			matched = true
			break
		}
	}
	if quantity == 0 || !matched || uint64(cost)*uint64(quantity) > uint64(balance) {
		s.mu.Unlock()
		receipt.State, receipt.Message = "failed", "Armory offer or cost does not match the latest GC snapshot"
		s.addEvent(receipt, receipt.State, receipt.Message)
		return receipt
	}
	pacing := s.settings.ArmoryPurchasePacingSeconds
	if pacing == 0 {
		pacing = 5
	}
	s.mu.Unlock()
	var err error
	for index := uint32(0); index < quantity; index++ {
		prePurchaseBalance := balance - index*cost
		body, marshalErr := proto.Marshal(&cs2pb.CMsgGCCstrike15V2ClientRedeemMissionReward{CampaignId: proto.Uint32(campaignID), RedeemId: proto.Uint32(redeemID), RedeemableBalance: proto.Uint32(prePurchaseBalance), ExpectedCost: proto.Uint32(cost)})
		if marshalErr != nil {
			err = marshalErr
			break
		}
		if err = s.gcClient.SendProtoToGC(context.Background(), protocol.AppIDCS2, protocol.EMsgGCCStrike15V2ClientRedeemMissionReward, body); err != nil {
			break
		}
		if index+1 < quantity {
			time.Sleep(time.Duration(pacing) * time.Second)
		}
	}
	if err != nil {
		receipt.State, receipt.Message = "failed", fmt.Sprintf("Armory purchase send failed: %v", err)
	} else {
		receipt.State, receipt.Message = "awaiting_gc_confirmation", fmt.Sprintf("%d Armory purchase message(s) sent; refresh to reconcile stars and inventory", quantity)
		receipt.Result = map[string]any{"requestEMsg": protocol.EMsgGCCStrike15V2ClientRedeemMissionReward, "campaignId": campaignID, "redeemId": redeemID, "expectedCost": cost, "quantity": quantity, "preBalance": balance, "generationTime": generation, "pacingSeconds": pacing}
	}
	s.addEvent(receipt, receipt.State, receipt.Message)
	return receipt
}
