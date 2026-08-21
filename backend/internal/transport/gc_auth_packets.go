package transport

import (
	"bytes"
	"crypto/rand"
	"crypto/rsa"
	"crypto/sha1"
	"encoding/base64"
	"encoding/hex"
	"fmt"
	"math/big"
	"runtime"

	"github.com/Lucino772/envelop/pkg/steam"
	"github.com/Lucino772/envelop/pkg/steam/steamlang"
	"github.com/Lucino772/envelop/pkg/steam/steammsg"
	"github.com/Lucino772/envelop/pkg/steam/steampb"
	"google.golang.org/protobuf/proto"
)

func encryptSteamPassword(password string, modulusHex string, exponentHex string) (string, error) {
	modBytes, err := hex.DecodeString(modulusHex)
	if err != nil {
		return "", fmt.Errorf("invalid steam rsa modulus: %w", err)
	}
	expBytes, err := hex.DecodeString(exponentHex)
	if err != nil {
		return "", fmt.Errorf("invalid steam rsa exponent: %w", err)
	}
	exp := new(big.Int).SetBytes(expBytes)
	pub := &rsa.PublicKey{N: new(big.Int).SetBytes(modBytes), E: int(exp.Int64())}
	encrypted, err := rsa.EncryptPKCS1v15(rand.Reader, pub, []byte(password))
	if err != nil {
		return "", fmt.Errorf("failed to encrypt steam password: %w", err)
	}
	return base64.StdEncoding.EncodeToString(encrypted), nil
}

func mustClientHelloPacket() *steammsg.Packet {
	packet, err := encodeClientHelloPacket()
	if err != nil {
		panic(err)
	}
	return packet
}
func encodeClientLogonPacket(jobID steam.JobId, credentials LogonCredentials) (*steammsg.Packet, error) {
	clientSteamID := steam.NewSteamId(0, steamlang.EUniverse_Public, steamlang.EAccountType_Individual)
	header := steammsg.NewProtoHeader(steamlang.EMsg_ClientLogon)
	header.Proto.ClientSessionid = proto.Int32(0)
	header.Proto.Steamid = proto.Uint64(uint64(clientSteamID))
	header.Proto.JobidSource = proto.Uint64(uint64(jobID))
	body := &steampb.CMsgClientLogon{
		ProtocolVersion:                proto.Uint32(65580),
		CellId:                         proto.Uint32(0),
		ClientPackageVersion:           proto.Uint32(1771),
		ClientOsType:                   proto.Uint32(uint32(steamClientOSType())),
		ClientLanguage:                 proto.String("english"),
		ObfuscatedPrivateIp:            &steampb.CMsgIPAddress{Ip: &steampb.CMsgIPAddress_V4{V4: 0}},
		ClientSuppliedSteamId:          proto.Uint64(uint64(clientSteamID)),
		AccountName:                    proto.String(credentials.Username),
		ShouldRememberPassword:         proto.Bool(false),
		SteamguardDontRememberComputer: proto.Bool(true),
		MachineName:                    proto.String("cs-inv-edit"),
		MachineNameUserchosen:          proto.String("cs-inv-edit"),
		MachineId:                      steamMachineID(credentials.Username),
		LauncherType:                   proto.Uint32(0),
		UiMode:                         proto.Uint32(0),
		ChatMode:                       proto.Uint32(2),
		Steam2TicketRequest:            proto.Bool(true),
		SupportsRateLimitResponse:      proto.Bool(true),
	}
	if credentials.Password != "" {
		body.Password = proto.String(credentials.Password)
	}
	if credentials.LoginKey != "" {
		body.LoginKey = proto.String(credentials.LoginKey)
	}
	if credentials.AccessToken != "" {
		body.AccessToken = proto.String(credentials.AccessToken)
		body.ShouldRememberPassword = proto.Bool(true)
	}
	if credentials.AuthCode != "" {
		body.AuthCode = proto.String(credentials.AuthCode)
	}
	if credentials.TwoFactorCode != "" {
		body.TwoFactorCode = proto.String(credentials.TwoFactorCode)
	}
	return steammsg.EncodePacket(header, body, nil)
}

