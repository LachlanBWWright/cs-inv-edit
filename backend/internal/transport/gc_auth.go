package transport

import (
	"context"
	"encoding/base64"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"strings"
	"time"

	"cs-inv-edit/backend/internal/proto/steampb"
	"google.golang.org/protobuf/proto"
)

func (s *SteamGCClient) LogOn(ctx context.Context, credentials LogonCredentials) (LogonResult, error) {
	return s.logOn(ctx, credentials, true)
}

func (s *SteamGCClient) BeginQRAuth(ctx context.Context) (QRAuthSession, error) {
	s.mu.Lock()
	conn := s.conn
	s.mu.Unlock()
	if conn == nil {
		return QRAuthSession{}, ErrNotConnected
	}
	trace := newDiagnosticTrace("steam qr auth started over CM unified messages")
	if err := conn.SendPacket(mustClientHelloPacket()); err != nil {
		return QRAuthSession{}, trace.Error(fmt.Errorf("steam client hello send failed: %w", err))
	}
	request := &steampb.CAuthentication_BeginAuthSessionViaQR_Request{
		DeviceFriendlyName: proto.String("cs-inv-edit"),
		PlatformType:       steampb.EAuthTokenPlatformType_k_EAuthTokenPlatformType_SteamClient.Enum(),
		WebsiteId:          proto.String("Client"),
		DeviceDetails: &steampb.CAuthentication_DeviceDetails{
			DeviceFriendlyName: proto.String("cs-inv-edit"),
			PlatformType:       steampb.EAuthTokenPlatformType_k_EAuthTokenPlatformType_SteamClient.Enum(),
			OsType:             proto.Int32(steamClientOSType()),
			MachineId:          steamMachineID("qr"),
		},
	}
	response := new(steampb.CAuthentication_BeginAuthSessionViaQR_Response)
	if err := sendNonAuthedUnified(ctx, newNonAuthedUnifiedHandler(), conn, "Authentication.BeginAuthSessionViaQR#1", request, response, trace); err != nil {
		return QRAuthSession{}, trace.Error(fmt.Errorf("steam QR CM request failed: %w", err))
	}
	interval := time.Second
	if response.GetInterval() > 0 {
		interval = time.Duration(float64(time.Second) * float64(response.GetInterval()))
	}
	if missing := qrChallengeMissingFields(response); len(missing) > 0 {
		return QRAuthSession{}, trace.Error(fmt.Errorf("steam QR CM response missing %s", strings.Join(missing, ", ")))
	}
	return QRAuthSession{ClientID: response.GetClientId(), RequestID: response.GetRequestId(), ChallengeURL: response.GetChallengeUrl(), PollInterval: interval}, nil
}

type steamQRBeginResponse struct {
	ClientID     uint64  `json:"client_id,string"`
	ChallengeURL string  `json:"challenge_url"`
	RequestID    string  `json:"request_id"`
	Interval     float32 `json:"interval"`
}

func beginSteamQRViaWebAPI(ctx context.Context) (steamQRBeginResponse, error) {
	form := url.Values{
		"device_friendly_name":                 {"cs-inv-edit"},
		"platform_type":                        {"1"},
		"website_id":                           {"Client"},
		"device_details[device_friendly_name]": {"cs-inv-edit"},
		"device_details[platform_type]":        {"1"},
		"device_details[os_type]":              {"20"},
	}
	request, err := http.NewRequestWithContext(ctx, http.MethodPost, "https://api.steampowered.com/IAuthenticationService/BeginAuthSessionViaQR/v1/", strings.NewReader(form.Encode()))
	if err != nil {
		return steamQRBeginResponse{}, err
	}
	request.Header.Set("Content-Type", "application/x-www-form-urlencoded")
	response, err := (&http.Client{Timeout: 10 * time.Second}).Do(request)
	if err != nil {
		return steamQRBeginResponse{}, err
	}
	defer response.Body.Close()
	body, err := io.ReadAll(io.LimitReader(response.Body, 1<<20))
	if err != nil {
		return steamQRBeginResponse{}, err
	}
	if response.StatusCode < 200 || response.StatusCode >= 300 {
		return steamQRBeginResponse{}, fmt.Errorf("Steam auth API returned HTTP %d", response.StatusCode)
	}
	var envelope struct {
		Response steamQRBeginResponse `json:"response"`
	}
	if err := json.Unmarshal(body, &envelope); err != nil {
		return steamQRBeginResponse{}, fmt.Errorf("decode Steam auth API response: %w", err)
	}
	return envelope.Response, nil
}

func qrWebChallengeMissingFields(response steamQRBeginResponse) []string {
	missing := make([]string, 0, 3)
	if response.ChallengeURL == "" {
		missing = append(missing, "challenge_url")
	}
	if response.ClientID == 0 {
		missing = append(missing, "client_id")
	}
	if response.RequestID == "" {
		missing = append(missing, "request_id")
	}
	return missing
}

