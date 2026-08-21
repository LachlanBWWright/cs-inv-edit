package econ

import "cs-inv-edit/backend/internal/domain"

type TF2RelatedItem struct {
	DefIndex uint32
	Name     string
	Rarity   string
	PoolKind domain.TF2PoolKind
	ImageURL string
}

type TF2AttributeDefinition struct {
	DefIndex          uint32
	Name              string
	AttributeClass    string
	AttributeType     string
	DescriptionFormat string
	EffectType        string
	StoredAsInteger   bool
	Hidden            bool
	ValueNames        map[uint32]string
}

type TF2DecodedAttribute struct {
	DefIndex       uint32
	Name           string
	Value          string
	EffectType     string
	Hidden         bool
	AttributeClass string
}