func steamClientOSType() int32 {
	if runtime.GOOS == "windows" {
		return 20 // SteamKit EOSType.Win11
	}
	return -203 // SteamKit EOSType.LinuxUnknown
}

func encodeClientHelloPacket() (*steammsg.Packet, error) {
	header := steammsg.NewProtoHeader(steamEMsgClientHello)
	header.Proto.ClientSessionid = proto.Int32(0)
	header.Proto.Steamid = proto.Uint64(0)
	body := &steampb.CMsgClientHello{
		ProtocolVersion: proto.Uint32(65580),
	}
	return steammsg.EncodePacket(header, body, nil)
}

func encodeClientHeartbeatPacket() (*steammsg.Packet, error) {
	header := steammsg.NewProtoHeader(steamlang.EMsg_ClientHeartBeat)
	return steammsg.EncodePacket(header, &steampb.CMsgClientHeartBeat{SendReply: proto.Bool(false)}, nil)
}

func steamMachineID(accountName string) []byte {
	// SteamKit sends machine_id as a binary KeyValues MessageObject, not as a
	// bare digest. Steam accepts a malformed value for basic CM/GC access, but
	// client-targeted services can use this identity when deciding whether the
	// session represents a trusted Steam client.
	var out bytes.Buffer
	writeBinaryKVObjectStart(&out, "MessageObject")
	writeBinaryKVString(&out, "BB3", machineIDDigest("guid", accountName))
	writeBinaryKVString(&out, "FF2", machineIDDigest("mac", accountName))
	writeBinaryKVString(&out, "3B3", machineIDDigest("disk", accountName))
	out.WriteByte(8) // end MessageObject
	out.WriteByte(8) // end binary KeyValues stream
	return out.Bytes()
}

func machineIDDigest(kind, accountName string) string {
	sum := sha1.Sum([]byte("cs-inv-edit:" + kind + ":" + accountName))
	return hex.EncodeToString(sum[:])
}

func writeBinaryKVObjectStart(out *bytes.Buffer, name string) {
	out.WriteByte(0)
	out.WriteString(name)
	out.WriteByte(0)
}

func writeBinaryKVString(out *bytes.Buffer, key, value string) {
	out.WriteByte(1)
	out.WriteString(key)
	out.WriteByte(0)
	out.WriteString(value)
	out.WriteByte(0)
}

