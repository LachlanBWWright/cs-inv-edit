package transport

import (
	"bytes"
	"context"
	"crypto/sha1" // Steam's Cloud protocol requires SHA-1 as a content identifier.
	"encoding/hex"
	"fmt"
	"io"
	"math"
	"net"
	"net/http"
	"net/url"
	"strings"
	"time"

	"github.com/Lucino772/envelop/pkg/steam/steamlang"
	"github.com/Lucino772/envelop/pkg/steam/steammsg"
	"github.com/Lucino772/envelop/pkg/steam/steampb"
	"google.golang.org/protobuf/proto"
)

const (
	tf2AppID                 uint32 = 440
	maxSteamCloudErrorBody          = 4096
	steamCloudRequestTimeout        = 45 * time.Second
)

type steamCloudUGC struct {
	ID       uint64
	Filename string
	SHA1     string
	Size     uint32
}

func newSteamCloudHTTPClient() *http.Client {
	dialer := &net.Dialer{Timeout: 10 * time.Second, KeepAlive: 30 * time.Second}
	return &http.Client{
		Timeout: steamCloudRequestTimeout,
		Transport: &http.Transport{
			Proxy:                 http.ProxyFromEnvironment,
			DialContext:           dialer.DialContext,
			TLSHandshakeTimeout:   10 * time.Second,
			ResponseHeaderTimeout: 20 * time.Second,
			ExpectContinueTimeout: time.Second,
		},
		CheckRedirect: func(_ *http.Request, _ []*http.Request) error {
			return http.ErrUseLastResponse
		},
	}
}

func (s *SteamGCClient) cloudUnifiedCall(ctx context.Context, method string, input proto.Message, output proto.Message) error {
	if err := s.ensureSteamSession(ctx); err != nil {
		return fmt.Errorf("Steam session recovery failed: %w", err)
	}
	s.mu.Lock()
	conn := s.conn
	s.mu.Unlock()
	if conn == nil {
		return ErrNotConnected
	}
	response, err := newNonAuthedUnifiedHandler().SendAuthedMessageForApp(ctx, conn, tf2AppID, method, input)
	if err != nil {
		return fmt.Errorf("%s request failed: %w", method, err)
	}
	if response.Result != steamlang.EResult_OK {
		return steamResultError{method: method, result: response.Result}
	}
	if _, err := steammsg.DecodePacket(response.Packet, output); err != nil {
		return fmt.Errorf("decode %s response: %w", method, err)
	}
	return nil
}

func (s *SteamGCClient) uploadTF2DecalUGC(ctx context.Context, png []byte, filename string) (steamCloudUGC, error) {
	digest := sha1.Sum(png)
	sha := hex.EncodeToString(digest[:])
	begin := &steampb.CCloud_BeginUGCUpload_Response{}
	request := &steampb.CCloud_BeginUGCUpload_Request{
		Appid:       proto.Uint32(tf2AppID),
		FileSize:    proto.Uint32(uint32(len(png))),
		Filename:    proto.String(filename),
		FileSha:     proto.String(sha),
		ContentType: proto.String("image/png"),
	}
	if err := s.cloudUnifiedCall(ctx, "Cloud.BeginUGCUpload#1", request, begin); err != nil {
		return steamCloudUGC{}, err
	}
	ugcID := begin.GetUgcid()
	if ugcID == 0 || ugcID == math.MaxUint64 {
		return steamCloudUGC{}, fmt.Errorf("Cloud.BeginUGCUpload returned invalid UGC ID %d", ugcID)
	}

	putErr := s.putSteamCloudUGC(ctx, begin, png)
	commit := &steampb.CCloud_CommitUGCUpload_Response{}
	commitErr := s.cloudUnifiedCall(ctx, "Cloud.CommitUGCUpload#1", &steampb.CCloud_CommitUGCUpload_Request{
		TransferSucceeded: proto.Bool(putErr == nil),
		Appid:             proto.Uint32(tf2AppID),
		Ugcid:             proto.Uint64(ugcID),
	}, commit)
	if putErr != nil {
		if commitErr != nil {
			return steamCloudUGC{}, fmt.Errorf("Steam Cloud PUT failed: %w; failure commit also failed: %v", putErr, commitErr)
		}
		return steamCloudUGC{}, fmt.Errorf("Steam Cloud PUT failed: %w", putErr)
	}
	if commitErr != nil {
		return steamCloudUGC{}, commitErr
	}
	if !commit.GetFileCommitted() {
		return steamCloudUGC{}, fmt.Errorf("Cloud.CommitUGCUpload did not commit UGC %d", ugcID)
	}
	result := steamCloudUGC{ID: ugcID, Filename: filename, SHA1: sha, Size: uint32(len(png))}
	if err := s.verifySteamCloudUGC(ctx, result); err != nil {
		return steamCloudUGC{}, err
	}
	return result, nil
}

