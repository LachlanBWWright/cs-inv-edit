package steammsg

import (
	"encoding/binary"
	"io"

	"cs-inv-edit/backend/internal/steamlang"
)

type MsgChannelEncryptRequest struct {
	ProtoVersion uint32
	Universe     steamlang.EUniverse
}

func (m *MsgChannelEncryptRequest) ReadFrom(r io.Reader) (int64, error) {
	if err := binary.Read(r, binary.LittleEndian, m); err != nil {
		return -1, err
	}
	return int64(binary.Size(m)), nil
}

func (m *MsgChannelEncryptRequest) WriteTo(w io.Writer) (int64, error) {
	if err := binary.Write(w, binary.LittleEndian, m); err != nil {
		return -1, err
	}
	return int64(binary.Size(m)), nil
}

type MsgChannelEncryptResponse struct {
	ProtoVersion uint32
	KeySize      uint32
}

func (m *MsgChannelEncryptResponse) ReadFrom(r io.Reader) (int64, error) {
	if err := binary.Read(r, binary.LittleEndian, m); err != nil {
		return -1, err
	}
	return int64(binary.Size(m)), nil
}

func (m *MsgChannelEncryptResponse) WriteTo(w io.Writer) (int64, error) {
	if err := binary.Write(w, binary.LittleEndian, m); err != nil {
		return -1, err
	}
	return int64(binary.Size(m)), nil
}

type MsgChannelEncryptResult struct {
	Result steamlang.EResult
}

func (m *MsgChannelEncryptResult) ReadFrom(r io.Reader) (int64, error) {
	if err := binary.Read(r, binary.LittleEndian, m); err != nil {
		return -1, err
	}
	return int64(binary.Size(m)), nil
}

func (m *MsgChannelEncryptResult) WriteTo(w io.Writer) (int64, error) {
	if err := binary.Write(w, binary.LittleEndian, m); err != nil {
		return -1, err
	}
	return int64(binary.Size(m)), nil
}
