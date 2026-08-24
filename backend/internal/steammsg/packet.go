package steammsg

import (
	"bytes"
	"encoding/binary"
	"errors"
	"io"

	"cs-inv-edit/backend/internal/steamlang"
	"google.golang.org/protobuf/proto"
)

type Packet struct {
	header PacketHeader
	buf    *bytes.Buffer
}

func ParsePacket(data []byte) (*Packet, error) {
	if len(data) < 4 {
		return nil, errors.New("not enough data")
	}
	emsg := steamlang.EMsg(binary.LittleEndian.Uint32(data[:4]))

	var pkt Packet
	switch emsg {
	case steamlang.EMsg_ChannelEncryptRequest,
		steamlang.EMsg_ChannelEncryptResponse,
		steamlang.EMsg_ChannelEncryptResult:
		pkt.header = new(StdHeader)
	default:
		if IsProtobuf(uint32(emsg)) {
			pkt.header = new(ProtoHeader)
		} else {
			pkt.header = new(ExtHeader)
		}
	}

	buf := bytes.NewBuffer(data)
	if _, err := pkt.header.ReadFrom(buf); err != nil {
		return nil, err
	}
	pkt.buf = buf
	return &pkt, nil
}

func (p *Packet) MsgType() steamlang.EMsg {
	return p.header.GetMsgType()
}

func (p *Packet) Header() PacketHeader {
	return p.header
}

func (p *Packet) IsProto() bool {
	if _, ok := p.header.(*ProtoHeader); ok {
		return true
	}
	return false
}

func (p *Packet) Bytes() []byte {
	var buf bytes.Buffer
	if _, err := p.header.WriteTo(&buf); err != nil {
		return nil
	}
	if _, err := p.buf.WriteTo(&buf); err != nil {
		return nil
	}
	return buf.Bytes()
}

func DecodePacket(packet *Packet, body any) ([]byte, error) {
	switch _body := body.(type) {
	case proto.Message:
		if !packet.IsProto() {
			return nil, errors.New("got non-protobuf packet, expected protobuf")
		}
		return nil, proto.Unmarshal(packet.buf.Bytes(), _body)
	case io.ReaderFrom:
		if packet.IsProto() {
			return nil, errors.New("got protobuf packet, expected non-protobuf")
		}
		tempBuf := bytes.NewBuffer(packet.buf.Bytes())
		_, err := _body.ReadFrom(tempBuf)
		if err != nil {
			return nil, err
		}
		return io.ReadAll(tempBuf)
	default:
		return nil, errors.New("incomptabile packet body")
	}
}

func EncodePacket(header PacketHeader, body any, payload []byte) (*Packet, error) {
	if body == nil {
		return nil, errors.New("missing packet body")
	}
	var pkt Packet
	pkt.header = header
	switch _body := body.(type) {
	case proto.Message:
		data, err := proto.Marshal(_body)
		if err != nil {
			return nil, err
		}
		pkt.buf = bytes.NewBuffer(data)
	case io.WriterTo:
		pkt.buf = bytes.NewBuffer([]byte{})
		if _, err := _body.WriteTo(pkt.buf); err != nil {
			return nil, err
		}
		if payload != nil {
			if _, err := pkt.buf.Write(payload); err != nil {
				return nil, err
			}
		}
	default:
		return nil, errors.New("incomptabile packet body")
	}
	return &pkt, nil
}
