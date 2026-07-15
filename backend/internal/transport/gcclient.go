package transport

import (
	"context"
	"errors"
	"fmt"
	"net"
	"sync"
	"time"

	"github.com/Lucino772/envelop/pkg/steam/steamcm"
)

type SteamGCClient struct {
	mu          sync.Mutex
	requestMu   sync.Mutex
	conn        *steamcm.SteamConnection
	events      chan GCEvent
	state       GCConnectionState
	pendingAuth *steamAuthSession
	lastWelcome []byte
}

func NewSteamGCClient() *SteamGCClient {
	return &SteamGCClient{
		events: make(chan GCEvent, 64),
		state:  GCConnectionState{State: "disconnected"},
	}
}

func (s *SteamGCClient) Connect(ctx context.Context) error {
	s.mu.Lock()
	if s.conn != nil {
		s.mu.Unlock()
		return nil
	}
	s.state = GCConnectionState{State: "connecting"}
	s.mu.Unlock()

	diagnostics, err := diagnoseSteamCMWithRetry(3, 500*time.Millisecond)
	if err != nil {
		s.setState("error")
		return err
	}

	events := s.events
	unified := newNonAuthedUnifiedHandler()
	conn := steamcm.NewSteamConnection(
		steamcm.NewSteamBaseHandler(),
		unified,
		NewGCHandler(events),
	)
	s.mu.Lock()
	s.conn = conn
	s.mu.Unlock()

	errCh := make(chan error, 1)
	go func() {
		errCh <- connectSteamCMWithRetry(conn, diagnostics, 3, 750*time.Millisecond)
	}()

	select {
	case <-ctx.Done():
		s.setState("error")
		s.clearConn(conn)
		return fmt.Errorf("steam cm connect cancelled before transport startup: %w", ctx.Err())
	case err := <-errCh:
		if err != nil {
			s.setState("error")
			s.clearConn(conn)
			wrapped := fmt.Errorf("steam cm connect failed (%s): %w", diagnostics.String(), err)
			return DiagnosticError{err: wrapped, lines: append(diagnostics.Lines, wrapped.Error())}
		}
	case <-time.After(250 * time.Millisecond):
	}

	waitCtx, cancel := context.WithTimeout(ctx, steamCMHandshakeTimeout)
	defer cancel()
	handshakeLines := append([]string(nil), diagnostics.Lines...)
	handshakeLines = append(handshakeLines, fmt.Sprintf("steam cm encrypted handshake wait started timeout=%s", steamCMHandshakeTimeout))
	ready := make(chan error, 1)
	go func() {
		ready <- conn.WaitReady(steamCMHandshakeTimeout)
	}()
	select {
	case <-waitCtx.Done():
		s.setState("error")
		s.clearConn(conn)
		wrapped := fmt.Errorf("steam cm encrypted handshake timed out after %s (%s); TCP opened but ChannelEncryptResult was not received", steamCMHandshakeTimeout, diagnostics.String())
		return DiagnosticError{err: wrapped, lines: append(handshakeLines, wrapped.Error())}
	case err := <-ready:
		if err != nil {
			s.setState("error")
			s.clearConn(conn)
			if errors.Is(err, context.DeadlineExceeded) {
				wrapped := fmt.Errorf("steam cm encrypted handshake timed out after %s (%s); TCP opened but ChannelEncryptResult was not received", steamCMHandshakeTimeout, diagnostics.String())
				return DiagnosticError{err: wrapped, lines: append(handshakeLines, wrapped.Error())}
			}
			wrapped := fmt.Errorf("steam cm encrypted handshake failed (%s): %w", diagnostics.String(), err)
			return DiagnosticError{err: wrapped, lines: append(handshakeLines, wrapped.Error())}
		}
	}
	s.setState("connected")
	s.events <- GCEvent{Type: "gc.connected", Payload: "steam cm encrypted channel ready"}
	return nil
}
func (s *SteamGCClient) Close() error {
	s.mu.Lock()
	defer s.mu.Unlock()
	if s.conn != nil {
		_ = closeSteamConnection(s.conn)
	}
	s.conn = nil
	s.pendingAuth = nil
	s.state = GCConnectionState{State: "closed"}
	return nil
}

