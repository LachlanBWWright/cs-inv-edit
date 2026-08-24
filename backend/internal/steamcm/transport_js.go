//go:build js && wasm

package steamcm

import (
	"errors"
	"fmt"
	"io"
	"strconv"
	"sync"
	"syscall/js"
	"time"
)

type browserWebSocket struct {
	socket  js.Value
	readCh  chan []byte
	closeCh chan struct{}
	onData  js.Func
	onOpen  js.Func
	onError js.Func
	onClose js.Func
	openCh  chan struct{}
	openMu  sync.Mutex
	openErr error
	openOnce sync.Once
	readMu  sync.Mutex
	readBuf []byte
	closed  bool
}

func (transport *browserWebSocket) signalOpen(err error) {
	transport.openOnce.Do(func() {
		transport.openMu.Lock()
		transport.openErr = err
		transport.openMu.Unlock()
		close(transport.openCh)
	})
}

func (transport *browserWebSocket) waitOpen() error {
	select {
	case <-transport.openCh:
		transport.openMu.Lock()
		err := transport.openErr
		transport.openMu.Unlock()
		return err
	case <-time.After(10 * time.Second):
		return errors.New("timed out opening Steam CM WebSocket")
	}
}

func configureTransport(conn *SteamConnection) {
	conn.wireLayer.SetWebSocket(true)
	conn.securityLayer.SetWebSocket(true)
	close(conn.readyChan)
}

func pickServer(servers *Servers) *ServerRecord {
	for _, server := range servers.Records() {
		if server.WebSocket {
			return server
		}
	}
	return servers.PickServer()
}

func connectTransport(server *ServerRecord) (interface {
	Read([]byte) (int, error)
	Write([]byte) (int, error)
	Close() error
}, error) {
	if server.Port == 0 {
		return nil, errors.New("Steam CM WebSocket endpoint has no port")
	}
	ports := []uint16{server.Port}
	if server.Port != 443 {
		ports = append(ports, 443)
	}
	var lastErr error
	for _, port := range ports {
		transport, err := connectTransportAtPort(server.Host, port)
		if err == nil {
			return transport, nil
		}
		lastErr = err
	}
	return nil, fmt.Errorf("Steam CM WebSocket connection failed for %s: %w", server.Host, lastErr)
}

func connectTransportAtPort(host string, port uint16) (interface {
	Read([]byte) (int, error)
	Write([]byte) (int, error)
	Close() error
}, error) {
	url := "wss://" + host + ":" + strconv.Itoa(int(port)) + "/cmsocket/"
	socket := js.Global().Get("WebSocket").New(url)
	socket.Set("binaryType", "arraybuffer")
	transport := &browserWebSocket{
		socket:  socket,
		readCh:  make(chan []byte, 16),
		closeCh: make(chan struct{}),
		openCh:  make(chan struct{}),
	}
	transport.onOpen = js.FuncOf(func(js.Value, []js.Value) any {
		transport.signalOpen(nil)
		return nil
	})
	transport.onError = js.FuncOf(func(js.Value, []js.Value) any {
		transport.signalOpen(errors.New("steam CM WebSocket connection failed"))
		transport.close()
		return nil
	})
	transport.onData = js.FuncOf(func(_ js.Value, args []js.Value) any {
		if len(args) == 0 {
			return nil
		}
		array := js.Global().Get("Uint8Array").New(args[0].Get("data"))
		data := make([]byte, array.Get("length").Int())
		js.CopyBytesToGo(data, array)
		select {
		case transport.readCh <- data:
		case <-transport.closeCh:
		}
		return nil
	})
	transport.onClose = js.FuncOf(func(js.Value, []js.Value) any {
		transport.signalOpen(errors.New("steam CM WebSocket closed before opening"))
		transport.close()
		return nil
	})
	socket.Call("addEventListener", "message", transport.onData)
	socket.Call("addEventListener", "open", transport.onOpen)
	socket.Call("addEventListener", "error", transport.onError)
	socket.Call("addEventListener", "close", transport.onClose)
	return transport, nil
}

func (transport *browserWebSocket) Read(target []byte) (int, error) {
	transport.readMu.Lock()
	defer transport.readMu.Unlock()
	for len(transport.readBuf) == 0 {
		select {
		case data := <-transport.readCh:
			transport.readBuf = data
		case <-transport.closeCh:
			return 0, io.EOF
		}
	}
	n := copy(target, transport.readBuf)
	transport.readBuf = transport.readBuf[n:]
	return n, nil
}

func (transport *browserWebSocket) Write(data []byte) (int, error) {
	if err := transport.waitOpen(); err != nil {
		return 0, err
	}
	if transport.socket.IsUndefined() || transport.socket.Get("readyState").Int() != 1 {
		return 0, errors.New("steam websocket is not open")
	}
	array := js.Global().Get("Uint8Array").New(len(data))
	js.CopyBytesToJS(array, data)
	transport.socket.Call("send", array)
	return len(data), nil
}

func (transport *browserWebSocket) Close() error {
	transport.close()
	return nil
}

func (transport *browserWebSocket) close() {
	if transport.closed {
		return
	}
	transport.closed = true
	close(transport.closeCh)
	transport.socket.Call("close")
	transport.onData.Release()
	transport.onOpen.Release()
	transport.onError.Release()
	transport.onClose.Release()
}