func (s *SteamGCClient) putSteamCloudUGC(ctx context.Context, begin *steampb.CCloud_BeginUGCUpload_Response, data []byte) error {
	if !begin.GetUseHttps() {
		return fmt.Errorf("Cloud.BeginUGCUpload returned a non-HTTPS endpoint")
	}
	uploadURL, err := validatedSteamUploadURL(begin.GetUrlHost(), begin.GetUrlPath())
	if err != nil {
		return err
	}
	request, err := http.NewRequestWithContext(ctx, http.MethodPut, uploadURL, bytes.NewReader(data))
	if err != nil {
		return fmt.Errorf("construct Steam Cloud PUT: %w", err)
	}
	request.ContentLength = int64(len(data))
	for _, header := range begin.GetRequestHeaders() {
		name, value := header.GetName(), header.GetValue()
		if name == "" || strings.ContainsAny(name+value, "\r\n") {
			return fmt.Errorf("Cloud.BeginUGCUpload returned an invalid request header")
		}
		request.Header.Add(name, value)
	}
	response, err := s.httpClient.Do(request)
	if err != nil {
		return err
	}
	defer response.Body.Close()
	if response.StatusCode < http.StatusOK || response.StatusCode >= http.StatusMultipleChoices {
		body, readErr := io.ReadAll(io.LimitReader(response.Body, maxSteamCloudErrorBody))
		if readErr != nil {
			return fmt.Errorf("Steam Cloud PUT returned HTTP %d and its diagnostic body could not be read: %w", response.StatusCode, readErr)
		}
		return fmt.Errorf("Steam Cloud PUT returned HTTP %d: %s", response.StatusCode, strings.TrimSpace(string(body)))
	}
	return nil
}

func validatedSteamUploadURL(host, returnedPath string) (string, error) {
	if host == "" || returnedPath == "" || !strings.HasPrefix(returnedPath, "/") || strings.ContainsAny(host+returnedPath, "\r\n") {
		return "", fmt.Errorf("Cloud.BeginUGCUpload returned an invalid upload endpoint")
	}
	if strings.Contains(host, "@") {
		return "", fmt.Errorf("Cloud.BeginUGCUpload returned upload userinfo")
	}
	parsed, err := url.Parse("https://" + host + returnedPath)
	if err != nil || parsed.Scheme != "https" || parsed.Hostname() == "" || parsed.User != nil || parsed.Port() != "" || parsed.Fragment != "" {
		return "", fmt.Errorf("Cloud.BeginUGCUpload returned an invalid HTTPS endpoint")
	}
	if parsed.Host != host || parsed.RequestURI() != returnedPath {
		return "", fmt.Errorf("Cloud.BeginUGCUpload endpoint did not round-trip without normalization")
	}
	return parsed.String(), nil
}

func (s *SteamGCClient) verifySteamCloudUGC(ctx context.Context, uploaded steamCloudUGC) error {
	response := &steampb.CCloud_GetFileDetails_Response{}
	if err := s.cloudUnifiedCall(ctx, "Cloud.GetFileDetails#1", &steampb.CCloud_GetFileDetails_Request{
		Ugcid: proto.Uint64(uploaded.ID),
		Appid: proto.Uint32(tf2AppID),
	}, response); err != nil {
		return err
	}
	details := response.GetDetails()
	if details == nil {
		return fmt.Errorf("Cloud.GetFileDetails omitted details for UGC %d", uploaded.ID)
	}
	if details.GetAppid() != tf2AppID || details.GetUgcid() != uploaded.ID || details.GetFileSize() != uploaded.Size || details.GetFilename() != uploaded.Filename {
		return fmt.Errorf("Cloud.GetFileDetails did not match uploaded UGC %d", uploaded.ID)
	}
	if details.GetFileSha() != "" && !strings.EqualFold(details.GetFileSha(), uploaded.SHA1) {
		return fmt.Errorf("Cloud.GetFileDetails SHA-1 did not match uploaded UGC %d", uploaded.ID)
	}
	s.mu.Lock()
	steamID := s.activeSteamID
	s.mu.Unlock()
	if details.GetSteamidCreator() != 0 && details.GetSteamidCreator() != steamID {
		return fmt.Errorf("Cloud.GetFileDetails creator did not match the active Steam account")
	}
	return nil
}