func (s *SteamGCClient) clearConn(conn *steamcm.SteamConnection) {
	s.mu.Lock()
	defer s.mu.Unlock()
	if s.conn == conn {
		s.conn = nil
		s.pendingAuth = nil
	}
}

func (s *SteamGCClient) closeAndClearConn(conn *steamcm.SteamConnection) {
	if conn != nil {
		_ = closeSteamConnection(conn)
	}
	s.clearConn(conn)
}

func closeSteamConnection(conn *steamcm.SteamConnection) error {
	if conn == nil {
		return nil
	}
	closeable, ok := any(conn).(interface{ Close() error })
	if !ok {
		return nil
	}
	return closeable.Close()
}

func connectSteamCM(conn *steamcm.SteamConnection, diagnostics steamCMDiagnostics) (err error) {
	defer func() {
		if recovered := recover(); recovered != nil {
			err = fmt.Errorf("steam cm connection failed inside transport library")
		}
	}()
	if diagnostics.Host == "" || diagnostics.Port == 0 {
		return fmt.Errorf("steam cm selected endpoint is missing")
	}
	return conn.Connect()
}

func connectSteamCMWithRetry(conn *steamcm.SteamConnection, diagnostics steamCMDiagnostics, attempts int, delay time.Duration) error {
	if attempts < 1 {
		attempts = 1
	}
	var lastErr error
	for attempt := 1; attempt <= attempts; attempt++ {
		if err := connectSteamCM(conn, diagnostics); err == nil {
			return nil
		} else {
			lastErr = err
		}
		if attempt < attempts {
			time.Sleep(delay)
		}
	}
	return fmt.Errorf("steam cm transport startup failed after %d attempts: %w", attempts, lastErr)
}

