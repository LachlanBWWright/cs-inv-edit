package transport

import (
	"bytes"
	"context"
	"encoding/binary"
	"fmt"
	"log"
	"math"
	"net/url"
	"runtime"
	"strconv"
	"strings"
	"time"

	"cs-inv-edit/backend/internal/proto/gametracking"
	"cs-inv-edit/backend/internal/protocol"
	"github.com/Lucino772/envelop/pkg/steam/steamlang"
	"github.com/Lucino772/envelop/pkg/steam/steammsg"
	"github.com/Lucino772/envelop/pkg/steam/steampb"
	"google.golang.org/protobuf/proto"
)

const cs2AppID uint32 = 730
const emsgStoreGetUserData uint32 = 2500
const emsgStoreGetUserDataResponse uint32 = 2501
const emsgStorePurchaseInit uint32 = 2510
const emsgStorePurchaseInitResponse uint32 = 2511
const emsgStorePurchaseFinalize uint32 = 2504
const emsgStorePurchaseFinalizeResponse uint32 = 2505

func (s *SteamGCClient) RequestStore(ctx context.Context, version uint32, currency int32) (GCStoreData, error) {
	return s.RequestGameStore(ctx, cs2AppID, version, currency)
}

func (s *SteamGCClient) RequestGameStore(ctx context.Context, appID uint32, version uint32, currency int32) (GCStoreData, error) {
	s.requestMu.Lock()
	defer s.requestMu.Unlock()
	s.steamTraceActive.Store(true)
	defer s.steamTraceActive.Store(false)
	s.mu.Lock()
	conn := s.conn
	s.mu.Unlock()
	if conn == nil {
		return GCStoreData{}, ErrNotConnected
	}
	wallet := new(steampb.CUserAccount_GetWalletDetails_Response)
	walletRequest := &steampb.CUserAccount_GetClientWalletDetails_Request{
		IncludeFormattedBalance: proto.Bool(true),
	}
	if err := sendNonAuthedUnified(ctx, newNonAuthedUnifiedHandler(), conn, "UserAccount.GetClientWalletDetails#1", walletRequest, wallet, newDiagnosticTrace("steam wallet context request started")); err != nil {
		return GCStoreData{}, fmt.Errorf("load authoritative Steam wallet currency: %w", err)
	}
	economyCurrency, err := steamWalletCurrencyToEconomyCurrency(wallet.GetCurrencyCode())
	if err != nil {
		return GCStoreData{}, err
	}
	body, err := gametracking.MarshalStoreGetUserData(version, currency)
	if err != nil {
		return GCStoreData{}, err
	}
	if err = s.SendProtoToGC(ctx, appID, emsgStoreGetUserData, body); err != nil {
		return GCStoreData{}, err
	}
	for {
		select {
		case <-ctx.Done():
			return GCStoreData{}, fmt.Errorf("store catalogue response: %w", ctx.Err())
		case event := <-s.events:
			message, ok := event.Payload.(GCMessage)
			if event.Type != "gc.message" || !ok || message.AppID != appID || message.EMsg != emsgStoreGetUserDataResponse {
				continue
			}
			response, err := gametracking.UnmarshalStoreGetUserDataResponse(message.Body)
			if err != nil {
				return GCStoreData{}, fmt.Errorf("decode store catalogue response: %w", err)
			}
			country := wallet.GetWalletCountryCode()
			if country == "" {
				country = wallet.GetUserCountryCode()
			}
			return GCStoreData{Result: response.Result, Currency: economyCurrency, Country: country, PriceSheetVersion: response.PriceSheetVersion, PriceSheet: bytes.Clone(response.PriceSheet)}, nil
		}
	}
}

