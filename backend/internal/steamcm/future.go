package steamcm

import (
	"context"
	"errors"
	"sync"
	"time"

	"cs-inv-edit/backend/internal/steam"
)

func waitForJob[T any](conn Connection, jobId steam.JobId, timeout time.Duration) (T, error) {
	fut := NewFuture[T]()
	conn.RegisterJob(jobId, func(payload any) {
		if value, ok := payload.(T); ok {
			fut.SetResult(value)
		} else {
			fut.SetError(errors.New("invalid payload"))
		}
	})
	return fut.Wait(timeout)
}

type future[T any] struct {
	result     T
	err        error
	resultChan chan struct{}
	mu         sync.Mutex
	resolved   bool
}

func NewFuture[T any]() *future[T] {
	return &future[T]{
		err:        nil,
		resultChan: make(chan struct{}),
		resolved:   false,
	}
}

func (fut *future[T]) SetResult(result T) {
	fut.mu.Lock()
	defer fut.mu.Unlock()
	if !fut.resolved {
		fut.resolved = true
		fut.result = result
		close(fut.resultChan)
	}
}

func (fut *future[T]) SetError(err error) {
	fut.mu.Lock()
	defer fut.mu.Unlock()
	if !fut.resolved {
		fut.resolved = true
		fut.err = err
		close(fut.resultChan)
	}
}

func (fut *future[T]) Wait(timeout time.Duration) (T, error) {
	select {
	case <-fut.resultChan:
		return fut.result, fut.err
	case <-time.After(timeout):
		return fut.result, context.DeadlineExceeded
	}
}
