package steam

import (
	"fmt"
	"regexp"
	"strconv"

	"cs-inv-edit/backend/internal/steamlang"
)

type SteamId uint64

const (
	Instance_All     uint32 = 0
	Instance_Desktop uint32 = 1
	Instance_Console uint32 = 2
	Instance_Web     uint32 = 4

	accountIdMask       uint32 = 0xFFFFFFFF
	accountInstanceMask uint32 = 0x000FFFFF

	chatInstanceFlag_Clan     uint32 = (accountInstanceMask + 1) >> 1
	chatInstanceFlag_Lobby    uint32 = (accountInstanceMask + 1) >> 2
	chatInstanceFlag_MMSLobby uint32 = (accountInstanceMask + 1) >> 3
)

var (
	steam2Regex         = regexp.MustCompile(`STEAM_(?P<universe>[0-4]):(?P<authserver>[0-1]):(?P<accountid>[0-9]+)`)
	steam3Regex         = regexp.MustCompile(`\[(?P<type>[AGMPCgcLTIUai]):(?P<universe>[0-4]):(?P<account>[0-9]+)(:(?P<instance>[0-9]+))?\]`)
	steam3FallbackRegex = regexp.MustCompile(`\[(?P<type>[AGMPCgcLTIUai]):(?P<universe>[0-4]):(?P<account>[0-9]+)(\((?P<instance>[0-9]+)\))?\]`)
)

var (
	accountTypeChars = map[steamlang.EAccountType]rune{
		steamlang.EAccountType_AnonGameServer: 'A',
		steamlang.EAccountType_GameServer:     'G',
		steamlang.EAccountType_Multiseat:      'M',
		steamlang.EAccountType_Pending:        'P',
		steamlang.EAccountType_ContentServer:  'C',
		steamlang.EAccountType_Clan:           'g',
		steamlang.EAccountType_Chat:           'T', // Lobby chat is 'L', Clan chat is 'c'
		steamlang.EAccountType_Invalid:        'I',
		steamlang.EAccountType_Individual:     'U',
		steamlang.EAccountType_AnonUser:       'a',
	}
	unknownAccountTypeChar = 'i'
)

func NewSteamId(accountId uint32, universe steamlang.EUniverse, accountType steamlang.EAccountType) SteamId {
	var id SteamId
	id.SetAccountId(accountId)
	id.SetAccountUniverse(universe)
	id.SetAccountType(accountType)
	if accountType == steamlang.EAccountType_Clan || accountType == steamlang.EAccountType_GameServer {
		id.SetAccountInstance(0)
	} else {
		id.SetAccountInstance(Instance_Desktop)
	}
	return id
}

func NewInstanceSteamId(accountId uint32, instance uint32, universe steamlang.EUniverse, accountType steamlang.EAccountType) SteamId {
	var id SteamId = NewSteamId(accountId, universe, accountType)
	id.SetAccountInstance(instance)
	return id
}

func (i *SteamId) SetFromSteam2String(s string, u steamlang.EUniverse) bool {
	matches := steam2Regex.FindStringSubmatch(s)
	if matches == nil {
		return false
	}
	groups := processRegexGroups(steam2Regex, matches)

	accountId, err := strconv.ParseUint(groups["accountid"], 10, 32)
	if err != nil {
		return false
	}
	authServer, err := strconv.ParseUint(groups["authserver"], 10, 32)
	if err != nil {
		return false
	}
	i.SetAccountUniverse(u)
	i.SetAccountInstance(Instance_Desktop)
	i.SetAccountType(steamlang.EAccountType_Individual)
	i.SetAccountId(uint32((accountId << 1) | authServer))
	return true
}