func steamWalletCurrencyToEconomyCurrency(walletCurrency int32) (int32, error) {
	// Steam's ECurrencyCode starts USD/GBP/EUR at 1/2/3, while the GC
	// economy ECurrency uses 0/1/2. Later supported values currently align,
	// except PLN (Steam 6, GC 23) and BRL (Steam 7, GC 4).
	remap := map[int32]int32{
		1: 0, 2: 1, 3: 2, 4: 24, 5: 3, 6: 23, 7: 4,
		8: 8, 9: 9, 10: 10, 11: 11, 12: 12, 13: 13, 14: 14,
		15: 15, 16: 16, 17: 17, 18: 18, 19: 19, 20: 20, 21: 21,
		22: 22, 23: 25, 24: 28, 25: 34, 26: 33, 27: 32, 28: 31,
		29: 27, 30: 26, 31: 30, 32: 29,
	}
	if economyCurrency, ok := remap[walletCurrency]; ok {
		return economyCurrency, nil
	}
	return 0, fmt.Errorf("Steam wallet returned unsupported currency code %d", walletCurrency)
}

func (s *SteamGCClient) InitializeStorePurchase(ctx context.Context, request StorePurchaseRequest) (result StorePurchaseTransportResult, resultErr error) {
	appID := request.AppID
	if appID == 0 {
		appID = cs2AppID
	}
	// IMPORTANT: Do not replace this native CS2 cash-store flow with
	// https://store.steampowered.com/buyitem/{appid}/{itemdefid}/{quantity}.
	// BuyItem is a separate Steam Inventory Service web-store entry point. It
	// does not support every CS2 price-sheet product (notably conventional case
	// keys), and it does not authorize the GC order created below.
	//
	// CMsgGCStorePurchaseInitResponse.txn_id is the GC/Steam ORDER ID. It is
	// not the Steam approval transaction ID and must never be inserted into an
	// /checkout/approvetxn/ URL. The approval transaction ID comes from the
	// Binary KeyValues payload of EMsg_ClientMicroTxnAuthRequest (5504). Until
	// that payload is received and correlated with the GC order, no checkout
	// link can be constructed safely.
	s.requestMu.Lock()
	defer s.requestMu.Unlock()
	// Keep the raw Steam-message observer enabled for the entire handoff. The
	// authorization path is account/session dependent, so diagnostics must not
	// assume that ClientMicroTxnAuthRequest is the only packet that can follow
	// the accepted GC response.
	s.steamTraceActive.Store(true)
	defer s.steamTraceActive.Store(false)
	trace := newDiagnosticTrace("Purchase trace started")
	trace.Add(fmt.Sprintf("SESSION routing identity platform=SteamClient runtime_os=%s client_os_type=%d active_appid=%d", runtime.GOOS, steamClientOSType(), appID))
	defer func() {
		if resultErr != nil {
			resultErr = trace.Error(resultErr)
		}
	}()
	// Steam routes the out-of-GC microtransaction authorization to the client
	// session playing the purchasing app. Working headless CS2 clients advertise
	// app 730 exclusively and allow Steam presence to settle before checkout;
	// advertising TF2/Dota alongside it can prevent emsg=5504 from being routed.
	s.mu.Lock()
	previousGames := append([]uint32(nil), s.gamesPlayed...)
	s.mu.Unlock()
	trace.Add(fmt.Sprintf("PRESENCE before purchase appids=%v", previousGames))
	if appID == cs2AppID && (len(previousGames) != 1 || previousGames[0] != cs2AppID) {
		if err := s.sendGamesPlayed([]uint32{cs2AppID}); err != nil {
			return StorePurchaseTransportResult{}, fmt.Errorf("isolate CS2 Steam presence for purchase: %w", err)
		}
		trace.Add("PRESENCE isolated appids=[730]; waiting 5s for Steam purchase routing")
		settle := time.NewTimer(5 * time.Second)
		defer settle.Stop()
		select {
		case <-ctx.Done():
			return StorePurchaseTransportResult{}, ctx.Err()
		case <-settle.C:
		}
		trace.Add("GC SESSION re-establishing CS2 after exclusive app presence")
		if err := s.reestablishCS2PurchaseSession(ctx, trace); err != nil {
			return StorePurchaseTransportResult{}, err
		}
	}
	body, err := gametracking.MarshalStorePurchaseInit(gametracking.StorePurchaseRequest{
		Country: request.Country, Language: request.Language, Currency: request.Currency,
		CountryPresent: request.CountryPresent, LanguagePresent: request.LanguagePresent, OmitCurrency: request.OmitCurrency,
		Lines: []gametracking.StorePurchaseLine{{
			ItemDefID: request.ItemDefID, Quantity: request.Quantity, Cost: request.Cost,
			PurchaseType: request.PurchaseType, SupplementalData: request.SupplementalData,
			OmitItemDefID: request.OmitItemDefID, OmitQuantity: request.OmitQuantity, OmitCost: request.OmitCost,
			PurchaseTypePresent: request.PurchaseTypePresent, OmitSupplementalData: request.OmitSupplementalData,
		}},
	})
	if err != nil {
		return StorePurchaseTransportResult{}, err
	}
	s.mu.Lock()
	conn := s.conn
	s.mu.Unlock()
	if conn == nil {
		return StorePurchaseTransportResult{}, ErrNotConnected
	}
	sourceJobID := uint64(conn.GetNextJobId())
	innerEnvelope, envelopeErr := encodeGCProtoPayloadWithSourceJob(emsgStorePurchaseInit, body, sourceJobID)
	if envelopeErr != nil {
		return StorePurchaseTransportResult{}, fmt.Errorf("encode purchase trace envelope: %w", envelopeErr)
	}
	purchaseTypeField := "<absent>"
	if request.PurchaseTypePresent {
		purchaseTypeField = fmt.Sprintf("%d", request.PurchaseType)
	}
	supplementalField := "<absent>"
	if !request.OmitSupplementalData {
		supplementalField = fmt.Sprintf("%d", request.SupplementalData)
	}
	log.Printf("[store-purchase] sending decoded GC request appid=%d emsg=%d message=CMsgGCStorePurchaseInit country=%q language=%d currency=%d item_def_id=%d quantity=%d cost=%d purchase_type=%s supplemental_data=%s body_bytes=%d",
		cs2AppID, emsgStorePurchaseInit, request.Country, request.Language, request.Currency, request.ItemDefID, request.Quantity, request.Cost, purchaseTypeField, supplementalField, len(body))
	trace.Add(fmt.Sprintf("SEND GC appid=%d emsg=%d (CMsgGCStorePurchaseInit)", cs2AppID, emsgStorePurchaseInit))
	trace.Add(fmt.Sprintf("SEND decoded fields country=%q language=%d currency=%d item_def_id=%d quantity=%d cost=%d purchase_type=%s supplemental_data=%s", request.Country, request.Language, request.Currency, request.ItemDefID, request.Quantity, request.Cost, purchaseTypeField, supplementalField))
	trace.Add(fmt.Sprintf("SEND encoded protobuf body_bytes=%d inner_envelope_bytes=%d source_job_id=%d", len(body), len(innerEnvelope), sourceJobID))
	// The generic GC event stream is intentionally not used for 5504. It has
	// multiple consumers (inventory, containers, authentication, store), so a
	// concurrent waiter can otherwise steal the one authorization packet for
	// this exact order. Remove only stale packets before creating a new order.
	for {
		select {
		case <-s.microTxnAuth:
			trace.Add("DROP stale queued Steam emsg=5504 authorization from an earlier order")
		default:
			goto MicroTxnQueueDrained
		}
	}
MicroTxnQueueDrained:
	if err = s.sendStoreProtoWithEnvelope(ctx, conn, appID, emsgStorePurchaseInit, body, innerEnvelope); err != nil {
		log.Printf("[store-purchase] GC request send failed appid=%d emsg=%d error=%v", cs2AppID, emsgStorePurchaseInit, err)
		return StorePurchaseTransportResult{}, err
	}
	log.Printf("[store-purchase] GC request sent appid=%d emsg=%d; waiting for GC emsg=%d and observing all subsequent Steam and GC messages", cs2AppID, emsgStorePurchaseInit, emsgStorePurchaseInitResponse)
	trace.Add(fmt.Sprintf("WAIT GC emsg=%d (CMsgGCStorePurchaseInitResponse); observe every subsequent Steam and CS2 GC message", emsgStorePurchaseInitResponse))
	var gc *gametracking.StorePurchaseResponse
	var auth map[string]any
	observed := make(map[string]int)
	for gc == nil || auth == nil {
		select {
		case <-ctx.Done():
			missing := "GC purchase response and Steam authorization transaction details"
			if gc != nil {
				missing = "Steam authorization transaction details after the accepted GC order"
			} else if auth != nil {
				missing = "GC purchase response"
			}
			gcDetail := "gc_response=missing"
			if gc != nil {
				gcDetail = fmt.Sprintf("gc_result=%d txn_id=%d gc_catalog_url_present=%t item_ids=%d", gc.Result, gc.TransactionID, gc.URL != "", len(gc.ItemIDs))
				if auth == nil && gc.Result == 1 && gc.URL == "" && len(gc.ItemIDs) == 0 {
					trace.Add("DIAGNOSIS GC allocated an order ID but supplied no checkout URL/item IDs and Steam supplied no emsg=5504; the purchase was not promoted to an authorization transaction")
				}
			}
			log.Printf("[store-purchase] wait ended error=%v missing=%q %s observed=%s", ctx.Err(), missing, gcDetail, formatObservedEvents(observed))
			return StorePurchaseTransportResult{}, fmt.Errorf("purchase initialization timed out waiting for %s; do not retry automatically: %w (%s; request item_def_id=%d quantity=%d cost=%d currency=%d purchase_type=%d supplemental_data=%d; observed %s)", missing, ctx.Err(), gcDetail, request.ItemDefID, request.Quantity, request.Cost, request.Currency, request.PurchaseType, request.SupplementalData, formatObservedEvents(observed))
		case event := <-s.events:
			observed[event.Type]++
			logStorePurchaseEvent(event)
			trace.Add(formatStorePurchaseEvent(event))
			if event.Type == "gc.message" {
				if message, ok := event.Payload.(GCMessage); ok && message.AppID == appID && message.EMsg == emsgStorePurchaseInitResponse {
					response, err := gametracking.UnmarshalStorePurchaseInitResponse(message.Body)
					if err != nil {
						log.Printf("[store-purchase] GC response decode failed emsg=%d body_hex=%x error=%v", message.EMsg, message.Body, err)
						return StorePurchaseTransportResult{}, err
					}
					gc = &response
					resultInfo := storePurchaseResult(gc.Result)
					log.Printf("[store-purchase] decoded GC response result=%d result_name=%s result_description=%q txn_id=%d url=%q item_ids=%v", gc.Result, resultInfo.code, resultInfo.description, gc.TransactionID, gc.URL, gc.ItemIDs)
					trace.Add(fmt.Sprintf("DECODE GC CMsgGCStorePurchaseInitResponse.result=%d (%s: %s)", gc.Result, resultInfo.code, resultInfo.description))
					trace.Add(fmt.Sprintf("DECODE GC CMsgGCStorePurchaseInitResponse.txn_id=%d", gc.TransactionID))
					trace.Add(fmt.Sprintf("DECODE GC CMsgGCStorePurchaseInitResponse.url=%q (present=%t)", gc.URL, gc.URL != ""))
					trace.Add(fmt.Sprintf("DECODE GC CMsgGCStorePurchaseInitResponse.item_ids=%v (count=%d)", gc.ItemIDs, len(gc.ItemIDs)))
					if gc.Result != 1 {
						return StorePurchaseTransportResult{}, fmt.Errorf("item_def_id=%d quantity=%d cost=%d currency=%d purchase_type=%d supplemental_data=%d: %w", request.ItemDefID, request.Quantity, request.Cost, request.Currency, request.PurchaseType, request.SupplementalData, StorePurchaseRejectedError{Result: gc.Result})
					}
					if auth != nil {
						authOrderID, hasAuthOrderID := kvUint64(auth, "orderid")
						if !hasAuthOrderID || authOrderID != gc.TransactionID {
							trace.Add(fmt.Sprintf("IGNORE previously received Steam emsg=5504 for nonmatching orderid=%v; awaiting exact gc_order_id=%d", auth["orderid"], gc.TransactionID))
							auth = nil
						}
					}
					// Do not synthesize a BuyItem fallback here. The response URL may be
					// a catalogue route used by some coupon-like offers, but conventional
					// CS2 cash-store products such as keys require the native order that
					// was just accepted. Only ClientMicroTxnAuthRequest can provide the
					// separate approval transaction ID for that order.
				}
			}
			if event.Type == "gc.failed" {
				return StorePurchaseTransportResult{}, fmt.Errorf("Steam reported that the game store purchase message failed")
			}
		case raw := <-s.microTxnAuth:
			parsed, parseErr := parseMicroTxnAuthorization(raw)
			if parseErr != nil {
				log.Printf("[store-purchase] Steam emsg=5504 BinaryKV decode failed body_hex=%x error=%v", raw, parseErr)
				return StorePurchaseTransportResult{}, parseErr
			}
			orderID, hasOrderID := kvUint64(parsed, "orderid")
			if gc != nil && (!hasOrderID || orderID != gc.TransactionID) {
				trace.Add(fmt.Sprintf("IGNORE Steam emsg=5504 for nonmatching orderid=%v; awaiting exact gc_order_id=%d", parsed["orderid"], gc.TransactionID))
				continue
			}
			auth = parsed
			lineItem, _ := authorizationLineItem(auth)
			log.Printf("[store-purchase] decoded dedicated Steam emsg=5504 orderid=%v transid=%v appid=%v lineitem=%v", auth["orderid"], auth["transid"], auth["appid"], lineItem)
			trace.Add(fmt.Sprintf("DECODE dedicated Steam emsg=5504 orderid=%v transid=%v appid=%v lineitem=%v", auth["orderid"], auth["transid"], auth["appid"], lineItem))
		}
	}
	orderID, ok := kvUint64(auth, "orderid")
	if !ok || orderID != gc.TransactionID {
		return StorePurchaseTransportResult{}, fmt.Errorf("Steam order did not match GC transaction")
	}
	if authorizationAppID, ok := kvUint64(auth, "appid"); ok && authorizationAppID != uint64(appID) {
		return StorePurchaseTransportResult{}, fmt.Errorf("Steam authorization app did not match purchasing AppID %d", appID)
	}
	lineItem, ok := authorizationLineItem(auth)
	if !ok {
		return StorePurchaseTransportResult{}, fmt.Errorf("Steam authorization did not include a line item")
	}
	if itemDefID, ok := kvUint64(lineItem, "gameitemid"); !ok || itemDefID != uint64(request.ItemDefID) {
		return StorePurchaseTransportResult{}, fmt.Errorf("Steam authorization item did not match store offer")
	}
	if quantity, ok := kvUint64(lineItem, "quantity"); !ok || quantity != uint64(request.Quantity) {
		return StorePurchaseTransportResult{}, fmt.Errorf("Steam authorization quantity did not match store request")
	}
	if amount, ok := kvUint64(lineItem, "amount"); !ok || amount != request.Cost {
		return StorePurchaseTransportResult{}, fmt.Errorf("Steam authorization amount did not match store offer")
	}
	transID, ok := kvUint64(auth, "transid")
	if !ok || transID == 0 {
		return StorePurchaseTransportResult{}, fmt.Errorf("Steam authorization did not include a checkout transaction ID")
	}
	// The GC response txn_id and URL describe the GC order. Steam's separate
	// authorization transid is the identifier accepted by approvetxn. Always
	// construct the native-client handoff from that value so a GC catalogue URL
	// or order ID can never be mistaken for the approval transaction.
	checkoutURL := steamCheckoutURL(transID, orderID)
	if err := ValidateSteamCheckoutURL(checkoutURL); err != nil {
		return StorePurchaseTransportResult{}, err
	}
	trace.Add(fmt.Sprintf("READY checkout_url=%q", checkoutURL))
	return StorePurchaseTransportResult{TransactionID: transID, OrderID: orderID, CheckoutURL: checkoutURL, ItemIDs: append([]uint64(nil), gc.ItemIDs...), Authorization: auth, Diagnostics: trace.Lines()}, nil
}

