package steammsg

import (
	"encoding/binary"
	"io"
	"math"

	"cs-inv-edit/backend/internal/proto/steampb"
	"cs-inv-edit/backend/internal/steam"
	"cs-inv-edit/backend/internal/steamlang"
	"google.golang.org/protobuf/proto"
)

type PacketHeader interface {
	io.ReaderFrom
	io.WriterTo

	GetMsgType() steamlang.EMsg
	GetTargetJobId() uint64
	GetSourceJobId() uint64

	GetSteamId() *steam.SteamId
	GetSessionId() *int32
	SetSteamId(*steam.SteamId)
	SetSessionId(*int32)
}

type StdHeader struct {
	MsgType     steamlang.EMsg
	TargetJobId uint64
	SourceJobId uint64
}

func NewStdHeader(emsg steamlang.EMsg) *StdHeader {
	return &StdHeader{
		MsgType:     emsg,
		TargetJobId: math.MaxUint64,
		SourceJobId: math.MaxUint64,
	}
}

func (h *StdHeader) GetMsgType() steamlang.EMsg {
	return h.MsgType
}

func (h *StdHeader) GetTargetJobId() uint64 {
	return h.TargetJobId
}

func (h *StdHeader) GetSourceJobId() uint64 {
	return h.SourceJobId
}

func (h *StdHeader) GetSteamId() *steam.SteamId {
	return nil
}

func (h *StdHeader) GetSessionId() *int32 {
	return nil
}

func (h *StdHeader) SetSteamId(id *steam.SteamId) {}

func (h *StdHeader) SetSessionId(id *int32) {}

func (h *StdHeader) ReadFrom(r io.Reader) (int64, error) {
	if err := binary.Read(r, binary.LittleEndian, h); err != nil {
		return -1, err
	}
	h.MsgType = GetMsg(uint32(h.MsgType))
	return int64(binary.Size(h)), nil
}

func (h *StdHeader) WriteTo(w io.Writer) (int64, error) {
	if err := binary.Write(w, binary.LittleEndian, h); err != nil {
		return -1, err
	}
	return int64(binary.Size(h)), nil
}

type ExtHeader struct {
	HeaderSize    byte
	HeaderVersion uint16
	MsgType       steamlang.EMsg
	TargetJobId   uint64
	SourceJobId   uint64
	HeaderCanary  byte
	SteamId       uint64
	SessionId     int32
}

func NewExtHeader(emsg steamlang.EMsg) *ExtHeader {
	return &ExtHeader{
		MsgType:     emsg,
		TargetJobId: math.MaxUint64,
		SourceJobId: math.MaxUint64,
	}
}

func (h *ExtHeader) GetMsgType() steamlang.EMsg {
	return h.MsgType
}

func (h *ExtHeader) GetTargetJobId() uint64 {
	return h.TargetJobId
}

func (h *ExtHeader) GetSourceJobId() uint64 {
	return h.SourceJobId
}

func (h *ExtHeader) GetSteamId() *steam.SteamId {
	return (*steam.SteamId)(&h.SteamId)
}

func (h *ExtHeader) GetSessionId() *int32 {
	return &h.SessionId
}

func (h *ExtHeader) SetSteamId(id *steam.SteamId) {
	h.SteamId = uint64(*id)
}
func (h *ExtHeader) SetSessionId(id *int32) {
	h.SessionId = int32(*id)
}

func (h *ExtHeader) ReadFrom(r io.Reader) (int64, error) {
	if err := binary.Read(r, binary.LittleEndian, h); err != nil {
		return -1, err
	}
	h.MsgType = GetMsg(uint32(h.MsgType))
	return int64(binary.Size(h)), nil
}

func (h *ExtHeader) WriteTo(w io.Writer) (int64, error) {
	if err := binary.Write(w, binary.LittleEndian, h); err != nil {
		return -1, err
	}
	return int64(binary.Size(h)), nil
}

type ProtoHeader struct {
	MsgType   steamlang.EMsg
	HeaderLen int32
	Proto     *steampb.CMsgProtoBufHeader
}

func NewProtoHeader(emsg steamlang.EMsg) *ProtoHeader {
	return &ProtoHeader{
		MsgType: emsg,
		Proto:   new(steampb.CMsgProtoBufHeader),
	}
}

func (h *ProtoHeader) GetMsgType() steamlang.EMsg {
	return h.MsgType
}

func (h *ProtoHeader) GetTargetJobId() uint64 {
	return h.Proto.GetJobidTarget()
}

func (h *ProtoHeader) GetSourceJobId() uint64 {
	return h.Proto.GetJobidSource()
}

func (h *ProtoHeader) GetSteamId() *steam.SteamId {
	return (*steam.SteamId)(h.Proto.Steamid)
}

func (h *ProtoHeader) GetSessionId() *int32 {
	return h.Proto.ClientSessionid
}

func (h *ProtoHeader) SetSteamId(id *steam.SteamId) {
	h.Proto.Steamid = (*uint64)(id)
}
func (h *ProtoHeader) SetSessionId(id *int32) {
	h.Proto.ClientSessionid = id
}

func (h *ProtoHeader) ReadFrom(r io.Reader) (int64, error) {
	var nbytes int64 = 0
	if err := binary.Read(r, binary.LittleEndian, &h.MsgType); err != nil {
		return nbytes, err
	}
	h.MsgType = GetMsg(uint32(h.MsgType))
	nbytes += int64(binary.Size(h.MsgType))
	if err := binary.Read(r, binary.LittleEndian, &h.HeaderLen); err != nil {
		return nbytes, err
	}
	nbytes += int64(binary.Size(h.HeaderLen))
	headerBytes := make([]byte, h.HeaderLen)
	if _, err := io.ReadFull(r, headerBytes); err != nil {
		return nbytes, err
	}
	nbytes += int64(len(headerBytes))

	h.Proto = new(steampb.CMsgProtoBufHeader)
	if err := proto.Unmarshal(headerBytes, h.Proto); err != nil {
		return nbytes, err
	}
	return nbytes, nil
}

func (h *ProtoHeader) WriteTo(w io.Writer) (int64, error) {
	var nbytes int64 = 0
	if err := binary.Write(w, binary.LittleEndian, MakeMsg(h.MsgType, true)); err != nil {
		return nbytes, err
	}
	nbytes += int64(binary.Size(h.MsgType))

	if h.Proto == nil {
		h.Proto = new(steampb.CMsgProtoBufHeader)
	}
	headerBytes, err := proto.Marshal(h.Proto)
	if err != nil {
		return nbytes, err
	}
	headerLen := int32(len(headerBytes))

	if err := binary.Write(w, binary.LittleEndian, headerLen); err != nil {
		return nbytes, err
	}
	nbytes += int64(binary.Size(headerLen))

	if _, err := w.Write(headerBytes); err != nil {
		return nbytes, err
	}
	nbytes += int64(headerLen)
	return nbytes, nil
}
