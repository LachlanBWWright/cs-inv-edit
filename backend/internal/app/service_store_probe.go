package app

import (
	"context"
	"errors"
	"fmt"
	"math/bits"

	"cs-inv-edit/backend/internal/transport"
)

const terminalCanonicalPresence uint8 = 0b10111111

func (s *Service) runTerminalPurchaseProtobufSweep(
	ctx context.Context,
	baseline transport.StorePurchaseRequest,
) (transport.StorePurchaseTransportResult, error, []string) {
	shapes := terminalPurchaseWireShapes()
	diagnostics := []string{fmt.Sprintf(
		"Terminal protobuf sweep: exact client-shaped request returned GC result 200 under current CS2 ClientHello; testing all %d remaining presence combinations from authoritative CMsgGCStorePurchaseInit with one line item, semantic values fixed, nearest shapes first, and stopping on first acceptance",
		len(shapes),
	)}
	var result transport.StorePurchaseTransportResult
	var resultErr error
	for index, presence := range shapes {
		request := terminalPurchaseRequestWithPresence(baseline, presence)
		shape := terminalPurchasePresenceName(presence)
		diagnostics = append(diagnostics, fmt.Sprintf(
			"PROTO SWEEP %d/%d %s SEND item_def_id=%d quantity=%d cost=%d currency=%d purchase_type=%d supplemental_data=%d",
			index+1, len(shapes), shape, request.ItemDefID, request.Quantity, request.Cost,
			request.Currency, request.PurchaseType, request.SupplementalData,
		))
		result, resultErr = s.gcClient.InitializeStorePurchase(ctx, request)
		if resultErr == nil {
			diagnostics = append(diagnostics, fmt.Sprintf(
				"PROTO SWEEP %d/%d %s ACCEPTED; stopped without trying later shapes",
				index+1, len(shapes), shape,
			))
			return result, nil, diagnostics
		}
		var rejected transport.StorePurchaseRejectedError
		if !errors.As(resultErr, &rejected) {
			diagnostics = append(diagnostics, fmt.Sprintf(
				"PROTO SWEEP %d/%d %s ERROR %s; stopped because the outcome was not a clean GC rejection",
				index+1, len(shapes), shape, resultErr.Error(),
			))
			return transport.StorePurchaseTransportResult{}, resultErr, diagnostics
		}
		diagnostics = append(diagnostics, fmt.Sprintf(
			"PROTO SWEEP %d/%d %s REJECTED result=%d code=%s",
			index+1, len(shapes), shape, rejected.Result, rejected.Code(),
		))
	}
	return transport.StorePurchaseTransportResult{}, resultErr, diagnostics
}

func terminalPurchaseWireShapes() []uint8 {
	result := make([]uint8, 0, 255)
	for distance := 1; distance <= 8; distance++ {
		for value := 0; value <= 255; value++ {
			presence := uint8(value)
			if bits.OnesCount8(presence^terminalCanonicalPresence) == distance {
				result = append(result, presence)
			}
		}
	}
	return result
}

func terminalPurchaseRequestWithPresence(request transport.StorePurchaseRequest, presence uint8) transport.StorePurchaseRequest {
	request.CountryPresent = presence&(1<<0) != 0
	request.LanguagePresent = presence&(1<<1) != 0
	request.OmitCurrency = presence&(1<<2) == 0
	request.OmitItemDefID = presence&(1<<3) == 0
	request.OmitQuantity = presence&(1<<4) == 0
	request.OmitCost = presence&(1<<5) == 0
	request.PurchaseTypePresent = presence&(1<<6) != 0
	request.OmitSupplementalData = presence&(1<<7) == 0
	return request
}

func terminalPurchasePresenceName(presence uint8) string {
	state := func(bit uint8) string {
		if presence&(1<<bit) != 0 {
			return "present"
		}
		return "absent"
	}
	return fmt.Sprintf(
		"country_%s language_%s currency_%s item_def_%s quantity_%s cost_%s purchase_type_%s supplemental_%s",
		state(0), state(1), state(2), state(3), state(4), state(5), state(6), state(7),
	)
}

func encodedVolatileOfferItemID(defIndex, paintKit uint32) uint64 {
	if defIndex == 0 || paintKit == 0 || defIndex > 0xffff || paintKit > 0xffff {
		return 0
	}
	return 0xf000000000000000 | uint64(paintKit)<<16 | uint64(defIndex)
}

func isPurchaseResult(err error, result int32) bool {
	var rejected transport.StorePurchaseRejectedError
	return errors.As(err, &rejected) && rejected.Result == result
}