func (i *SteamId) SetFromSteam3String(s string, u steamlang.EUniverse) bool {
	var groups map[string]string

	matches := steam3Regex.FindStringSubmatch(s)
	if matches == nil {
		matches = steam3FallbackRegex.FindStringSubmatch(s)
		if matches == nil {
			return false
		}
		groups = processRegexGroups(steam3FallbackRegex, matches)
	} else {
		groups = processRegexGroups(steam3Regex, matches)
	}

	accountId, err := strconv.ParseUint(groups["account"], 10, 32)
	if err != nil {
		return false
	}
	universe, err := strconv.ParseUint(groups["universe"], 10, 32)
	if err != nil {
		return false
	}
	typeString := groups["type"]
	if len(typeString) != 1 {
		return false
	}
	typeVal := typeString[0]

	var instance uint64
	instanceString, ok := groups["instance"]
	if ok || instanceString != "" {
		instance, err = strconv.ParseUint(instanceString, 10, 32)
		if err != nil {
			return false
		}
	} else {
		switch typeVal {
		case 'g', 'T', 'c', 'L':
			instance = 0
		default:
			instance = 1
		}
	}

	switch typeVal {
	case 'c':
		instance |= uint64(chatInstanceFlag_Clan)
		i.SetAccountType(steamlang.EAccountType_Chat)
	case 'L':
		instance |= uint64(chatInstanceFlag_Lobby)
		i.SetAccountType(steamlang.EAccountType_Chat)
	case byte(unknownAccountTypeChar):
		i.SetAccountType(steamlang.EAccountType_Invalid)
	default:
		// FIXME: This should return an error if not found
		for k, v := range accountTypeChars {
			if v == rune(typeVal) {
				i.SetAccountType(k)
			}
		}
	}

	i.SetAccountUniverse(steamlang.EUniverse(universe))
	i.SetAccountInstance(uint32(instance))
	i.SetAccountId(uint32(accountId))
	return true
}

func (i *SteamId) SetAccountId(v uint32) {
	BitSet64_Set((*uint64)(i), uint64(v), 0, 0xFFFFFFFF)
}

func (i *SteamId) GetAccountId() uint32 {
	return uint32(BitSet64_Get((*uint64)(i), 0, 0xFFFFFFFF))
}

func (i *SteamId) SetAccountInstance(v uint32) {
	BitSet64_Set((*uint64)(i), uint64(v), 32, 0xFFFFF)
}

func (i *SteamId) GetAccountInstance() uint32 {
	return uint32(BitSet64_Get((*uint64)(i), 32, 0xFFFFF))
}

func (i *SteamId) SetAccountType(v steamlang.EAccountType) {
	BitSet64_Set((*uint64)(i), uint64(v), 52, 0xF)
}

func (i *SteamId) GetAccountType() steamlang.EAccountType {
	return steamlang.EAccountType(BitSet64_Get((*uint64)(i), 52, 0xF))
}

func (i *SteamId) SetAccountUniverse(v steamlang.EUniverse) {
	BitSet64_Set((*uint64)(i), uint64(v), 56, 0xFF)
}

func (i *SteamId) GetAccountUniverse() steamlang.EUniverse {
	return steamlang.EUniverse(BitSet64_Get((*uint64)(i), 56, 0xFF))
}

func (i *SteamId) GetStaticAccountKey() uint64 {
	return (uint64(i.GetAccountUniverse()) << 56) + (uint64(i.GetAccountType()) << 52) + uint64(i.GetAccountId())
}

func (i *SteamId) IsBlankAnonAccount() bool {
	return i.GetAccountId() == 0 && i.IsAnonAccount() && i.GetAccountInstance() == Instance_All
}

func (i *SteamId) IsGameServerAccount() bool {
	return i.GetAccountType() == steamlang.EAccountType_GameServer || i.GetAccountType() == steamlang.EAccountType_AnonGameServer
}

func (i *SteamId) IsPersistentGameServerAccount() bool {
	return i.GetAccountType() == steamlang.EAccountType_GameServer
}

func (i *SteamId) IsAnonGameServerAccount() bool {
	return i.GetAccountType() == steamlang.EAccountType_AnonGameServer
}

func (i *SteamId) IsContentServerAccount() bool {
	return i.GetAccountType() == steamlang.EAccountType_ContentServer
}

func (i *SteamId) IsClanAccount() bool {
	return i.GetAccountType() == steamlang.EAccountType_Clan
}

func (i *SteamId) IsChatAccount() bool {
	return i.GetAccountType() == steamlang.EAccountType_Chat
}

