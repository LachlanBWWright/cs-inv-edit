package steamlang

type EDepotFileFlag uint32

const (
	EDepotFileFlag_UserConfig          EDepotFileFlag = 1
	EDepotFileFlag_VersionedUserConfig EDepotFileFlag = 2
	EDepotFileFlag_Encrypted           EDepotFileFlag = 4
	EDepotFileFlag_ReadOnly            EDepotFileFlag = 8
	EDepotFileFlag_Hidden              EDepotFileFlag = 16
	EDepotFileFlag_Executable          EDepotFileFlag = 32
	EDepotFileFlag_Directory           EDepotFileFlag = 64
	EDepotFileFlag_CustomExecutable    EDepotFileFlag = 128
	EDepotFileFlag_InstallScript       EDepotFileFlag = 256
	EDepotFileFlag_Symlink             EDepotFileFlag = 512
)
