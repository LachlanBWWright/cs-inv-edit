package steammsg

import (
	"encoding/binary"
	"io"
)

type MsgClientServerUnavailable struct {
	JobIdSent   uint64
	EMsgSent    uint32
	EServerType uint32
}

func (m *MsgClientServerUnavailable) ReadFrom(r io.Reader) (int64, error) {
	if err := binary.Read(r, binary.LittleEndian, m); err != nil {
		return -1, err
	}
	return int64(binary.Size(m)), nil
}

func (m *MsgClientServerUnavailable) WriteTo(w io.Writer) (int64, error) {
	if err := binary.Write(w, binary.LittleEndian, m); err != nil {
		return -1, err
	}
	return int64(binary.Size(m)), nil
}