func (s *SteamGCClient) reestablishCS2PurchaseSession(ctx context.Context, trace *diagnosticTrace) error {
	body, err := cs2ClientHello()
	if err != nil {
		return fmt.Errorf("encode purchase-session CS2 ClientHello: %w", err)
	}
	if err := s.SendProtoToGC(ctx, cs2AppID, uint32(protocol.EMsgGCClientHello), body); err != nil {
		return fmt.Errorf("send purchase-session CS2 ClientHello: %w", err)
	}
	trace.Add(fmt.Sprintf("GC SESSION sent CMsgClientHello emsg=%d after exclusive presence", protocol.EMsgGCClientHello))
	for {
		select {
		case <-ctx.Done():
			return fmt.Errorf("wait for purchase-session CS2 ClientWelcome: %w", ctx.Err())
		case event := <-s.events:
			trace.Add(formatStorePurchaseEvent(event))
			message, ok := event.Payload.(GCMessage)
			if event.Type != "gc.message" || !ok || message.AppID != cs2AppID {
				continue
			}
			if message.EMsg == protocol.EMsgGCCStrike15V2ClientLogonFatalError {
				return decodeCS2ClientLogonFatalError(message.Body)
			}
			if message.EMsg != protocol.EMsgGCClientWelcome {
				continue
			}
			s.mu.Lock()
			s.lastWelcome = append([]byte(nil), message.Body...)
			s.mu.Unlock()
			trace.Add("GC SESSION received CMsgClientWelcome under exclusive app 730 presence")
			return nil
		}
	}
}

