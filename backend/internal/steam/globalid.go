package steam

import "time"

type GlobalID uint64
type JobId = GlobalID

func (i *GlobalID) SetSequentialCount(v uint32) {
	BitSet64_Set((*uint64)(i), uint64(v), 0, 0xFFFFF)
}

func (i *GlobalID) GetSequentialCount() uint32 {
	return uint32(BitSet64_Get((*uint64)(i), 0, 0xFFFFF))
}

func (i *GlobalID) SetStartTime(v time.Time) {
	seconds := uint32(v.Sub(time.Date(2005, 1, 1, 0, 0, 0, 0, time.UTC)).Seconds())
	BitSet64_Set((*uint64)(i), uint64(seconds), 20, 0x3FFFFFFF)
}

func (i *GlobalID) GetStartTime() time.Time {
	seconds := uint32(BitSet64_Get((*uint64)(i), 20, 0x3FFFFFFF))
	return time.Date(2005, 1, 1, 0, 0, 0, 0, time.UTC).Add(
		time.Duration(seconds) * time.Second,
	)
}

func (i *GlobalID) SetProcessId(v uint32) {
	BitSet64_Set((*uint64)(i), uint64(v), 50, 0xF)
}

func (i *GlobalID) GetProcessId() uint32 {
	return uint32(BitSet64_Get((*uint64)(i), 50, 0xF))
}

func (i *GlobalID) SetBoxId(v uint32) {
	BitSet64_Set((*uint64)(i), uint64(v), 54, 0x3FF)
}

func (i *GlobalID) GetBoxId() uint32 {
	return uint32(BitSet64_Get((*uint64)(i), 54, 0x3FF))
}
