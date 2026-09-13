package app

import (
	"context"
	"time"

	"cs-inv-edit/backend/internal/domain"
)

func (s *Service) refreshExpiredQR(epoch uint64) {
	s.mu.Lock()
	if s.authEpoch != epoch {
		s.mu.Unlock()
		return
	}
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Minute)
	s.authCancel = cancel
	client := s.gcClient
	s.connection = domain.ConnectionStatus{
		State:  "connecting",
		Detail: "The QR sign-in expired. Creating a fresh QR code…",
	}
	s.mu.Unlock()

	if err := client.Close(); err != nil {
		cancel()
		s.setQRAuthError(epoch, "Steam QR session refresh", err)
		return
	}
	if err := client.Connect(ctx); err != nil {
		cancel()
		s.setQRAuthError(epoch, "Steam QR session refresh", err)
		return
	}
	session, err := client.BeginQRAuth(ctx)
	if err != nil {
		cancel()
		s.setQRAuthError(epoch, "Steam QR session refresh", err)
		return
	}

	s.mu.Lock()
	if s.authEpoch != epoch {
		s.mu.Unlock()
		cancel()
		return
	}
	s.connection = domain.ConnectionStatus{
		State:          "awaiting_qr",
		Detail:         "Scan this QR code with the Steam mobile app",
		QRChallengeURL: session.ChallengeURL,
	}
	s.mu.Unlock()
	go s.completeQRLogin(client, ctx, session, epoch)
}
