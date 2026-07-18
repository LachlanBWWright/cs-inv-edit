package transport

import (
	"encoding/hex"
	"encoding/json"
	"time"

	"cs-inv-edit/backend/internal/proto/gametracking"
	"github.com/Lucino772/envelop/pkg/steam/steammsg"
	"github.com/Lucino772/envelop/pkg/steam/steampb"
	"google.golang.org/protobuf/encoding/protojson"
	"google.golang.org/protobuf/proto"
)

const protocolTraceLimit = 2000

func (s *SteamGCClient) SetProtocolTracing(enabled bool) {
	s.protocolMu.Lock()
	defer s.protocolMu.Unlock()
	s.protocolEnabled = enabled
	if !enabled {
		s.protocolTrace = nil
	}
}

func (s *SteamGCClient) ProtocolTrace(after uint64) []ProtocolTraceEntry {
	s.protocolMu.Lock()
	defer s.protocolMu.Unlock()
	out := make([]ProtocolTraceEntry, 0)
	for _, entry := range s.protocolTrace {
		if entry.ID > after {
			out = append(out, entry)
		}
	}
	return out
}

func (s *SteamGCClient) appendProtocol(entry ProtocolTraceEntry) {
	s.protocolMu.Lock()
	defer s.protocolMu.Unlock()
	if !s.protocolEnabled {
		return
	}
	s.protocolNextID++
	entry.ID = s.protocolNextID
	entry.Timestamp = time.Now().UTC().Format(time.RFC3339Nano)
	s.protocolTrace = append(s.protocolTrace, entry)
	if len(s.protocolTrace) > protocolTraceLimit {
		s.protocolTrace = append([]ProtocolTraceEntry(nil), s.protocolTrace[len(s.protocolTrace)-protocolTraceLimit:]...)
	}
}

func (s *SteamGCClient) recordIncomingProtocol(packet *steammsg.Packet) {
	if packet == nil || !packet.IsProto() {
		return
	}
	entry := ProtocolTraceEntry{Direction: "received", Layer: "steam-cm", EMsg: uint32(packet.MsgType()), Name: packet.MsgType().String(), Protobuf: true}
	if packet.MsgType() == 5453 {
		body := new(steampb.CMsgGCClient)
		if _, err := steammsg.DecodePacket(packet, body); err != nil {
			entry.DecodeError = err.Error()
		} else if raw, err := proto.Marshal(body); err != nil {
			entry.DecodeError = err.Error()
		} else if decoded, err := (protojson.MarshalOptions{UseProtoNames: true}).Marshal(body); err != nil {
			entry.DecodeError = err.Error()
		} else {
			entry.BodyBytes = len(raw)
			entry.BodyHex = hex.EncodeToString(raw)
			if err := json.Unmarshal(decoded, &entry.Decoded); err != nil {
				entry.DecodeError = err.Error()
			}
		}
	} else {
		entry.DecodeError = "no generated Steam CM body mapping is registered for this EMsg; raw body access is unavailable without draining the dependency packet"
	}
	s.appendProtocol(entry)
}

func (s *SteamGCClient) recordGCProtocol(direction string, appID, emsg uint32, body []byte) {
	name := protocolMessageName(appID, emsg)
	entry := ProtocolTraceEntry{Direction: direction, Layer: "game-coordinator", AppID: appID, EMsg: emsg, Name: name, Protobuf: true, BodyBytes: len(body), BodyHex: hex.EncodeToString(body)}
	if name == "GC protobuf message" {
		entry.DecodeError = "the GameTracking descriptor set has no message mapping for this EMsg"
	} else if decoded, err := gametracking.DecodeMessageJSON(name, body); err != nil {
		entry.DecodeError = err.Error()
	} else if err := json.Unmarshal(decoded, &entry.Decoded); err != nil {
		entry.DecodeError = err.Error()
	}
	s.appendProtocol(entry)
}

func protocolMessageName(appID, emsg uint32) string {
	if appID == 730 {
		switch emsg {
		case emsgStorePurchaseInit:
			return "CMsgGCStorePurchaseInit"
		case emsgStorePurchaseInitResponse:
			return "CMsgGCStorePurchaseInitResponse"
		case 9173:
			// k_EMsgGCCStrike15_v2_GC2ClientGlobalStats carries the shared
			// GlobalStatistics payload; its message name is not derivable from
			// the enum identifier.
			return "GlobalStatistics"
		}
	}
	if name, ok := gametracking.MessageNameForEMsg(emsg); ok {
		return name
	}
	return "GC protobuf message"
}

func (m *TestGCClient) SetProtocolTracing(bool)                   {}
func (m *TestGCClient) ProtocolTrace(uint64) []ProtocolTraceEntry { return []ProtocolTraceEntry{} }
