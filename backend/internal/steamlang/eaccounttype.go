package steamlang

type EAccountType uint32

const (
	EAccountType_Invalid        EAccountType = 0
	EAccountType_Individual     EAccountType = 1
	EAccountType_Multiseat      EAccountType = 2
	EAccountType_GameServer     EAccountType = 3
	EAccountType_AnonGameServer EAccountType = 4
	EAccountType_Pending        EAccountType = 5
	EAccountType_ContentServer  EAccountType = 6
	EAccountType_Clan           EAccountType = 7
	EAccountType_Chat           EAccountType = 8
	EAccountType_ConsoleUser    EAccountType = 9
	EAccountType_AnonUser       EAccountType = 10
)
