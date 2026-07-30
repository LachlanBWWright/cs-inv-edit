package transport

import (
	"encoding/hex"
	"encoding/json"
	"fmt"
	"io"
	"strings"
	"time"
	"unicode/utf8"

	"cs-inv-edit/backend/internal/proto/gametracking"
	"cs-inv-edit/backend/internal/proto/tf2tracking"
	"github.com/Lucino772/envelop/pkg/steam/steamlang"
	"github.com/Lucino772/envelop/pkg/steam/steammsg"
	"github.com/Lucino772/envelop/pkg/steam/steampb"
	"google.golang.org/protobuf/encoding/protojson"
	"google.golang.org/protobuf/encoding/protowire"
	"google.golang.org/protobuf/proto"
	"google.golang.org/protobuf/reflect/protoreflect"
	"google.golang.org/protobuf/reflect/protoregistry"
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

type rawSteamPacketBody struct{ data []byte }

func (b *rawSteamPacketBody) ReadFrom(r io.Reader) (int64, error) {
	data, err := io.ReadAll(r)
	b.data = append([]byte(nil), data...)
	return int64(len(data)), err
}

func extractPacketBodyBytes(packet *steammsg.Packet) []byte {
	var body rawSteamPacketBody
	if _, err := steammsg.DecodePacket(packet, &body); err == nil {
		return body.data
	}
	return nil
}

func (s *SteamGCClient) recordIncomingProtocol(packet *steammsg.Packet) {
	if packet == nil {
		return
	}
	if !packet.IsProto() {
		if packet.MsgType() != steamlang.EMsg_ClientMicroTxnAuthRequest {
			return
		}
		raw := extractPacketBodyBytes(packet)
		entry := ProtocolTraceEntry{
			Direction: "received",
			Layer:     "steam-cm",
			EMsg:      uint32(packet.MsgType()),
			Name:      packet.MsgType().String(),
			Protobuf:  false,
			BodyBytes: len(raw),
			BodyHex:   hex.EncodeToString(raw),
		}
		decoded, err := parseMicroTxnAuthorization(raw)
		if err != nil {
			entry.DecodeError = err.Error()
		} else {
			entry.Decoded = decoded
		}
		s.appendProtocol(entry)
		return
	}
	entry := ProtocolTraceEntry{Direction: "received", Layer: "steam-cm", EMsg: uint32(packet.MsgType()), Name: packet.MsgType().String(), Protobuf: true}
	bodyMsg, supported := decodeSteamCMPacketBody(packet)
	if supported {
		if _, err := steammsg.DecodePacket(packet, bodyMsg); err != nil {
			entry.DecodeError = err.Error()
		} else if raw, err := proto.Marshal(bodyMsg); err != nil {
			entry.DecodeError = err.Error()
		} else if decoded, err := (protojson.MarshalOptions{UseProtoNames: true}).Marshal(bodyMsg); err != nil {
			entry.DecodeError = err.Error()
		} else {
			entry.BodyBytes = len(raw)
			entry.BodyHex = hex.EncodeToString(raw)
			if err := json.Unmarshal(decoded, &entry.Decoded); err != nil {
				entry.DecodeError = err.Error()
			}
		}
	} else if protoHeader, ok := packet.Header().(*steammsg.ProtoHeader); ok && protoHeader.Proto != nil {
		headerMap := map[string]any{}
		if protoHeader.Proto.Steamid != nil {
			headerMap["steamid"] = protoHeader.Proto.GetSteamid()
		}
		if protoHeader.Proto.ClientSessionid != nil {
			headerMap["client_sessionid"] = protoHeader.Proto.GetClientSessionid()
		}
		if protoHeader.Proto.TargetJobName != nil {
			headerMap["target_job_name"] = protoHeader.Proto.GetTargetJobName()
		}
		if protoHeader.Proto.Eresult != nil {
			headerMap["eresult"] = protoHeader.Proto.GetEresult()
		}
		if len(headerMap) > 0 {
			entry.Decoded = headerMap
		}
	} else if bodyBytes := extractPacketBodyBytes(packet); len(bodyBytes) > 0 {
		if rawDecoded, ok := decodeRawProtoWireFormat(bodyBytes); ok && rawDecoded != nil && len(rawDecoded) > 0 {
			entry.Decoded = rawDecoded
			entry.DecodeError = ""
			entry.BodyBytes = len(bodyBytes)
			entry.BodyHex = hex.EncodeToString(bodyBytes)
		}
	} else {
		entry.DecodeError = "no generated Steam CM body mapping is registered for this EMsg; raw body access is unavailable without draining the dependency packet"
	}
	s.appendProtocol(entry)
}

func decodeSteamCMPacketBody(packet *steammsg.Packet) (proto.Message, bool) {
	if packet == nil {
		return nil, false
	}

	// Direct type mapping for guaranteed 100% resolution of valid steampb message types
	switch packet.MsgType() {
	case steamlang.EMsg_ClientFromGC, steamlang.EMsg_ClientToGC:
		return new(steampb.CMsgGCClient), true
	case steamlang.EMsg_ClientServersAvailable:
		return new(steampb.CMsgClientServersAvailable), true
	case steamlang.EMsg_ClientLogOnResponse:
		return new(steampb.CMsgClientLogonResponse), true
	case steamlang.EMsg_ClientAccountInfo:
		return new(steampb.CMsgClientAccountInfo), true
	case steamlang.EMsg_ClientEmailAddrInfo:
		return new(steampb.CMsgClientEmailAddrInfo), true
	case steamlang.EMsg_ClientFriendsList:
		return new(steampb.CMsgClientFriendsList), true
	case steamlang.EMsg_ClientPlayerNicknameList:
		return new(steampb.CMsgClientPlayerNicknameList), true
	case steamlang.EMsg_ClientLicenseList:
		return new(steampb.CMsgClientLicenseList), true
	case steamlang.EMsg_ClientWalletInfoUpdate:
		return new(steampb.CMsgClientWalletInfoUpdate), true
	case steamlang.EMsg_ClientGameConnectTokens:
		return new(steampb.CMsgClientGameConnectTokens), true
	case steamlang.EMsg_ClientFriendsGroupsList:
		return new(steampb.CMsgClientFriendsGroupsList), true
	case steamlang.EMsg_ClientIsLimitedAccount:
		return new(steampb.CMsgClientIsLimitedAccount), true
	case steamlang.EMsg_ClientClanState:
		return new(steampb.CMsgClientClanState), true
	case steamlang.EMsg_ClientLoggedOff:
		return new(steampb.CMsgClientLoggedOff), true
	case steamlang.EMsg_ClientGamesPlayed:
		return new(steampb.CMsgClientGamesPlayed), true
	case steamlang.EMsg_ClientHeartBeat:
		return new(steampb.CMsgClientHeartBeat), true
	}

	// Dynamic protoregistry fallback for any unmapped EMsg types
	msgName := packet.MsgType().String()
	raw := strings.TrimPrefix(msgName, "EMsg_")
	raw = strings.TrimPrefix(raw, "k_EMsg")

	candidates := []string{
		"CMsg" + raw,
		"CMsg" + strings.ReplaceAll(raw, "LogOn", "Logon"),
		"CMsgClient" + raw,
		"CMsgClient" + strings.ReplaceAll(raw, "LogOn", "Logon"),
		"CMsgGC" + strings.TrimPrefix(raw, "Client"),
	}
	prefixes := []string{"steam.", "steampb.", ""}

	for _, prefix := range prefixes {
		for _, candidate := range candidates {
			fullName := protoreflect.FullName(prefix + candidate)
			if messageType, err := protoregistry.GlobalTypes.FindMessageByName(fullName); err == nil {
				return messageType.New().Interface(), true
			}
		}
	}
	return nil, false
}

func (s *SteamGCClient) recordGCProtocol(direction string, appID, emsg uint32, body []byte) {
	s.recordTF2State(direction, appID, emsg, body)
	s.recordCS2State(direction, appID, emsg, body)
	name := protocolMessageName(appID, emsg)
	entry := ProtocolTraceEntry{Direction: direction, Layer: "game-coordinator", AppID: appID, EMsg: emsg, Name: name, Protobuf: true, BodyBytes: len(body), BodyHex: hex.EncodeToString(body)}

	if appID == 440 && name != "GC protobuf message" {
		if decodedJSON, err := tf2tracking.DecodeMessageJSON(name, body); err == nil {
			if unmarshErr := json.Unmarshal(decodedJSON, &entry.Decoded); unmarshErr == nil {
				s.appendProtocol(entry)
				return
			}
		}
	}

	// Primary GameTracking descriptor decoding for CS2 (730)
	if appID == 730 && name != "GC protobuf message" {
		if decodedJSON, err := gametracking.DecodeMessageJSON(name, body); err == nil {
			if unmarshErr := json.Unmarshal(decodedJSON, &entry.Decoded); unmarshErr == nil {
				s.appendProtocol(entry)
				return
			}
		}
	}

	// GlobalTypes only contains the transport dependency's generated Steam
	// messages. GameTracking trees are intentionally isolated descriptor
	// registries and are decoded before this fallback.
	if msgInst := findGCProtoMessageInstance(name, emsg); msgInst != nil {
		if unmarshErr := proto.Unmarshal(body, msgInst); unmarshErr == nil {
			if jsonBytes, jsonErr := (protojson.MarshalOptions{UseProtoNames: true}).Marshal(msgInst); jsonErr == nil {
				if unmarshErr := json.Unmarshal(jsonBytes, &entry.Decoded); unmarshErr == nil {
					entry.DecodeError = ""
					s.appendProtocol(entry)
					return
				}
			}
		}
	}

	// Secondary GameTracking fallback for non-CS2 games
	if name != "GC protobuf message" {
		if decodedJSON, err := gametracking.DecodeMessageJSON(name, body); err == nil {
			if unmarshErr := json.Unmarshal(decodedJSON, &entry.Decoded); unmarshErr == nil {
				entry.DecodeError = ""
				s.appendProtocol(entry)
				return
			}
		}
	}

	// Universal binary wire-format parser fallback
	if rawDecoded, ok := decodeRawProtoWireFormat(body); ok && rawDecoded != nil && len(rawDecoded) > 0 {
		entry.Decoded = rawDecoded
		entry.DecodeError = ""
		s.appendProtocol(entry)
		return
	}

	if name == "GC protobuf message" {
		entry.DecodeError = "the GameTracking descriptor set has no message mapping for this EMsg"
	}
	s.appendProtocol(entry)
}

func findGCProtoMessageInstance(name string, emsg uint32) proto.Message {
	candidates := []string{name}
	if name == "GC protobuf message" {
		candidates = append(candidates, fmt.Sprintf("CMsg%d", emsg), fmt.Sprintf("CMsgGC%d", emsg))
	}
	prefixes := []string{"steampb.", "steam.", ""}
	for _, prefix := range prefixes {
		for _, cand := range candidates {
			if msgType, err := protoregistry.GlobalTypes.FindMessageByName(protoreflect.FullName(prefix + cand)); err == nil {
				return msgType.New().Interface()
			}
		}
	}
	return nil
}

func decodeRawProtoWireFormat(b []byte) (map[string]any, bool) {
	if len(b) == 0 {
		return map[string]any{}, true
	}
	result := make(map[string]any)
	buf := b
	for len(buf) > 0 {
		num, wtype, n := protowire.ConsumeTag(buf)
		if n < 0 {
			return nil, false
		}
		buf = buf[n:]
		fieldName := fmt.Sprintf("field_%d", num)

		switch wtype {
		case protowire.VarintType:
			v, n := protowire.ConsumeVarint(buf)
			if n < 0 {
				return nil, false
			}
			buf = buf[n:]
			appendRawField(result, fieldName, v)

		case protowire.Fixed32Type:
			v, n := protowire.ConsumeFixed32(buf)
			if n < 0 {
				return nil, false
			}
			buf = buf[n:]
			appendRawField(result, fieldName, v)

		case protowire.Fixed64Type:
			v, n := protowire.ConsumeFixed64(buf)
			if n < 0 {
				return nil, false
			}
			buf = buf[n:]
			appendRawField(result, fieldName, v)

		case protowire.BytesType:
			v, n := protowire.ConsumeBytes(buf)
			if n < 0 {
				return nil, false
			}
			buf = buf[n:]
			if utf8.Valid(v) && len(v) > 0 {
				appendRawField(result, fieldName, string(v))
			} else if subMap, ok := decodeRawProtoWireFormat(v); ok && len(subMap) > 0 {
				appendRawField(result, fieldName, subMap)
			} else {
				appendRawField(result, fieldName, hex.EncodeToString(v))
			}

		default:
			return nil, false
		}
	}
	return result, true
}

func appendRawField(m map[string]any, key string, val any) {
	if existing, ok := m[key]; ok {
		if list, isList := existing.([]any); isList {
			m[key] = append(list, val)
		} else {
			m[key] = []any{existing, val}
		}
	} else {
		m[key] = val
	}
}

func protocolMessageName(appID, emsg uint32) string {
	if appID == 440 {
		if name, ok := tf2tracking.MessageNameForEMsg(emsg); ok {
			return name
		}
	}
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
