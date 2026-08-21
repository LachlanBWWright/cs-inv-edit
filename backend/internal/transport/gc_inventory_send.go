package transport

import (
	"context"
	"errors"
	"fmt"
	"time"

	"cs-inv-edit/backend/internal/protocol"
	"github.com/Lucino772/envelop/pkg/steam/steamlang"
	"github.com/Lucino772/envelop/pkg/steam/steampb"
)

func (s *SteamGCClient) SendToGC(ctx context.Context, appID uint32, emsg uint32, body []byte) error {
	return s.sendToGC(ctx, appID, emsg, body, false)
}

func (s *SteamGCClient) SendProtoToGC(ctx context.Context, appID uint32, emsg uint32, body []byte) error {
	return s.sendToGC(ctx, appID, emsg, body, true)
}

func (s *SteamGCClient) sendToGC(ctx context.Context, appID uint32, emsg uint32, body []byte, protobufPayload bool) error {
	select {
	case <-ctx.Done():
		return ctx.Err()
	default:
	}
	s.mu.Lock()
	conn := s.conn
	s.mu.Unlock()
	if conn == nil {
		return ErrNotConnected
	}
	packet, err := encodeGCClientPacket(appID, emsg, body, protobufPayload)
	if err != nil {
		return err
	}
	if err := conn.SendPacket(packet); err != nil {
		return err
	}
	if protobufPayload {
		s.recordGCProtocol("sent", appID, emsg, body)
	}
	diagnosticEMsg := emsg
	if protobufPayload {
		diagnosticEMsg = emsg | protoMask
	}
	diagnostic := GCEvent{Type: "gc.sent", Payload: GCMessage{AppID: appID, EMsg: diagnosticEMsg, Body: append([]byte(nil), packetBodyForDiagnostics(emsg, body, protobufPayload)...)}}
	select {
	case s.events <- diagnostic:
	default:
		// ProtocolTrace already recorded the send. A full diagnostic queue must
		// never block or change the outcome of the real GC operation.
	}
	return nil
}

func packetBodyForDiagnostics(emsg uint32, body []byte, protobufPayload bool) []byte {
	if !protobufPayload {
		return body
	}
	payload, err := encodeGCProtoPayload(emsg, body)
	if err != nil {
		return body
	}
	return payload
}

// CS2's terminal UI polls for the volatile offer for five one-second
// intervals after requesting casket contents. Keep the GC receiver alive for
// that same window so a late CSOVolatileItemOffer is not discarded after the
// ordinary ClientWelcome arrives.
const cs2PostWelcomeSettle = 5 * time.Second

