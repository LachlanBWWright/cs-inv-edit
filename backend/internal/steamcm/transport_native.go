//go:build !js

package steamcm

import (
	"fmt"
	"net"
)

func configureTransport(_ *SteamConnection) {}

func pickServer(servers *Servers) *ServerRecord {
	return servers.PickServer()
}

func connectTransport(server *ServerRecord) (interface {
	Read([]byte) (int, error)
	Write([]byte) (int, error)
	Close() error
}, error) {
	return net.Dial("tcp", fmt.Sprintf("%s:%d", server.Host, server.Port))
}