func diagnoseSteamCM() (steamCMDiagnostics, error) {
	lines := []string{"steam cm directory lookup started"}
	servers := steamcm.NewServers()
	if err := servers.Update(); err != nil {
		wrapped := fmt.Errorf("steam cm directory lookup failed: %w", err)
		return steamCMDiagnostics{Lines: lines}, DiagnosticError{err: wrapped, lines: append(lines, wrapped.Error())}
	}
	records := servers.Records()
	lines = append(lines, fmt.Sprintf("steam cm directory returned %d candidate records", len(records)))
	if len(records) == 0 {
		lines = append(lines, "steam cm directory returned no connectable servers; trying DNS fallback")
		addresses, err := net.LookupHost("cm0.steampowered.com")
		if err != nil {
			wrapped := fmt.Errorf("steam cm DNS fallback failed: %w", err)
			return steamCMDiagnostics{RecordCount: 0, TCPProbe: "not_run", Lines: lines}, DiagnosticError{err: wrapped, lines: append(lines, wrapped.Error())}
		}
		for _, address := range addresses {
			records = append(records, &steamcm.ServerRecord{Host: address, Port: 27017})
		}
		lines = append(lines, fmt.Sprintf("steam cm DNS fallback returned %d candidate records", len(records)))
		if len(records) == 0 {
			wrapped := fmt.Errorf("steam cm directory and DNS fallback returned no connectable servers")
			return steamCMDiagnostics{RecordCount: 0, TCPProbe: "not_run", Lines: lines}, DiagnosticError{err: wrapped, lines: append(lines, wrapped.Error())}
		}
	}

	var lastErr error
	for idx, candidate := range records {
		if candidate == nil || candidate.Host == "" || candidate.Port == 0 {
			lines = append(lines, fmt.Sprintf("steam cm candidate %d skipped: missing host or port", idx+1))
			continue
		}
		endpoint := net.JoinHostPort(candidate.Host, fmt.Sprintf("%d", candidate.Port))
		protocol := "tcp"
		lines = append(lines, fmt.Sprintf("steam cm probe started candidate=%d/%d endpoint=%s type=%s timeout=5s", idx+1, len(records), endpoint, protocol))
		probeAddr := endpoint
		probeNetwork := "tcp"
		probeTimeout := 5 * time.Second
		probe, err := net.DialTimeout(probeNetwork, probeAddr, probeTimeout)
		if err != nil {
			lastErr = err
			lines = append(lines, fmt.Sprintf("steam cm probe failed candidate=%d/%d endpoint=%s type=%s: %v", idx+1, len(records), endpoint, protocol, err))
			continue
		}
		_ = probe.Close()
		lines = append(lines, fmt.Sprintf("steam cm probe ok candidate=%d/%d endpoint=%s type=%s", idx+1, len(records), endpoint, protocol))
		lines = append(lines, fmt.Sprintf("steam cm selected endpoint %s type=%s", endpoint, protocol))
		return steamCMDiagnostics{
			RecordCount: len(records),
			Endpoint:    endpoint,
			Host:        candidate.Host,
			Port:        candidate.Port,
			TCPProbe:    "ok",
			Lines:       lines,
		}, nil
	}

	diagnostics := steamCMDiagnostics{RecordCount: len(records), TCPProbe: "failed", Lines: lines}
	wrapped := fmt.Errorf("steam cm tcp probe failed for all %d candidate records", len(records))
	if lastErr != nil {
		wrapped = fmt.Errorf("%w: last error: %v", wrapped, lastErr)
	}
	return diagnostics, DiagnosticError{err: wrapped, lines: append(lines, wrapped.Error())}
}

func diagnoseSteamCMWithRetry(attempts int, delay time.Duration) (steamCMDiagnostics, error) {
	if attempts < 1 {
		attempts = 1
	}
	var lastDiagnostics steamCMDiagnostics
	var lastErr error
	var lines []string
	for attempt := 1; attempt <= attempts; attempt++ {
		diagnostics, err := diagnoseSteamCM()
		attemptLines := diagnostics.Lines
		if attempt > 1 {
			attemptLines = append([]string{fmt.Sprintf("steam cm directory retry attempt=%d/%d", attempt, attempts)}, attemptLines...)
		}
		lines = append(lines, attemptLines...)
		lastDiagnostics = diagnostics
		if err == nil {
			diagnostics.Lines = lines
			return diagnostics, nil
		}
		lastErr = err
		if attempt < attempts {
			lines = append(lines, fmt.Sprintf("steam cm directory attempt=%d/%d failed: %v; retrying in %s", attempt, attempts, err, delay))
			time.Sleep(delay)
		}
	}
	if lastErr == nil {
		lastErr = fmt.Errorf("steam cm directory returned no connectable servers")
	}
	lastDiagnostics.Lines = lines
	return lastDiagnostics, DiagnosticError{err: lastErr, lines: append(lines, lastErr.Error())}
}

func (d steamCMDiagnostics) String() string {
	endpoint := d.Endpoint
	if endpoint == "" {
		endpoint = "none"
	}
	probe := d.TCPProbe
	if probe == "" {
		probe = "unknown"
	}
	return fmt.Sprintf("directory_records=%d selected=%s tcp_probe=%s", d.RecordCount, endpoint, probe)
}
func (s *SteamGCClient) Events() <-chan GCEvent {
	return s.events
}

func (s *SteamGCClient) State() GCConnectionState {
	s.mu.Lock()
	defer s.mu.Unlock()
	return s.state
}

func (s *SteamGCClient) setState(state string) {
	s.mu.Lock()
	s.state = GCConnectionState{State: state}
	s.mu.Unlock()
}