func (s *SteamGCClient) RequestInventory(ctx context.Context) ([]GCInventoryItem, error) {
	s.requestMu.Lock()
	defer s.requestMu.Unlock()
	trace := newDiagnosticTrace("cs2 gc inventory request started")
	if err := s.ensureSteamSession(ctx); err != nil {
		return nil, trace.Error(fmt.Errorf("steam session recovery failed: %w", err))
	}
	if err := s.ensureGamesPlayedIncludes(protocol.AppIDCS2); err != nil {
		wrapped := fmt.Errorf("cs2 games played presence failed: %w", err)
		return nil, trace.Error(wrapped)
	}
	trace.Add("cs2 games played presence sent")
	body, err := cs2ClientHello()
	if err != nil {
		return nil, err
	}
	helloEMsg := uint32(protocol.EMsgGCClientHello)
	if err := s.SendProtoToGC(ctx, protocol.AppIDCS2, helloEMsg, body); err != nil {
		wrapped := fmt.Errorf("cs2 gc client hello send failed: %w", err)
		return nil, trace.Error(wrapped)
	}
	trace.Add(fmt.Sprintf("cs2 gc ClientHello sent emsg=%d client_version=%d", helloEMsg, cs2ClientVersion))
	helloRetry := time.NewTimer(time.Second)
	defer helloRetry.Stop()
	helloRetryDelay := time.Second
	helloRetryCount := 0
	statusNoSessionCount := 0
	incrementalItems := make(map[uint64]GCInventoryItem)
	volatileOffers := make(map[uint32][]GCVolatileOffer)
	var welcomeItems []GCInventoryItem
	var settleTimer *time.Timer
	var settle <-chan time.Time
	defer func() {
		if settleTimer != nil {
			settleTimer.Stop()
		}
	}()
	for {
		select {
		case <-ctx.Done():
			if len(welcomeItems) > 0 {
				welcomeItems = mergeInventoryItemMap(welcomeItems, incrementalItems)
				attachVolatileOffers(welcomeItems, volatileOffers)
				trace.Add(fmt.Sprintf("cs2 gc settle interrupted by context; returning inventory_items=%d incremental_econ_items=%d volatile_offer_defindexes=%d", len(welcomeItems), len(incrementalItems), len(volatileOffers)))
				return welcomeItems, nil
			}
			wrapped := fmt.Errorf("cs2 gc inventory timed out waiting for ClientWelcome after %d ClientHello retries (client_version=%d): %w", helloRetryCount, cs2ClientVersion, ctx.Err())
			return nil, trace.Error(wrapped)
		case <-settle:
			welcomeItems = mergeInventoryItemMap(welcomeItems, incrementalItems)
			attachVolatileOffers(welcomeItems, volatileOffers)
			trace.Add(fmt.Sprintf("cs2 gc post-welcome settle completed inventory_items=%d incremental_econ_items=%d volatile_offer_defindexes=%d", len(welcomeItems), len(incrementalItems), len(volatileOffers)))
			return welcomeItems, nil
		case <-helloRetry.C:
			if len(welcomeItems) > 0 {
				continue
			}
			if err := s.SendProtoToGC(ctx, protocol.AppIDCS2, helloEMsg, body); err != nil {
				if errors.Is(err, ErrNotConnected) {
					trace.Add("steam transport dropped while waiting for CS2 GC; attempting one session recovery")
					if recoveryErr := s.ensureSteamSession(ctx); recoveryErr != nil {
						wrapped := fmt.Errorf("cs2 gc session recovery failed: %w", sessionConflictError(recoveryErr))
						return nil, trace.Error(wrapped)
					}
					if recoveryErr := s.ensureGamesPlayedIncludes(protocol.AppIDCS2); recoveryErr != nil {
						return nil, trace.Error(fmt.Errorf("cs2 presence recovery failed: %w", recoveryErr))
					}
					trace.Add("steam session and CS2 presence recovered")
				} else {
					wrapped := fmt.Errorf("cs2 gc client hello retry failed: %w", err)
					return nil, trace.Error(wrapped)
				}
				if err := s.SendProtoToGC(ctx, protocol.AppIDCS2, helloEMsg, body); err != nil {
					return nil, trace.Error(fmt.Errorf("cs2 gc client hello send after session recovery failed: %w", err))
				}
			}
			helloRetryCount++
			trace.Add(fmt.Sprintf("cs2 gc ClientHello retry sent emsg=%d delay=%s retry=%d", helloEMsg, helloRetryDelay, helloRetryCount))
			helloRetryDelay *= 2
			if helloRetryDelay > 8*time.Second {
				helloRetryDelay = 8 * time.Second
			}
			helloRetry.Reset(helloRetryDelay)
		case event := <-s.events:
			trace.Add(fmt.Sprintf("cs2 gc observed event type=%s", event.Type))
			if event.Type == "steam.logged_off" {
				if loggedOff, ok := event.Payload.(*steampb.CMsgClientLoggedOff); ok {
					result := loggedOff.GetEresult()
					if result == int32(steamlang.EResult_LoggedInElsewhere) || result == int32(steamlang.EResult_AlreadyLoggedInElsewhere) {
						return nil, trace.Error(SteamSessionConflictError{Result: result})
					}
				}
				return nil, trace.Error(fmt.Errorf("Steam ended the session while waiting for CS2 GC; retry to reconnect"))
			}
			if event.Type == "steam.games_played.sent" || event.Type == "gc.sent" {
				trace.Add(fmt.Sprintf("cs2 gc observed event payload=%v", event.Payload))
			}
			message, ok := event.Payload.(GCMessage)
			if !ok || event.Type != "gc.message" {
				continue
			}
			trace.Add(fmt.Sprintf("cs2 gc observed appid=%d emsg=%d body_bytes=%d", message.AppID, message.EMsg, len(message.Body)))
			if message.AppID != protocol.AppIDCS2 {
				continue
			}
			if message.EMsg == protocol.EMsgGCCStrike15V2ClientLogonFatalError {
				return nil, trace.Error(decodeCS2ClientLogonFatalError(message.Body))
			}
			if message.EMsg == protocol.EMsgGCClientConnectionStatus {
				status, err := decodeCS2ConnectionStatus(message.Body)
				if err != nil {
					return nil, trace.Error(err)
				}
				trace.Add("cs2 gc connection status " + status)
				if isCS2ConnectionStatusNoSession(message.Body) {
					statusNoSessionCount++
					nextHello := nextCS2HelloEMsg(helloEMsg)
					if nextHello != helloEMsg {
						helloEMsg = nextHello
						helloRetryDelay = time.Second
						trace.Add(fmt.Sprintf("cs2 gc switching ClientHello variant after NO_SESSION next_emsg=%d", helloEMsg))
						if err := s.SendProtoToGC(ctx, protocol.AppIDCS2, helloEMsg, body); err != nil {
							wrapped := fmt.Errorf("cs2 gc client hello variant send failed: %w", err)
							return nil, trace.Error(wrapped)
						}
						trace.Add(fmt.Sprintf("cs2 gc ClientHello variant sent emsg=%d", helloEMsg))
						resetTimer(helloRetry, helloRetryDelay)
						continue
					}
					if statusNoSessionCount >= 2 {
						return nil, trace.Error(fmt.Errorf("CS2 GC refused session: %s", status))
					}
				}
				continue
			}
			if message.EMsg == protocol.EMsgGCClientWelcome {
				s.mu.Lock()
				s.lastWelcome = append([]byte(nil), message.Body...)
				s.mu.Unlock()
				items, err := decodeInventoryFromClientWelcome(message.Body)
				if err != nil {
					return nil, trace.Error(err)
				}
				welcomeItems = items
				if settleTimer == nil {
					settleTimer = time.NewTimer(cs2PostWelcomeSettle)
				} else {
					resetTimer(settleTimer, cs2PostWelcomeSettle)
				}
				settle = settleTimer.C
				trace.Add(fmt.Sprintf("cs2 gc ClientWelcome decoded inventory_items=%d; settling asynchronous SO updates for %s", len(items), cs2PostWelcomeSettle))
				continue
			}
			update, found, decodeErr := decodeCS2IncrementalInventory(message)
			if decodeErr != nil {
				trace.Add(fmt.Sprintf("cs2 gc incremental economy decode failed emsg=%d error=%v", message.EMsg, decodeErr))
				continue
			}
			if found {
				for _, item := range update.Items {
					incrementalItems[item.ID] = item
				}
				for defindex, offers := range update.VolatileOffers {
					volatileOffers[defindex] = append([]GCVolatileOffer(nil), offers...)
				}
				if settleTimer != nil {
					resetTimer(settleTimer, 250*time.Millisecond)
				}
				trace.Add(fmt.Sprintf("cs2 gc retained incremental objects emsg=%d economy_items=%d volatile_offer_defindexes=%d", message.EMsg, len(update.Items), len(update.VolatileOffers)))
			}
		}
	}
}