func formatObservedEvents(events map[string]int) string {
	if len(events) == 0 {
		return "none"
	}
	out := ""
	for eventType, count := range events {
		if out != "" {
			out += ","
		}
		out += fmt.Sprintf("%s:%d", eventType, count)
	}
	return out
}
func steamResultName(result steamlang.EResult) string {
	switch result {
	case steamlang.EResult_OK:
		return "OK (success)"
	case steamlang.EResult_Fail:
		return "Fail (generic Steam failure)"
	case steamlang.EResult_NoConnection:
		return "NoConnection (Steam CM connection is unavailable)"
	case steamlang.EResult_InvalidPassword:
		return "InvalidPassword (incorrect account name or password)"
	case steamlang.EResult_LoggedInElsewhere:
		return "LoggedInElsewhere (account is logged in elsewhere)"
	case steamlang.EResult_InvalidParam:
		return "InvalidParam (Steam rejected a malformed request)"
	case steamlang.EResult_AccessDenied:
		return "AccessDenied (Steam denied access)"
	case steamlang.EResult_Timeout:
		return "Timeout (Steam request timed out)"
	case steamlang.EResult_AccountNotFound:
		return "AccountNotFound (Steam account was not found)"
	case steamlang.EResult_ServiceUnavailable:
		return "ServiceUnavailable (Steam service is unavailable)"
	case steamlang.EResult_NotLoggedOn:
		return "NotLoggedOn (Steam session is not logged on)"
	case steamlang.EResult_Busy:
		return "Busy (Steam service is busy)"
	case steamlang.EResult_LimitExceeded:
		return "LimitExceeded (Steam rate or request limit exceeded)"
	case steamlang.EResult_LogonSessionReplaced:
		return "LogonSessionReplaced (Steam replaced this logon session)"
	case steamlang.EResult_ConnectFailed:
		return "ConnectFailed (Steam CM connection failed)"
	case steamlang.EResult_HandshakeFailed:
		return "HandshakeFailed (Steam CM handshake failed)"
	case steamlang.EResult_IOFailure:
		return "IOFailure (Steam transport I/O failed)"
	case steamlang.EResult_RemoteDisconnect:
		return "RemoteDisconnect (Steam closed the connection)"
	case steamlang.EResult_AccountDisabled:
		return "AccountDisabled (Steam account is disabled)"
	case steamlang.EResult_TryAnotherCM:
		return "TryAnotherCM (Steam requested reconnecting to a different CM)"
	case steamlang.EResult_PasswordRequiredToKickSession:
		return "PasswordRequiredToKickSession (Steam requires password to replace another session)"
	case steamlang.EResult_AlreadyLoggedInElsewhere:
		return "AlreadyLoggedInElsewhere (account already has another active session)"
	case steamlang.EResult_Suspended:
		return "Suspended (Steam account is suspended)"
	case steamlang.EResult_Cancelled:
		return "Cancelled (Steam cancelled the request)"
	case steamlang.EResult_PasswordUnset:
		return "PasswordUnset (Steam account has no password set)"
	case steamlang.EResult_IllegalPassword:
		return "IllegalPassword (Steam rejected the password format)"
	case steamlang.EResult_AccountLogonDenied:
		return "AccountLogonDenied (Steam Guard confirmation is required)"
	case steamlang.EResult_AccountLoginDeniedNeedTwoFactor:
		return "AccountLoginDeniedNeedTwoFactor (Steam Guard mobile authenticator code is required)"
	case steamlang.EResult_InvalidLoginAuthCode:
		return "InvalidLoginAuthCode (Steam Guard email code is incorrect)"
	case steamlang.EResult_TwoFactorCodeMismatch:
		return "TwoFactorCodeMismatch (Steam Guard mobile code is incorrect)"
	case steamlang.EResult_ExpiredLoginAuthCode:
		return "ExpiredLoginAuthCode (Steam Guard code expired)"
	case steamlang.EResult_AccountLoginDeniedThrottle:
		return "AccountLoginDeniedThrottle (too many Steam login attempts; wait before retrying)"
	case steamlang.EResult_RateLimitExceeded:
		return "RateLimitExceeded (Steam rate limit exceeded)"
	case steamlang.EResult_RequirePasswordReEntry:
		return "RequirePasswordReEntry (Steam requires password re-entry)"
	case steamlang.EResult_BadResponse:
		return "BadResponse (Steam returned an invalid response)"
	case steamlang.EResult_UnexpectedError:
		return "UnexpectedError (Steam returned an unexpected error)"
	case steamlang.EResult_NeedCaptcha:
		return "NeedCaptcha (Steam requires CAPTCHA; client logon cannot continue)"
	case steamlang.EResult_AccountLockedDown:
		return "AccountLockedDown (Steam account is locked)"
	case steamlang.EResult_AccountLogonDeniedVerifiedEmailRequired:
		return "AccountLogonDeniedVerifiedEmailRequired (Steam requires email verification)"
	case steamlang.EResult_IPLoginRestrictionFailed:
		return "IPLoginRestrictionFailed (Steam rejected this IP for login)"
	case steamlang.EResult_TimeNotSynced:
		return "TimeNotSynced (Steam Guard time is not synchronized)"
	default:
		return fmt.Sprintf("Unknown Steam EResult(%d)", result)
	}
}

func steamGuardResult(result steamlang.EResult) bool {
	switch result {
	case steamlang.EResult_AccountLogonDenied,
		steamlang.EResult_AccountLoginDeniedNeedTwoFactor,
		steamlang.EResult_InvalidLoginAuthCode,
		steamlang.EResult_TwoFactorCodeMismatch,
		steamlang.EResult_ExpiredLoginAuthCode:
		return true
	default:
		return false
	}
}
