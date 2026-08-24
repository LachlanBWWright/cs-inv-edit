package steamcm

import (
	"errors"
	"fmt"
	"log"
	"net"
	"net/http"
	"net/url"
	"slices"
	"strconv"
	"strings"

	"cs-inv-edit/backend/internal/steamapi"
)

type ServerRecord struct {
	Host      string
	Port      uint16
	Load      uint32
	WebSocket bool
}

type Servers struct {
	records []*ServerRecord
}

func NewServers() *Servers {
	return &Servers{records: make([]*ServerRecord, 0)}
}

func (s *Servers) Records() []*ServerRecord {
	return s.records
}

func (s *Servers) Update() error {
	if preferStaticFallback() {
		if fallback, err := fallbackServers(); err == nil && len(fallback) > 0 {
			s.records = fallback
			return nil
		}
	}
	if err := s.fetchFromWebApi(0, 20); err == nil && len(s.records) > 0 {
		return nil
	}
	if fallback, err := fallbackServers(); err == nil {
		s.records = fallback
		return nil
	}
	if err := s.fetchFromDns(); err != nil {
		log.Println(err)
		return err
	}
	return nil
}

func (s *Servers) PickServer() *ServerRecord {
	if len(s.records) == 0 {
		return nil
	}
	return s.records[0]
}

func (s *Servers) fetchFromWebApi(cellId int, maxCnt int) error {
	client := steamapi.NewClient()
	type serverResponse struct {
		Response struct {
			ServerList []struct {
				Endpoint       string  `json:"endpoint,omitempty"`
				LegacyEndpoint string  `json:"legacy_endpoint,omitempty"`
				Type           string  `json:"type,omitempty"`
				DataCenter     string  `json:"dc,omitempty"`
				Realm          string  `json:"realm,omitempty"`
				Load           uint32  `json:"load,omitempty"`
				WeightedLoad   float32 `json:"wtd_load,omitempty"`
			} `json:"serverlist,omitempty"`
			Success bool   `json:"success,omitempty"`
			Message string `json:"message,omitempty"`
		} `json:"response,omitempty"`
	}

	var params = make(url.Values)
	params.Add("cellid", fmt.Sprint(cellId))
	params.Add("maxcount", fmt.Sprint(maxCnt))

	request, err := http.NewRequest(
		"GET",
		client.Url("ISteamDirectory", "GetCMListForConnect", 1, params).String(),
		nil,
	)
	if err != nil {
		return err
	}

	var serverResp serverResponse
	if err := client.DoJson(request, &serverResp); err != nil {
		return err
	}

	if !serverResp.Response.Success {
		return errors.New("invalid response type")
	}

	records := make([]*ServerRecord, 0)
	for _, value := range serverResp.Response.ServerList {
		if value.Type == "netfilter" || value.Type == "websocket" {
			record, err := s.parseIpEndpoint(value.Endpoint)
			if err != nil {
				return err
			}
			record.Load = value.Load
			record.WebSocket = value.Type == "websocket"
			records = append(records, record)
		}
	}
	s.records = records
	slices.SortFunc(s.records, func(a *ServerRecord, b *ServerRecord) int {
		return int(a.Load) - int(b.Load)
	})
	return nil
}

func (s *Servers) fetchFromDns() error {
	ips, err := net.LookupHost("cm0.steampowered.com")
	if err != nil {
		return err
	}

	records := make([]*ServerRecord, 0)
	for _, ip := range ips {
		s.records = append(s.records, &ServerRecord{
			Host: ip,
			Port: 27017,
			Load: 0,
		})
	}
	s.records = records
	return nil
}

func (s *Servers) parseIpEndpoint(addr string) (*ServerRecord, error) {
	i := strings.LastIndex(addr, ":")
	if i == -1 {
		return nil, errors.New("invalid ip endpoint format")
	}

	host := addr[:i]
	port, err := strconv.Atoi(addr[i+1:])
	if err != nil {
		return nil, err
	}
	return &ServerRecord{
		Host: host,
		Port: uint16(port),
	}, nil
}
