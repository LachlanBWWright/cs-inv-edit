package econ

import (
	"bytes"
	"encoding/binary"
	"fmt"
	"io"
	"strconv"
	"strings"

	"github.com/ulikunitz/xz/lzma"
)

type StoreCatalogOffer struct {
	ID                       string
	ItemLink                 string
	Category                 string
	Prices                   map[string]uint64
	SalePrices               map[string]uint64
	PurchaseType             uint32
	SupplementalDataRequired bool
}
type StoreCatalog struct{ Offers []StoreCatalogOffer }
type binaryKVNode struct {
	Name     string
	Values   map[string]any
	Children []*binaryKVNode
}

func ParseStorePriceSheet(compressed []byte) (StoreCatalog, error) {
	plain, err := decompressValveLZMA(compressed)
	if err != nil {
		return StoreCatalog{}, err
	}
	root := &binaryKVNode{Values: map[string]any{}}
	if err := parseStoreKV(bytes.NewReader(plain), root); err != nil {
		return StoreCatalog{}, fmt.Errorf("parse store price sheet: %w", err)
	}
	var offers []StoreCatalogOffer
	var walk func(*binaryKVNode)
	walk = func(node *binaryKVNode) {
		if offer, ok := storeOfferFromNode(node); ok {
			offers = append(offers, offer)
		}
		for _, child := range node.Children {
			walk(child)
		}
	}
	walk(root)
	if len(offers) == 0 {
		return StoreCatalog{}, fmt.Errorf("store price sheet contained no supported offers")
	}
	return StoreCatalog{Offers: offers}, nil
}

func decompressValveLZMA(data []byte) ([]byte, error) {
	stream := data
	if len(data) >= 17 && string(data[:4]) == "LZMA" {
		expected := binary.LittleEndian.Uint32(data[4:8])
		stream = make([]byte, 13, 13+len(data)-17)
		copy(stream[:5], data[12:17])
		binary.LittleEndian.PutUint64(stream[5:13], uint64(expected))
		stream = append(stream, data[17:]...)
	}
	reader, err := lzma.NewReader(bytes.NewReader(stream))
	if err != nil {
		return nil, fmt.Errorf("decompress store price sheet: %w", err)
	}
	plain, err := io.ReadAll(io.LimitReader(reader, 64<<20))
	if err != nil {
		return nil, fmt.Errorf("decompress store price sheet: %w", err)
	}
	return plain, nil
}

func parseStoreKV(r *bytes.Reader, parent *binaryKVNode) error {
	for {
		kind, err := r.ReadByte()
		if err != nil {
			return err
		}
		if kind == 8 || kind == 11 {
			return nil
		}
		key, err := storeCString(r)
		if err != nil {
			return err
		}
		key = strings.ToLower(key)
		switch kind {
		case 0:
			child := &binaryKVNode{Name: key, Values: map[string]any{}}
			parent.Children = append(parent.Children, child)
			if err := parseStoreKV(r, child); err != nil {
				return err
			}
		case 1:
			value, err := storeCString(r)
			if err != nil {
				return err
			}
			parent.Values[key] = value
		case 2:
			var value uint32
			if err := binary.Read(r, binary.LittleEndian, &value); err != nil {
				return err
			}
			parent.Values[key] = uint64(value)
		case 3:
			var value float32
			if err := binary.Read(r, binary.LittleEndian, &value); err != nil {
				return err
			}
			parent.Values[key] = value
		case 6:
			var value uint32
			if err := binary.Read(r, binary.LittleEndian, &value); err != nil {
				return err
			}
			parent.Values[key] = uint64(value)
		case 7, 9, 10:
			var value uint64
			if err := binary.Read(r, binary.LittleEndian, &value); err != nil {
				return err
			}
			parent.Values[key] = value
		default:
			return fmt.Errorf("unsupported binary KeyValues type %d", kind)
		}
	}
}
func storeCString(r *bytes.Reader) (string, error) {
	data := make([]byte, 0, 32)
	for len(data) <= 1<<16 {
		c, err := r.ReadByte()
		if err != nil {
			return "", err
		}
		if c == 0 {
			return string(data), nil
		}
		data = append(data, c)
	}
	return "", fmt.Errorf("binary KeyValues string too long")
}
func storeOfferFromNode(node *binaryKVNode) (StoreCatalogOffer, bool) {
	itemLink, ok := node.Values["item_link"].(string)
	prices := storeCurrencyValues(storeChild(node, "prices"))
	if !ok || itemLink == "" || len(prices) == 0 {
		return StoreCatalogOffer{}, false
	}
	offer := StoreCatalogOffer{ID: itemLink, ItemLink: itemLink, Prices: prices, SalePrices: storeCurrencyValues(storeChild(node, "sale_prices"))}
	if category, ok := node.Values["category_tags"].(string); ok {
		offer.Category = category
	}
	if purchaseType, ok := storeUint(node.Values, "purchase_type"); ok {
		offer.PurchaseType = uint32(purchaseType)
	}
	if supplemental, ok := storeUint(node.Values, "supplemental_data_required", "requires_supplemental_data"); ok {
		offer.SupplementalDataRequired = supplemental != 0
	}
	return offer, true
}
func storeChild(node *binaryKVNode, name string) *binaryKVNode {
	for _, child := range node.Children {
		if child.Name == name {
			return child
		}
	}
	return nil
}
func storeCurrencyValues(node *binaryKVNode) map[string]uint64 {
	values := make(map[string]uint64)
	if node == nil {
		return values
	}
	for key := range node.Values {
		if amount, ok := storeUint(node.Values, key); ok {
			values[strings.ToUpper(key)] = amount
		}
	}
	return values
}
func storeUint(values map[string]any, keys ...string) (uint64, bool) {
	for _, key := range keys {
		value, ok := values[key]
		if !ok {
			continue
		}
		switch typed := value.(type) {
		case uint64:
			return typed, true
		case string:
			parsed, err := strconv.ParseUint(typed, 10, 64)
			if err == nil {
				return parsed, true
			}
		}
	}
	return 0, false
}
