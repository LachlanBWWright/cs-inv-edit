//go:build js && wasm

package steamcm

// The browser owns DNS resolution for these hosts when it opens the WSS
// connection. Do not call net.LookupHost from WASM; browsers cannot expose a
// usable DNS resolver to Go's net package.
func preferStaticFallback() bool { return true }

func fallbackServers() ([]*ServerRecord, error) {
	return []*ServerRecord{
		{Host: "cmp1-sea1.steamserver.net", Port: 443, WebSocket: true},
		{Host: "cmp1-ord1.steamserver.net", Port: 443, WebSocket: true},
		{Host: "cmp1-dfw2.steamserver.net", Port: 443, WebSocket: true},
		{Host: "cmp2-atl3.steamserver.net", Port: 443, WebSocket: true},
	}, nil
}