func (i *SteamId) IsLobby() bool {
	return i.GetAccountType() == steamlang.EAccountType_Chat && (i.GetAccountInstance()&chatInstanceFlag_Lobby) > 0
}
func (i *SteamId) IsIndividualAccount() bool {
	return i.GetAccountType() == steamlang.EAccountType_Individual || i.GetAccountType() == steamlang.EAccountType_ConsoleUser
}

func (i *SteamId) IsAnonAccount() bool {
	return i.GetAccountType() == steamlang.EAccountType_AnonUser || i.GetAccountType() == steamlang.EAccountType_AnonGameServer
}

func (i *SteamId) IsAnonUserAccount() bool {
	return i.GetAccountType() == steamlang.EAccountType_AnonUser
}

func (i *SteamId) IsConsoleUserAccount() bool {
	return i.GetAccountType() == steamlang.EAccountType_ConsoleUser
}

func (i *SteamId) IsValid() bool {
	if i.GetAccountType() <= steamlang.EAccountType_Invalid || i.GetAccountType() > steamlang.EAccountType_AnonUser {
		return false
	}

	if i.GetAccountUniverse() <= steamlang.EUniverse_Invalid || i.GetAccountUniverse() > steamlang.EUniverse_Dev {
		return false
	}

	if i.GetAccountType() == steamlang.EAccountType_Individual {
		if i.GetAccountId() == 0 || i.GetAccountInstance() > Instance_Web {
			return false
		}
	}

	if i.GetAccountType() == steamlang.EAccountType_Clan {
		if i.GetAccountId() == 0 || i.GetAccountInstance() != 0 {
			return false
		}
	}

	if i.GetAccountType() == steamlang.EAccountType_GameServer {
		if i.GetAccountId() == 0 {
			return false
		}
	}

	return true
}

func (i *SteamId) ToChatId() (SteamId, bool) {
	if !i.IsClanAccount() {
		return 0, false
	}
	var id SteamId = *i
	id.SetAccountInstance(chatInstanceFlag_Clan)
	id.SetAccountType(steamlang.EAccountType_Chat)
	return id, true
}

func (i *SteamId) GetClanId() (SteamId, bool) {
	if i.IsChatAccount() && i.GetAccountInstance() == chatInstanceFlag_Clan {
		var id SteamId = *i
		id.SetAccountType(steamlang.EAccountType_Clan)
		id.SetAccountInstance(Instance_All)
		return id, true
	}
	return 0, false
}

func (i *SteamId) String(steam3 bool) string {
	if steam3 {
		var accountTypeC rune = unknownAccountTypeChar
		if c, ok := accountTypeChars[i.GetAccountType()]; ok {
			accountTypeC = c
		}
		if i.GetAccountType() == steamlang.EAccountType_Chat {
			if i.GetAccountInstance()&chatInstanceFlag_Clan > 0 {
				accountTypeC = 'c'
			} else if i.GetAccountInstance()&chatInstanceFlag_Lobby > 0 {
				accountTypeC = 'L'
			}
		}
		var renderInstance bool = false
		switch i.GetAccountType() {
		case steamlang.EAccountType_AnonGameServer, steamlang.EAccountType_Multiseat:
			renderInstance = true
		case steamlang.EAccountType_Individual:
			renderInstance = i.GetAccountInstance() != Instance_Desktop
		}

		if renderInstance {
			return fmt.Sprintf("%c:%d:%d:%d", accountTypeC, i.GetAccountUniverse(), i.GetAccountId(), i.GetAccountInstance())
		}
		return fmt.Sprintf("%c:%d:%d", accountTypeC, i.GetAccountUniverse(), i.GetAccountId())
	} else {
		switch i.GetAccountType() {
		case steamlang.EAccountType_Invalid, steamlang.EAccountType_Individual:
			var universe string = "0"
			if i.GetAccountUniverse() > steamlang.EUniverse_Public {
				universe = fmt.Sprintf("%d", i.GetAccountUniverse())
			}
			return fmt.Sprintf("STEAM_%s:%d:%d", universe, i.GetAccountId()&1, i.GetAccountId()>>1)
		default:
			return i.String(true)
		}
	}
}