func qrChallengeMissingFields(response *steampb.CAuthentication_BeginAuthSessionViaQR_Response) []string {
	if response == nil {
		return []string{"response"}
	}
	missing := make([]string, 0, 3)
	if response.GetChallengeUrl() == "" {
		missing = append(missing, "challenge_url")
	}
	if response.GetClientId() == 0 {
		missing = append(missing, "client_id")
	}
	if len(response.GetRequestId()) == 0 {
		missing = append(missing, "request_id")
	}
	return missing
}

func (s *SteamGCClient) CompleteQRAuth(ctx context.Context, session QRAuthSession) (QRAuthResult, error) {
	trace := newDiagnosticTrace("steam qr auth polling started")
	s.mu.Lock()
	conn := s.conn
	s.mu.Unlock()
	if conn == nil {
		return QRAuthResult{}, ErrNotConnected
	}
	unified := newNonAuthedUnifiedHandler()
	interval := session.PollInterval
	if interval <= 0 {
		interval = time.Second
	}
	ticker := time.NewTimer(0)
	defer ticker.Stop()
	consecutiveFailures := 0
	for {
		select {
		case <-ctx.Done():
			return QRAuthResult{}, ctx.Err()
		case <-ticker.C:
			response := new(steampb.CAuthentication_PollAuthSessionStatus_Response)
			err := sendNonAuthedUnified(ctx, unified, conn, "Authentication.PollAuthSessionStatus#1", &steampb.CAuthentication_PollAuthSessionStatus_Request{
				ClientId:  proto.Uint64(session.ClientID),
				RequestId: append([]byte(nil), session.RequestID...),
			}, response, trace)
			if err != nil {
				consecutiveFailures++
				trace.Add(fmt.Sprintf("steam qr auth poll transient failure=%d/5 error=%v", consecutiveFailures, err))
				if consecutiveFailures >= 5 {
					return QRAuthResult{}, trace.Error(fmt.Errorf("steam qr auth polling failed after %d consecutive attempts: %w", consecutiveFailures, err))
				}
				retryDelay := time.Duration(consecutiveFailures) * interval
				if retryDelay > 5*time.Second {
					retryDelay = 5 * time.Second
				}
				ticker.Reset(retryDelay)
				continue
			}
			consecutiveFailures = 0
			if response.GetNewClientId() != 0 {
				session.ClientID = response.GetNewClientId()
			}
			if response.GetNewChallengeUrl() != "" {
				session.ChallengeURL = response.GetNewChallengeUrl()
				if session.OnChallengeURL != nil {
					session.OnChallengeURL(response.GetNewChallengeUrl())
				}
			}
			token := response.GetRefreshToken()
			if token == "" {
				token = response.GetAccessToken()
			}
			if token != "" {
				return QRAuthResult{AccountName: response.GetAccountName(), AccessToken: response.GetAccessToken(), RefreshToken: token}, nil
			}
			ticker.Reset(interval)
		}
	}
}

type steamQRPollResponse struct {
	NewClientID     uint64 `json:"new_client_id,string"`
	NewChallengeURL string `json:"new_challenge_url"`
	RefreshToken    string `json:"refresh_token"`
	AccessToken     string `json:"access_token"`
	AccountName     string `json:"account_name"`
}

func pollSteamQRViaWebAPI(ctx context.Context, session QRAuthSession) (steamQRPollResponse, error) {
	form := url.Values{
		"client_id":  {fmt.Sprintf("%d", session.ClientID)},
		"request_id": {base64.StdEncoding.EncodeToString(session.RequestID)},
	}
	request, err := http.NewRequestWithContext(ctx, http.MethodPost, "https://api.steampowered.com/IAuthenticationService/PollAuthSessionStatus/v1/", strings.NewReader(form.Encode()))
	if err != nil {
		return steamQRPollResponse{}, err
	}
	request.Header.Set("Content-Type", "application/x-www-form-urlencoded")
	response, err := (&http.Client{Timeout: 10 * time.Second}).Do(request)
	if err != nil {
		return steamQRPollResponse{}, err
	}
	defer response.Body.Close()
	body, err := io.ReadAll(io.LimitReader(response.Body, 1<<20))
	if err != nil {
		return steamQRPollResponse{}, err
	}
	if response.StatusCode < 200 || response.StatusCode >= 300 {
		return steamQRPollResponse{}, fmt.Errorf("Steam auth poll API returned HTTP %d", response.StatusCode)
	}
	var envelope struct {
		Response steamQRPollResponse `json:"response"`
	}
	if err := json.Unmarshal(body, &envelope); err != nil {
		return steamQRPollResponse{}, fmt.Errorf("decode Steam auth poll API response: %w", err)
	}
	return envelope.Response, nil
}
