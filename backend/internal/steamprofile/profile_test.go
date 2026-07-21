package steamprofile

import (
	"context"
	"net/http"
	"net/http/httptest"
	"testing"
)

func TestAvatarURLReadsSteamCommunityProfile(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/profiles/76561198000000000/" || r.URL.Query().Get("xml") != "1" {
			t.Fatalf("unexpected request: %s", r.URL.String())
		}
		w.Header().Set("Content-Type", "text/xml")
		_, _ = w.Write([]byte(`<profile><steamID><![CDATA[Example User]]></steamID><avatarFull><![CDATA[https://avatars.steamstatic.com/example_full.jpg]]></avatarFull></profile>`))
	}))
	defer server.Close()

	resolver := &Resolver{client: server.Client(), baseURL: server.URL}
	avatarURL, err := resolver.AvatarURL(context.Background(), "76561198000000000")
	if err != nil {
		t.Fatalf("AvatarURL() error = %v", err)
	}
	if avatarURL != "https://avatars.steamstatic.com/example_full.jpg" {
		t.Fatalf("AvatarURL() = %q", avatarURL)
	}
}

func TestProfileReturnsIdentityAndCachesIt(t *testing.T) {
	calls := 0
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		calls++
		_, _ = w.Write([]byte(`<profile><steamID><![CDATA[Example User]]></steamID><avatarFull><![CDATA[https://avatars.steamstatic.com/example_full.jpg]]></avatarFull></profile>`))
	}))
	defer server.Close()
	resolver := &Resolver{client: server.Client(), baseURL: server.URL, cache: make(map[string]cacheEntry)}
	for range 2 {
		profile, err := resolver.Profile(context.Background(), "76561198000000000")
		if err != nil {
			t.Fatal(err)
		}
		if profile.Name != "Example User" || profile.ProfileURL != server.URL+"/profiles/76561198000000000/" {
			t.Fatalf("profile = %#v", profile)
		}
	}
	if calls != 1 {
		t.Fatalf("calls = %d, want 1", calls)
	}
}

func TestAvatarURLRejectsMissingAvatar(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		_, _ = w.Write([]byte(`<profile><steamID>Example</steamID></profile>`))
	}))
	defer server.Close()

	resolver := &Resolver{client: server.Client(), baseURL: server.URL}
	if _, err := resolver.AvatarURL(context.Background(), "76561198000000000"); err == nil {
		t.Fatal("AvatarURL() error = nil, want missing-avatar error")
	}
}
