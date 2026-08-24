package steam

type GameType uint32

const (
	GameType_App      GameType = 0
	GameType_GameMod  GameType = 1
	GameType_Shortcut GameType = 2
	GameType_P2P      GameType = 3
)

type GameId uint64

func (i *GameId) SetAppId(v uint32) {
	BitSet64_Set((*uint64)(i), uint64(v), 0, 0xFFFFFF)
}

func (i *GameId) GetAppId() uint32 {
	return uint32(BitSet64_Get((*uint64)(i), 0, 0xFFFFFF))
}

func (i *GameId) SetAppType(v GameType) {
	BitSet64_Set((*uint64)(i), uint64(v), 24, 0xFF)
}

func (i *GameId) GetAppType() GameType {
	return GameType(BitSet64_Get((*uint64)(i), 24, 0xFF))
}

func (i *GameId) SetModId(v uint32) {
	BitSet64_Set((*uint64)(i), uint64(v), 32, 0xFFFFFFFF)
	BitSet64_Set((*uint64)(i), 1, 63, 0xFF)
}

func (i *GameId) GetModId() uint32 {
	return uint32(BitSet64_Get((*uint64)(i), 32, 0xFFFFFFFF))
}
