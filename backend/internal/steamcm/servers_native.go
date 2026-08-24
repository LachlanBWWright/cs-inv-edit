//go:build !js

package steamcm

import "errors"

func preferStaticFallback() bool { return false }

func fallbackServers() ([]*ServerRecord, error) {
	return nil, errors.New("no static Steam CM fallback is configured for native transport")
}
