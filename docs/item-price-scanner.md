# Item price scanner

The reusable Go package is `backend/pricescanner`. It accepts canonical Steam
`market_hash_name` values and fans a query out to independent `Provider`
implementations. Results use integer minor currency units when a source exposes
a machine-readable amount, retain the source's display string, and report one
provider's failure without discarding successful quotes from other providers.

The bundled adapters are Steam Community Market, Skinport, CSFloat, Waxpeer, and
Market.CSGO. Skinport
supports the requested currency directly. CSFloat currently returns USD; it is
reported as unavailable for other requested currencies because the scanner does
not guess exchange rates. Waxpeer also returns USD and uses its public read-only
price endpoint. Market.CSGO provides a public best-offer catalogue for USD, EUR,
and RUB. Set `CSFLOAT_API_KEY` when CSFloat requires an API key.

Provider availability is game-aware:

| Game                          | Providers                                                                     |
| ----------------------------- | ----------------------------------------------------------------------------- |
| CS2 (`730`)                   | Steam Community Market, Skinport, CSFloat, Waxpeer, Market.CSGO               |
| TF2 (`440`)                   | Steam Community Market, Skinport, Waxpeer, Backpack.tf guide data via PriceDB |
| Dota 2 (`570`)                | Steam Community Market, Skinport, Market.Dota2.net                            |
| Steam community items (`753`) | Steam Community Market                                                        |

Backpack.tf guide values retain TF2-native keys/refined-metal ranges and do not
pretend to be cash listings. PriceDB is used because Backpack.tf's direct API
requires an application key. Steam, Skinport, and Waxpeer are shared providers;
the remaining adapters return no quotes outside their supported games.

Applications can use the package directly:

```go
scanner := pricescanner.New(myProvider, anotherProvider)
result, err := scanner.Scan(ctx, pricescanner.Query{
    MarketNames: []string{"AK-47 | Redline (Field-Tested)"},
    Currency: "USD",
})
```

The independently deployed Shared Data Service exposes cached observations as
`POST /v1/prices/query`. The Local Agent does not contact marketplace providers.
Clients send only public lookup keys:

```json
{
  "marketNames": ["AK-47 | Redline (Field-Tested)"],
  "currency": "USD",
  "appId": 730
}
```

`items` retains quotes grouped by requested market name. `listings` contains the
same quotes in one cross-site list, sorted by adjusted price when currencies are
comparable. Every quote keeps its raw `amountMinor` and also returns
`priceMultiplier`, `adjustedAmountMinor`, and `adjustedDisplayPrice`. Shared
cache entries contain canonical raw observations and use a multiplier of `1`.
Personal fee, discount, or cash-value policies belong in the client and must not
alter shared cache identity.

Providers are data-source adapters only. The Shared Data Service applies a
five-minute in-memory TTL and coalesces concurrent identical requests. An
expired observation remains eligible as explicit `cacheState: "stale"` data for
up to thirty additional minutes when refresh fails. Provider errors remain
partial results. `observedAt` identifies upstream observation time, while
`servedAt` identifies when the shared response was served.

Run the service with `pnpm build:data-service && ./bin/data-service`. It listens
on `127.0.0.1:7332` by default; override this with `CSINV_DATA_ADDR`. The service
also exposes `GET /healthz`, `GET /readyz`, and `GET /v1/providers`. Set
`CSINV_DATA_ALLOWED_ORIGINS` to a comma-separated production browser-origin
allowlist; local development defaults to `*`.

`appId` defaults to CS2 (`730`). The Steam provider also accepts TF2 (`440`),
Dota 2 (`570`), and Steam Community (`753`) listing names. CS2-only providers
are skipped for other app IDs. Inventory cards use the Steam quote in integer
minor units. Unmarketable items and names without a positive listing omit the
price badge instead of presenting a fabricated zero-value quote.
