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

	"github.com/Lucino772/envelop/pkg/steam/steampb"
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
	if err := conn.SendPacket(mustClientHelloPacket()); err != nil {
		return QRAuthSession{}, fmt.Errorf("steam client hello send failed: %w", err)
	}
	trace := newDiagnosticTrace("steam qr auth started")
	var response steamQRBeginResponse
	for attempt := 1; attempt <= 3; attempt++ {
		trace.Add(fmt.Sprintf("steam qr auth challenge attempt=%d/3", attempt))
		var err error
		response, err = beginSteamQRViaWebAPI(ctx)
		if err != nil {
			return QRAuthSession{}, trace.Error(fmt.Errorf("steam qr auth session failed: %w", err))
		}
		missing := qrWebChallengeMissingFields(response)
		if len(missing) == 0 {
			break
		}
		trace.Add("steam qr auth response missing fields=" + strings.Join(missing, ","))
		if attempt < 3 {
			select {
			case <-ctx.Done():
				return QRAuthSession{}, trace.Error(ctx.Err())
			case <-time.After(300 * time.Millisecond):
			}
		}
	}
	if missing := qrWebChallengeMissingFields(response); len(missing) > 0 {
		return QRAuthSession{}, trace.Error(fmt.Errorf("steam qr auth returned an incomplete challenge after 3 attempts (missing %s)", strings.Join(missing, ", ")))
	}
	interval := time.Second
	if response.Interval > 0 {
		interval = time.Duration(float64(time.Second) * float64(response.Interval))
	}
	requestID, err := base64.StdEncoding.DecodeString(response.RequestID)
	if err != nil {
		return QRAuthSession{}, trace.Error(fmt.Errorf("steam qr auth returned an invalid request_id: %w", err))
	}
	return QRAuthSession{ClientID: response.ClientID, RequestID: requestID, ChallengeURL: response.ChallengeURL, PollInterval: interval}, nil
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
			response, err := pollSteamQRViaWebAPI(ctx, session)
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
			if response.NewClientID != 0 {
				session.ClientID = response.NewClientID
			}
			if response.NewChallengeURL != "" {
				session.ChallengeURL = response.NewChallengeURL
				if session.OnChallengeURL != nil {
					session.OnChallengeURL(response.NewChallengeURL)
				}
			}
			token := response.RefreshToken
			if token == "" {
				token = response.AccessToken
			}
			if token != "" {
				return QRAuthResult{AccountName: response.AccountName, AccessToken: response.AccessToken, RefreshToken: token}, nil
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
