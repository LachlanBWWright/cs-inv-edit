package transport

import (
	"crypto/rand"
	"crypto/rsa"
	"encoding/base64"
	"encoding/json"
	"fmt"
	"io"
	"math/big"
	"net/http"
	"net/url"
	"strings"
)

type SteamClient struct{}

func NewSteamClient() *SteamClient {
	return &SteamClient{}
}

type rsaResponse struct {
	Success      bool   `json:"success"`
	PublicKeyMod string `json:"publickey_mod"`
	PublicKeyExp string `json:"publickey_exp"`
	Timestamp    string `json:"timestamp"`
	Message      string `json:"message"`
}

type loginResponse struct {
	Success          bool   `json:"success"`
	RequiresTwoFactor bool  `json:"requires_twofactor"`
	Message          string `json:"message"`
	LoginComplete    bool   `json:"login_complete"`
	EmailAuthNeeded  bool   `json:"emailauth_needed"`
	EmailDomain      string `json:"emaildomain"`
	EmailSteamID     string `json:"emailsteamid"`
}

func (s *SteamClient) ValidateCredentials(username, password, authCode string) (string, error) {
	// 1. Get RSA Key
	resp, err := http.PostForm("https://steamcommunity.com/login/getrsakey/", url.Values{"username": {username}})
	if err != nil {
		return "", fmt.Errorf("failed to fetch RSA key: %v", err)
	}
	defer resp.Body.Close()

	body, _ := io.ReadAll(resp.Body)
	var rsaResp rsaResponse
	if err := json.Unmarshal(body, &rsaResp); err != nil {
		return "", fmt.Errorf("failed to parse RSA response: %v", err)
	}
	if !rsaResp.Success {
		return "", fmt.Errorf("failed to get RSA key: %s", rsaResp.Message)
	}

	// 2. Encrypt Password
	modulus := new(big.Int)
	modulus.SetString(rsaResp.PublicKeyMod, 16)
	exponent := new(big.Int)
	exponent.SetString(rsaResp.PublicKeyExp, 16)

	pubKey := &rsa.PublicKey{
		N: modulus,
		E: int(exponent.Int64()),
	}

	encryptedBytes, err := rsa.EncryptPKCS1v15(rand.Reader, pubKey, []byte(password))
	if err != nil {
		return "", fmt.Errorf("failed to encrypt password: %v", err)
	}
	encryptedPassword := base64.StdEncoding.EncodeToString(encryptedBytes)

	// 3. Do Login
	loginVals := url.Values{
		"username":     {username},
		"password":     {encryptedPassword},
		"rsatimestamp": {rsaResp.Timestamp},
		"donotcache":   {"1700000000000"},
	}

	if authCode != "" {
		loginVals.Set("twofactorcode", authCode)
	}

	req, _ := http.NewRequest("POST", "https://steamcommunity.com/login/dologin/", strings.NewReader(loginVals.Encode()))
	req.Header.Set("Content-Type", "application/x-www-form-urlencoded")
	req.Header.Set("User-Agent", "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36")

	loginResp, err := http.DefaultClient.Do(req)
	if err != nil {
		return "", fmt.Errorf("login request failed: %v", err)
	}
	defer loginResp.Body.Close()

	loginBody, _ := io.ReadAll(loginResp.Body)
	var loginResult loginResponse
	if err := json.Unmarshal(loginBody, &loginResult); err != nil {
		return "", fmt.Errorf("failed to parse login response")
	}

	if loginResult.RequiresTwoFactor {
		return "awaiting_guard", fmt.Errorf("Steam Guard code required")
	}

	if loginResult.EmailAuthNeeded {
		return "awaiting_guard", fmt.Errorf("Steam Guard email code required (sent to %s)", loginResult.EmailDomain)
	}

	if !loginResult.Success || !loginResult.LoginComplete {
		msg := loginResult.Message
		if msg == "" {
			msg = "Invalid username or password"
		}
		return "", fmt.Errorf("login failed: %s", msg)
	}

	return "connected", nil
}
