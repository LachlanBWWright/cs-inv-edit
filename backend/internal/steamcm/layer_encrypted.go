package steamcm

import (
	"bytes"
	"crypto/rand"
	"encoding/binary"
	"errors"
	"hash/crc32"

	"cs-inv-edit/backend/internal/steam"
	"cs-inv-edit/backend/internal/steamlang"
	"cs-inv-edit/backend/internal/steammsg"
)

const (
	state_Disconnected int = 0
	state_Connected    int = 1
	state_Challenged   int = 2
	state_Encrypted    int = 3
)

type encryptedLayer struct {
	Universe steamlang.EUniverse

	state     int
	encrypter Encrypter
}

func NewEncryptedLayer(universe steamlang.EUniverse) *encryptedLayer {
	return &encryptedLayer{
		Universe:  universe,
		state:     state_Disconnected,
		encrypter: nil,
	}
}

func (layer *encryptedLayer) ProcessIncoming(events []Event) ([]Event, error) {
	processedEvents := make([]Event, 0)
	for _, event := range events {
		if event.Type != EventType_Incoming {
			processedEvents = append(processedEvents, event)
			continue
		}

		switch payload := event.Payload.(type) {
		case EventDataReceived:
			_events, err := layer.handleIncomingData(payload.Data)
			if err != nil {
				return nil, err
			}
			processedEvents = append(processedEvents, _events...)
		default:
			processedEvents = append(processedEvents, event)
		}
	}
	return processedEvents, nil
}
func (layer *encryptedLayer) ProcessOutgoing(events []Event) ([]Event, error) {
	processedEvents := make([]Event, 0)
	for _, event := range events {
		if event.Type != EventType_Outgoing {
			processedEvents = append(processedEvents, event)
			continue
		}

		switch payload := event.Payload.(type) {
		case EventDataToSend:
			if layer.state == state_Encrypted {
				encrypted, err := layer.encrypter.Encrypt(payload.Data)
				if err != nil {
					return nil, err
				}
				processedEvents = append(
					processedEvents,
					event.WithPayload(EventDataToSend{Data: encrypted}),
				)
			} else {
				processedEvents = append(processedEvents, event)
			}
		default:
			processedEvents = append(processedEvents, event)
		}
	}
	return processedEvents, nil
}

func (layer *encryptedLayer) handleIncomingData(data []byte) ([]Event, error) {
	if layer.state == state_Encrypted {
		decrypted, err := layer.encrypter.Decrypt(data)
		if err != nil {
			return nil, err
		}
		return []Event{
			MakeEvent(EventType_Incoming, EventDataReceived{Data: decrypted}),
		}, nil
	}

	packet, err := steammsg.ParsePacket(data)
	if err != nil {
		return nil, err
	}

	switch packet.MsgType() {
	case steamlang.EMsg_ChannelEncryptRequest:
		return layer.handleEncryptRequest(packet)
	case steamlang.EMsg_ChannelEncryptResult:
		return layer.handleEncryptResult(packet)
	default:
		return nil, nil
	}
}

func (layer *encryptedLayer) handleEncryptRequest(packet *steammsg.Packet) ([]Event, error) {
	body := new(steammsg.MsgChannelEncryptRequest)
	randomChallenge, err := steammsg.DecodePacket(packet, body)
	if err != nil {
		return nil, err
	}

	if body.ProtoVersion != 1 {
		return nil, errors.New("version mismatch")
	}
	if body.Universe != layer.Universe {
		return nil, errors.New("unexpected universe")
	}

	pubKey := steam.GetUniversePublicKey(body.Universe)
	if pubKey == nil {
		return nil, errors.New("invalid universe")
	}

	var dataToEncrypt bytes.Buffer
	tempSessionKey := make([]byte, 32)
	if _, err := rand.Read(tempSessionKey); err != nil {
		return nil, err
	}
	if _, err := dataToEncrypt.Write(tempSessionKey); err != nil {
		return nil, err
	}
	if len(randomChallenge) > 0 {
		if _, err := dataToEncrypt.Write(randomChallenge); err != nil {
			return nil, err
		}
		layer.encrypter = NewEncrypter(tempSessionKey, tempSessionKey[:16])
	} else {
		layer.encrypter = NewEncrypter(tempSessionKey, nil)
	}

	encryptedData, err := steam.EncryptOAEPSha1(pubKey, dataToEncrypt.Bytes())
	if err != nil {
		return nil, err
	}
	keyCrc := crc32.ChecksumIEEE(encryptedData)

	responsePacket, err := layer.buildEncryptResponse(body.ProtoVersion, encryptedData, keyCrc)
	if err != nil {
		return nil, err
	}
	layer.state = state_Challenged
	return []Event{
		MakeEvent(EventType_Outgoing, EventDataToSend{Data: responsePacket.Bytes()}),
	}, nil
}

func (layer *encryptedLayer) buildEncryptResponse(version uint32, challengeData []byte, crc uint32) (*steammsg.Packet, error) {
	header := steammsg.NewStdHeader(steamlang.EMsg_ChannelEncryptResponse)
	body := &steammsg.MsgChannelEncryptResponse{
		ProtoVersion: version,
		KeySize:      128,
	}
	var payload bytes.Buffer
	if _, err := payload.Write(challengeData); err != nil {
		return nil, err
	}
	if err := binary.Write(&payload, binary.LittleEndian, crc); err != nil {
		return nil, err
	}
	if err := binary.Write(&payload, binary.LittleEndian, uint32(0)); err != nil {
		return nil, err
	}
	return steammsg.EncodePacket(header, body, payload.Bytes())
}

func (layer *encryptedLayer) handleEncryptResult(packet *steammsg.Packet) ([]Event, error) {
	body := new(steammsg.MsgChannelEncryptResult)
	if _, err := steammsg.DecodePacket(packet, body); err != nil {
		return nil, err
	}

	// FIXME: What should we do if result is not ok, disconnect ?
	if body.Result == steamlang.EResult_OK {
		layer.state = state_Encrypted
		return []Event{MakeEvent(EventType_State, EventChannelEncrypted{})}, nil
	}
	return nil, nil
}
