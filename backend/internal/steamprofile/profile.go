package steamprofile

import (
	"context"
	"encoding/xml"
	"fmt"
	"net/http"
	"net/url"
	"strings"
	"time"
)

const communityBaseURL = "https://steamcommunity.com"

type Resolver struct {
	client  *http.Client
	baseURL string
}

func NewResolver() *Resolver {
	return &Resolver{
		client:  &http.Client{Timeout: 8 * time.Second},
		baseURL: communityBaseURL,
	}
}

type profileXML struct {
	AvatarFull string `xml:"avatarFull"`
}

func (r *Resolver) AvatarURL(ctx context.Context, steamID string) (string, error) {
	endpoint := strings.TrimRight(r.baseURL, "/") + "/profiles/" + url.PathEscape(steamID) + "/?xml=1"
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, endpoint, nil)
	if err != nil {
		return "", fmt.Errorf("build Steam profile request: %w", err)
	}
	resp, err := r.client.Do(req)
	if err != nil {
		return "", fmt.Errorf("load Steam profile: %w", err)
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		return "", fmt.Errorf("load Steam profile: HTTP %d", resp.StatusCode)
	}
	var profile profileXML
	if err := xml.NewDecoder(resp.Body).Decode(&profile); err != nil {
		return "", fmt.Errorf("decode Steam profile: %w", err)
	}
	avatarURL := strings.TrimSpace(profile.AvatarFull)
	if avatarURL == "" {
		return "", fmt.Errorf("Steam profile did not include an avatar")
	}
	parsed, err := url.Parse(avatarURL)
	if err != nil || parsed.Scheme != "https" || parsed.Host == "" {
		return "", fmt.Errorf("Steam profile returned an invalid avatar URL")
	}
	return avatarURL, nil
}