func (s *SteamGCClient) sendStoreProtoWithEnvelope(ctx context.Context, conn interface{ SendPacket(*steammsg.Packet) error }, appID uint32, emsg uint32, body, envelope []byte) error {
	select {
	case <-ctx.Done():
		return ctx.Err()
	default:
	}
	header := steammsg.NewProtoHeader(steamlang.EMsg_ClientToGC)
	header.Proto.RoutingAppid = proto.Uint32(appID)
	packet, err := steammsg.EncodePacket(header, &steampb.CMsgGCClient{Appid: proto.Uint32(appID), Msgtype: proto.Uint32(emsg | protoMask), Payload: envelope}, nil)
	if err != nil {
		return err
	}
	if err := conn.SendPacket(packet); err != nil {
		return err
	}
	s.recordGCProtocol("sent", appID, emsg, body)
	return nil
}

func (s *SteamGCClient) FinalizeStorePurchase(ctx context.Context, orderID uint64) ([]uint64, error) {
	return s.FinalizeGameStorePurchase(ctx, cs2AppID, orderID)
}

func (s *SteamGCClient) FinalizeGameStorePurchase(ctx context.Context, appID uint32, orderID uint64) ([]uint64, error) {
	if orderID == 0 {
		return nil, fmt.Errorf("store purchase order ID is required")
	}
	s.requestMu.Lock()
	defer s.requestMu.Unlock()
	s.mu.Lock()
	conn := s.conn
	s.mu.Unlock()
	if conn == nil {
		return nil, ErrNotConnected
	}
	body, err := gametracking.MarshalStorePurchaseFinalize(orderID)
	if err != nil {
		return nil, err
	}
	finalizeEMsg, responseEMsg := storeFinalizeMessageIDs(appID)
	envelope, err := encodeGCProtoPayloadWithSourceJob(finalizeEMsg, body, uint64(conn.GetNextJobId()))
	if err != nil {
		return nil, err
	}
	if err := s.sendStoreProtoWithEnvelope(ctx, conn, appID, finalizeEMsg, body, envelope); err != nil {
		return nil, err
	}
	for {
		select {
		case <-ctx.Done():
			return nil, fmt.Errorf("store purchase finalization response: %w", ctx.Err())
		case event := <-s.events:
			message, ok := event.Payload.(GCMessage)
			if event.Type != "gc.message" || !ok || message.AppID != appID || message.EMsg != responseEMsg {
				continue
			}
			response, err := gametracking.UnmarshalStorePurchaseFinalizeResponse(message.Body)
			if err != nil {
				return nil, err
			}
			if response.Result != 1 {
				return nil, fmt.Errorf("CS2 rejected store purchase finalization with result %d", response.Result)
			}
			return response.ItemIDs, nil
		}
	}
}

