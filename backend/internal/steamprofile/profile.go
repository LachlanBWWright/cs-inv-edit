package steamprofile

import (
	"context"
	"encoding/xml"
	"fmt"
	"net/http"
	"net/url"
	"strings"
	"sync"
	"time"
)

const communityBaseURL = "https://steamcommunity.com"

type Resolver struct {
	client  *http.Client
	baseURL string
	mu      sync.Mutex
	cache   map[string]cacheEntry
}

type Profile struct {
	SteamID    string
	Name       string
	AvatarURL  string
	ProfileURL string
}

type cacheEntry struct {
	profile   Profile
	expiresAt time.Time
}

func NewResolver() *Resolver {
	return &Resolver{
		client:  &http.Client{Timeout: 8 * time.Second},
		baseURL: communityBaseURL,
		cache:   make(map[string]cacheEntry),
	}
}

type profileXML struct {
	SteamID    string `xml:"steamID"`
	AvatarFull string `xml:"avatarFull"`
}

func (r *Resolver) AvatarURL(ctx context.Context, steamID string) (string, error) {
	profile, err := r.Profile(ctx, steamID)
	if err != nil {
		return "", err
	}
	return profile.AvatarURL, nil
}

func (r *Resolver) Profile(ctx context.Context, steamID string) (Profile, error) {
	steamID = strings.TrimSpace(steamID)
	if steamID == "" {
		return Profile{}, fmt.Errorf("SteamID is required")
	}
	r.mu.Lock()
	if cached, ok := r.cache[steamID]; ok && time.Now().Before(cached.expiresAt) {
		r.mu.Unlock()
		return cached.profile, nil
	}
	r.mu.Unlock()
	endpoint := strings.TrimRight(r.baseURL, "/") + "/profiles/" + url.PathEscape(steamID) + "/?xml=1"
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, endpoint, nil)
	if err != nil {
		return Profile{}, fmt.Errorf("build Steam profile request: %w", err)
	}
	resp, err := r.client.Do(req)
	if err != nil {
		return Profile{}, fmt.Errorf("load Steam profile: %w", err)
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		return Profile{}, fmt.Errorf("load Steam profile: HTTP %d", resp.StatusCode)
	}
	var profile profileXML
	if err := xml.NewDecoder(resp.Body).Decode(&profile); err != nil {
		return Profile{}, fmt.Errorf("decode Steam profile: %w", err)
	}
	avatarURL := strings.TrimSpace(profile.AvatarFull)
	if avatarURL == "" {
		return Profile{}, fmt.Errorf("Steam profile did not include an avatar")
	}
	parsed, err := url.Parse(avatarURL)
	if err != nil || parsed.Scheme != "https" || parsed.Host == "" {
		return Profile{}, fmt.Errorf("Steam profile returned an invalid avatar URL")
	}
	resolved := Profile{SteamID: steamID, Name: strings.TrimSpace(profile.SteamID), AvatarURL: avatarURL, ProfileURL: strings.TrimRight(r.baseURL, "/") + "/profiles/" + url.PathEscape(steamID) + "/"}
	r.mu.Lock()
	if r.cache == nil {
		r.cache = make(map[string]cacheEntry)
	}
	r.cache[steamID] = cacheEntry{profile: resolved, expiresAt: time.Now().Add(10 * time.Minute)}
	r.mu.Unlock()
	return resolved, nil
}
