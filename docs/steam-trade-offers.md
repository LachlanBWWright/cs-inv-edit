# Steam trade offers

## Architecture

Trade reads use the documented `IEconService/GetTradeOffers` and
`GetTradeHistory` Web API methods. Partner display data is overlaid from
`ISteamUser/GetPlayerSummaries`; the offer IDs, state, direction, and assets
continue to come from `IEconService`.

Trade mutations use the authenticated Steam Community session established by
the existing Steam login. Steam does not document create, accept, or counter
operations in the public `IEconService` reference, so these requests are kept
behind `enableSteamTradeMutations` and are disabled by default. The backend is
the only component that receives the web access token and constructs the
`steamLoginSecure` cookie.

## Mutation routes

- `POST /trades/offers` creates an offer.
- `POST /trades/offers/{id}/accept` accepts an active incoming offer.
- `POST /trades/offers/{id}/counter` creates an offer linked to the incoming
  offer with `tradeofferid_countered`.

Create and counter bodies contain `partnerSteamId`, an optional `message`, and
`itemsToGive` / `itemsToReceive` arrays. Each asset has `appId`, `contextId`,
`assetId`, and `amount`. A `tradeToken` may be supplied when the partner is not
already eligible for direct offers.

Accept and counter derive the partner Steam ID from the most recently loaded
active incoming offer. This prevents a caller from changing the partner or
using those routes on sent, historical, or stale offers. Refresh trades before
retrying a `requires_refresh` result.

## Confirmation and safety

A successful Community response can still require Steam mobile confirmation.
Mutation results expose `needsMobileConfirmation`; submission must not be
presented as final settlement when it is true. Asset IDs and amounts are sent
exactly as selected, and Steam remains authoritative for tradability, ownership,
offer state, escrow, and confirmation checks.