func storeFinalizeMessageIDs(appID uint32) (uint32, uint32) {
	if appID == 440 {
		return 2512, 2513
	}
	return emsgStorePurchaseFinalize, emsgStorePurchaseFinalizeResponse
}

func formatStorePurchaseEvent(event GCEvent) string {
	switch payload := event.Payload.(type) {
	case GCMessage:
		emsg := payload.EMsg &^ protoMask
		name := fmt.Sprintf("GC message %d", emsg)
		switch emsg {
		case emsgStorePurchaseInit:
			name = "CMsgGCStorePurchaseInit"
		case emsgStorePurchaseInitResponse:
			name = "CMsgGCStorePurchaseInitResponse"
		case emsgStorePurchaseFinalize:
			name = "CMsgGCStorePurchaseFinalize"
		case emsgStorePurchaseFinalizeResponse:
			name = "CMsgGCStorePurchaseFinalizeResponse"
		}
		if event.Type == "gc.message" {
			return fmt.Sprintf("RECV event=%s appid=%d emsg=%d (%s) protobuf=true body_bytes=%d", event.Type, payload.AppID, emsg, name, len(payload.Body))
		}
		return fmt.Sprintf("RECV event=%s appid=%d emsg=%d (%s) protobuf_envelope=%t body_bytes=%d", event.Type, payload.AppID, emsg, name, payload.EMsg&protoMask != 0, len(payload.Body))
	case []byte:
		return fmt.Sprintf("RECV event=%s binary_payload_bytes=%d (decoded in the following protocol entry)", event.Type, len(payload))
	default:
		return fmt.Sprintf("RECV event=%s payload_type=%T payload=%v", event.Type, event.Payload, event.Payload)
	}
}

