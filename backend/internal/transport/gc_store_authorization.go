package transport

import (
	"bytes"
	"encoding/binary"
	"fmt"
	"math"
	"net/url"
	"strconv"
	"strings"
)

func steamCheckoutURL(transID, orderID uint64) string {
	finalizeURL := fmt.Sprintf("https://store.steampowered.com/buyitem/730/finalize/%d?canceledurl=https%%3A%%2F%%2Fstore.steampowered.com%%2F&returnhost=store.steampowered.com", orderID)
	return fmt.Sprintf("https://checkout.steampowered.com/checkout/approvetxn/%d/?returnurl=%s&canceledurl=https%%3A%%2F%%2Fstore.steampowered.com%%2F", transID, url.QueryEscape(finalizeURL))
}

func ValidateSteamCheckoutURL(raw string) error {
	parsed, err := url.Parse(raw)
	if err != nil || parsed.Scheme != "https" || parsed.User != nil || parsed.Hostname() == "" || netParseIP(parsed.Hostname()) {
		return fmt.Errorf("Steam checkout URL is invalid")
	}
	host := strings.ToLower(parsed.Hostname())
	// Deliberately reject store.steampowered.com/buyitem links. This validator
	// is for an already-created native CS2 transaction, not for starting a
	// separate Steam Inventory Service web purchase.
	if host != "checkout.steampowered.com" || !strings.HasPrefix(parsed.EscapedPath(), "/checkout/approvetxn/") {
		return fmt.Errorf("URL is not a Steam transaction-approval page")
	}
	return nil
}
func netParseIP(host string) bool {
	for _, c := range host {
		if (c < '0' || c > '9') && c != '.' && c != ':' {
			return false
		}
	}
	return true
}

func parseMicroTxnAuthorization(raw []byte) (map[string]any, error) {
	if len(raw) < 2 {
		return nil, fmt.Errorf("Steam microtransaction authorization was empty")
	}
	values := map[string]any{}
	reader := bytes.NewReader(raw[1:])
	if err := parseBinaryKV(reader, values); err != nil {
		return nil, fmt.Errorf("decode Steam microtransaction authorization: %w", err)
	}
	return values, nil
}
func parseBinaryKV(r *bytes.Reader, out map[string]any) error {
	for {
		kind, err := r.ReadByte()
		if err != nil {
			return err
		}
		if kind == 8 || kind == 11 {
			return nil
		}
		key, err := readCString(r)
		if err != nil {
			return err
		}
		normalized := strings.ToLower(key)
		switch kind {
		case 0:
			child := make(map[string]any)
			if err := parseBinaryKV(r, child); err != nil {
				return err
			}
			out[normalized] = child
		case 1:
			value, err := readCString(r)
			if err != nil {
				return err
			}
			out[normalized] = value
		case 2, 3, 5:
			var value uint32
			if err := binary.Read(r, binary.LittleEndian, &value); err != nil {
				return err
			}
			out[normalized] = uint64(value)
		case 7, 9, 10:
			var value uint64
			if err := binary.Read(r, binary.LittleEndian, &value); err != nil {
				return err
			}
			out[normalized] = value
		case 6:
			var value uint32
			if err := binary.Read(r, binary.LittleEndian, &value); err != nil {
				return err
			}
			out[normalized] = uint64(value)
		default:
			return fmt.Errorf("unsupported binary KeyValues type %d", kind)
		}
	}
}

func authorizationLineItem(values map[string]any) (map[string]any, bool) {
	lineItems, ok := values["lineitems"].(map[string]any)
	if !ok {
		return nil, false
	}
	lineItem, ok := lineItems["0"].(map[string]any)
	return lineItem, ok
}
func readCString(r *bytes.Reader) (string, error) {
	var b []byte
	for len(b) <= math.MaxUint16 {
		c, err := r.ReadByte()
		if err != nil {
			return "", err
		}
		if c == 0 {
			return string(b), nil
		}
		b = append(b, c)
	}
	return "", fmt.Errorf("binary KeyValues string too long")
}
func kvUint64(values map[string]any, keys ...string) (uint64, bool) {
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
			return parsed, err == nil
		}
	}
	return 0, false
}
