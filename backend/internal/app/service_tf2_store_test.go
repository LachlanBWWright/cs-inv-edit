package app

import (
	"testing"

	"cs-inv-edit/backend/internal/econ"
)

func TestTF2StorePriceDoesNotRelabelUSDBasePriceAsLocalCurrency(t *testing.T) {
	offer := econ.StoreCatalogOffer{Prices: map[string]uint64{"BASE_USD": 249}}
	if amount, found := tf2StorePrice(offer, "AUD", 21); found {
		t.Fatalf("USD base price resolved as AUD %d", amount)
	}
	local := uint64(395)
	offer.LocalPrice = &local
	if amount, found := tf2StorePrice(offer, "AUD", 21); !found || amount != 395 {
		t.Fatalf("localized AUD price = %d, found=%t", amount, found)
	}
	if amount, found := tf2StorePrice(econ.StoreCatalogOffer{Prices: map[string]uint64{"BASE_USD": 249}}, "USD", 0); !found || amount != 249 {
		t.Fatalf("USD base price = %d, found=%t", amount, found)
	}
}