func logStorePurchaseEvent(event GCEvent) {
	switch payload := event.Payload.(type) {
	case GCMessage:
		log.Printf("[store-purchase] received event=%s appid=%d emsg=%d steamid=%d gcname=%q body_bytes=%d", event.Type, payload.AppID, payload.EMsg, payload.SteamID, payload.GCName, len(payload.Body))
	case []byte:
		log.Printf("[store-purchase] received event=%s binary_payload_bytes=%d; structured decode follows", event.Type, len(payload))
	default:
		log.Printf("[store-purchase] received event=%s payload_type=%T payload=%v", event.Type, event.Payload, event.Payload)
	}
}

func steamCheckoutURL(transID, orderID uint64) string {
	finalizeURL := fmt.Sprintf("https://store.steampowered.com/buyitem/730/finalize/%d?canceledurl=https%%3A%%2F%%2Fstore.steampowered.com%%2F&returnhost=store.steampowered.com", orderID)
	return fmt.Sprintf("https://checkout.steampowered.com/checkout/approvetxn/%d/?returnurl=%s&canceledurl=https%%3A%%2F%%2Fstore.steampowered.com%%2F", transID, url.QueryEscape(finalizeURL))
}

func ValidateSteamCheckoutURL(raw string) error {
	parsed, err := url.Parse(raw)
	if err != nil || parsed.Scheme != "https" || parsed.User != nil || parsed.Hostname() == "" || netParseIP(parsed.Hostname()) {
		return fmt.Errorf("Steam checkout URL is invalid")
	}
	host := strings.ToLower(parsed.Hostname())
	// Deliberately reject store.steampowered.com/buyitem links. This validator
	// is for an already-created native CS2 transaction, not for starting a
	// separate Steam Inventory Service web purchase.
	if host != "checkout.steampowered.com" || !strings.HasPrefix(parsed.EscapedPath(), "/checkout/approvetxn/") {
		return fmt.Errorf("URL is not a Steam transaction-approval page")
	}
	return nil
}
func netParseIP(host string) bool {
	for _, c := range host {
		if (c < '0' || c > '9') && c != '.' && c != ':' {
			return false
		}
	}
	return true
}

