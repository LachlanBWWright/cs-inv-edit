package dataservice

import (
	"bufio"
	"encoding/json"
	"errors"
	"os"
	"path/filepath"
	"sort"
	"strings"
	"sync"
	"time"

	"cs-inv-edit/backend/pricescanner"
)

type HistoryFilter struct {
	MarketName string
	AppID      int
	Currency   string
	Source     string
	From       *time.Time
	To         *time.Time
	Limit      int
}

type ObservationStore interface {
	Record(appID int, result pricescanner.Result) error
	History(HistoryFilter) ([]pricescanner.Quote, error)
}

type storedObservation struct {
	AppID          int                `json:"appId"`
	BaselineSource string             `json:"baselineSource"`
	Quote          pricescanner.Quote `json:"quote"`
}

type JSONLObservationStore struct {
	mu   sync.Mutex
	path string
}

func NewJSONLObservationStore(path string) (*JSONLObservationStore, error) {
	path = strings.TrimSpace(path)
	if path == "" {
		return nil, errors.New("price history path is empty")
	}
	if err := os.MkdirAll(filepath.Dir(path), 0o755); err != nil {
		return nil, err
	}
	return &JSONLObservationStore{path: path}, nil
}

func (s *JSONLObservationStore) Record(appID int, result pricescanner.Result) error {
	s.mu.Lock()
	defer s.mu.Unlock()
	file, err := os.OpenFile(s.path, os.O_CREATE|os.O_APPEND|os.O_WRONLY, 0o644)
	if err != nil {
		return err
	}
	defer file.Close()
	encoder := json.NewEncoder(file)
	for _, quote := range result.Listings {
		if err := encoder.Encode(storedObservation{AppID: appID, BaselineSource: result.BaselineSource, Quote: quote}); err != nil {
			return err
		}
	}
	return nil
}

func (s *JSONLObservationStore) History(filter HistoryFilter) ([]pricescanner.Quote, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	file, err := os.Open(s.path)
	if errors.Is(err, os.ErrNotExist) {
		return []pricescanner.Quote{}, nil
	}
	if err != nil {
		return nil, err
	}
	defer file.Close()
	filter.Currency = strings.ToUpper(strings.TrimSpace(filter.Currency))
	filter.Source = strings.ToLower(strings.TrimSpace(filter.Source))
	observations := make([]pricescanner.Quote, 0)
	scanner := bufio.NewScanner(file)
	scanner.Buffer(make([]byte, 64<<10), 2<<20)
	for scanner.Scan() {
		var stored storedObservation
		if err := json.Unmarshal(scanner.Bytes(), &stored); err != nil {
			continue
		}
		if stored.AppID != filter.AppID || stored.Quote.MarketName != filter.MarketName || stored.Quote.Currency != filter.Currency {
			continue
		}
		if filter.Source != "" && strings.ToLower(stored.Quote.Source) != filter.Source {
			continue
		}
		observedAt, parseErr := time.Parse(time.RFC3339, stored.Quote.ObservedAt)
		if parseErr != nil || (filter.From != nil && observedAt.Before(*filter.From)) || (filter.To != nil && observedAt.After(*filter.To)) {
			continue
		}
		observations = append(observations, stored.Quote)
	}
	if err := scanner.Err(); err != nil {
		return nil, err
	}
	sort.SliceStable(observations, func(i, j int) bool { return observations[i].ObservedAt < observations[j].ObservedAt })
	if filter.Limit > 0 && len(observations) > filter.Limit {
		observations = observations[len(observations)-filter.Limit:]
	}
	return observations, nil
}