func parseMicroTxnAuthorization(raw []byte) (map[string]any, error) {
	if len(raw) < 2 {
		return nil, fmt.Errorf("Steam microtransaction authorization was empty")
	}
	values := map[string]any{}
	reader := bytes.NewReader(raw[1:])
	if err := parseBinaryKV(reader, values); err != nil {
		return nil, fmt.Errorf("decode Steam microtransaction authorization: %w", err)
	}
	return values, nil
}
func parseBinaryKV(r *bytes.Reader, out map[string]any) error {
	for {
		kind, err := r.ReadByte()
		if err != nil {
			return err
		}
		if kind == 8 || kind == 11 {
			return nil
		}
		key, err := readCString(r)
		if err != nil {
			return err
		}
		normalized := strings.ToLower(key)
		switch kind {
		case 0:
			child := make(map[string]any)
			if err := parseBinaryKV(r, child); err != nil {
				return err
			}
			out[normalized] = child
		case 1:
			value, err := readCString(r)
			if err != nil {
				return err
			}
			out[normalized] = value
		case 2, 3, 5:
			var value uint32
			if err := binary.Read(r, binary.LittleEndian, &value); err != nil {
				return err
			}
			out[normalized] = uint64(value)
		case 7, 9, 10:
			var value uint64
			if err := binary.Read(r, binary.LittleEndian, &value); err != nil {
				return err
			}
			out[normalized] = value
		case 6:
			var value uint32
			if err := binary.Read(r, binary.LittleEndian, &value); err != nil {
				return err
			}
			out[normalized] = uint64(value)
		default:
			return fmt.Errorf("unsupported binary KeyValues type %d", kind)
		}
	}
}

func authorizationLineItem(values map[string]any) (map[string]any, bool) {
	lineItems, ok := values["lineitems"].(map[string]any)
	if !ok {
		return nil, false
	}
	lineItem, ok := lineItems["0"].(map[string]any)
	return lineItem, ok
}
func readCString(r *bytes.Reader) (string, error) {
	var b []byte
	for len(b) <= math.MaxUint16 {
		c, err := r.ReadByte()
		if err != nil {
			return "", err
		}
		if c == 0 {
			return string(b), nil
		}
		b = append(b, c)
	}
	return "", fmt.Errorf("binary KeyValues string too long")
}
func kvUint64(values map[string]any, keys ...string) (uint64, bool) {
	for _, key := range keys {
		value, ok := values[key]
		if !ok {
			continue
		}
		switch typed := value.(type) {
		case uint64:
			return typed, true
		case string:
			parsed, err := strconv.ParseUint(typed, 10, 64)
			return parsed, err == nil
		}
	}
	return 0, false
}
