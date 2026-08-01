# Multi-game economy sources

The read-only economy viewers use a shared Steam CM connection but isolate GC
messages, SOCache state, inventory snapshots, and metadata by AppID.

Steam Community items use the public inventory endpoint for AppID `753`,
context `6`. This is the owned-item source for Steam trading cards, emoticons,
profile backgrounds, gems, boosters, and related Community items because they
do not have a game GC SOCache. The response's exact description records supply
names, types, tags, market names, trade state, and Steam icon tokens; schema
image paths are never synthesized.

Steam Inventory Service inventories are a separate, user-selected AppID-scoped
source. The authenticated Steam CM session calls
`Inventory.GetInventory#1`, whose authoritative request and response definitions
are `CInventory_GetInventory_Request` and `CInventory_Response` in
`proto/vendor/steam-protobufs/steam/steammessages_inventory.steamclient.proto`.
The response's `item_json` supplies owned instances while `itemdef_json`
supplies definition metadata. Inventory Service items are stored under the
`steam-service` source and are never merged into AppID 753 Community items or a
game GC SOCache. The UI preserves 64-bit item and definition identifiers as
decimal strings.

Inventory Service support is currently read-only. Exchange, consumption,
property modification, stack splitting/combining, promotion, and purchase RPCs
remain unimplemented until each target game is verified to use the service and
the relevant mutation is independently feature-gated.

Only one optional game GC is driven on demand at a time. A TF2 or Dota refresh
announces `[730, selected AppID]`, so CS2 presence is always retained while
switching the optional GC. Account/game snapshots remain isolated and cached in
memory even when the other optional GC becomes active. Disabling a mode cancels
its work and re-announces CS2 plus any other still-enabled optional mode.

## Pinned protocol repositories

| Game                    |        AppID | Vendored source                   | Pinned commit                              |
| ----------------------- | -----------: | --------------------------------- | ------------------------------------------ |
| CS2                     |          730 | `proto/vendor/gametracking-cs2`   | `fe4e895b3b44d4c1e4ae32e4b62daa6150d6c8f0` |
| Team Fortress 2         |          440 | `proto/vendor/gametracking-tf2`   | `b6d0d7c104db22f520f5608e25aec4a7580a5fd2` |
| Dota 2                  |          570 | `proto/vendor/gametracking-dota2` | `8281466d75ee68c0af40bad40fe0d5cc07505526` |
| Steam platform services | AppID-scoped | `proto/vendor/steam-protobufs`    | `a8658d7a579eeb9feed0cd20ff0295e3414c3f5b` |

The upstream repositories are maintained by SteamTracking. Message IDs and
field layouts must be copied from these pinned sources and generated; generated
protobuf output must never be edited manually.

For TF2 and Dota 2, the inventory transport uses:

- GC ClientHello EMsg `4006`;
- GC ClientWelcome EMsg `4004`;
- SO CacheSubscribed EMsg `24`;
- SO type `1`, whose objects are `CSOEconItem`;
- `base_gcmessages.proto`, `gcsdk_gcmessages.proto`, and
  `gcsystemmsgs.proto` from the corresponding game tracker.

The welcome payloads are not interchangeable: Dota 2
`CMsgClientWelcome.outofdate_subscribed_caches` is field 3, whereas TF2 field 3
is `txn_country_code`. The TF2 loader therefore waits for the separate EMsg 24
subscription and never interprets its welcome as a Dota cache.

The TF2 Mann Co. Store is loaded from AppID `440` using
`CMsgStoreGetUserData` / `CMsgStoreGetUserDataResponse` (GC EMsgs `2500` and
`2501`) from `proto/vendor/gametracking-tf2/Protobufs/base_gcmessages.proto`.
The GC's compressed price sheet is authoritative for availability and
account-local prices. Live GameTracking-TF2 `items_game.txt` and
`tf_english.txt` provide names, classifications, descriptions, and container
contents. Store offers are never inferred from inventory or Community Market
listings, and image URLs are omitted unless Steam supplies an exact description
icon token.

Supported TF2 purchases use `CMsgGCStorePurchaseInit` / response EMsgs
`2510` and `2511`, followed after explicit Steam authorization by TF2's
`CMsgGCStorePurchaseFinalize` / response EMsgs `2512` and `2513`. Request
fields come directly from the current account-local price sheet. Offers that
require supplemental purchase data remain unavailable until that exact TF2
payload is represented; the backend does not infer it.

SOCache subscription refreshes also differ. TF2 sends a standalone
`CMsgSOCacheSubscriptionCheck` as EMsg `27`; the client answers with
`CMsgSOCacheSubscriptionRefresh` EMsg `28`. Dota 2 may instead include checks
in `CMsgClientWelcome.uptodate_subscribed_caches` field `4`, and each owner SOID
must receive the same EMsg `28` refresh before the GC sends the authoritative
EMsg `24` cache. When Dota field `3` already contains SO type `1`, that complete
cache is decoded directly without a redundant refresh.

GC hello versions are taken from the pinned game files rather than guessed:

- TF2 `tf/steam.inf`: `ClientVersion=10815139`;
- Dota 2 `game/dota/steam.inf`: `ClientVersion=6859`.
- CS2 `game/csgo/steam.inf`: `ClientVersion=2000875` at pinned
  GameTracking-CS2 revision `1574fa8c`. CS2 `ClientHello` must be updated with
  this value when the submodule advances; stale builds may never receive
  `ClientWelcome`.

Dota's hello also sets `engine = k_ESE_Source2` (`1`) explicitly because the
protobuf's historical default is Source 1. Updating either tracker requires
reviewing these values and regenerating the per-game descriptor sets.

`CSOEconItem` is the authoritative owned-item source. Steam Community inventory
responses are descriptions only: names, market hash names, trade state, tags,
and `icon_url` tokens are joined to GC items by asset/original ID. Community
inventory assets never add owned items that were not present in the GC cache.
Steam description `tradable` / `marketable` flags and English
`owner_descriptions` trade-lock timestamps are retained as metadata. Current
prices are fetched separately from Steam Community Market `priceoverview` with
the inventory's exact AppID and `market_hash_name`; a missing listing never
creates an owned item and does not display a price badge.

The generic Steam Inventory Service picker obtains the connected account's
owned AppIDs through the authenticated `Player.GetOwnedGames#1` unified RPC
(`CPlayer_GetOwnedGames_Request`, with app info and played free games included).
The backend removes AppIDs 753 (Steam), 570 (Dota 2), 440 (Team Fortress 2), and
730 (Counter-Strike 2) because those sources have dedicated implementations.
The remaining owned games are probed through `Inventory.GetInventory#1` with a
bounded worker pool. Only AppIDs whose authoritative response contains at least
one owned item are sorted by Steam's display name and exposed in the dropdown.
Unsupported and empty Inventory Service responses are omitted, and successful
snapshots are cached for the connected account during discovery.

The sanitized fixed-wire fixture at
`backend/internal/transport/testdata/multigame_socache.hex` covers an ordinary
stacked item, a decorated/socketed item with binary attribute bytes and equipped
state, a contained/interior economy item, and an unrelated SO type that must be
ignored. Provider fixtures separately cover nonmarketable descriptions,
unmatched owned items, private overlays, and Community-only assets that must not
enter the owned list.

## TF2 metadata

Definition metadata is refreshed from the live tracker:

- `tf/scripts/items/items_game.txt`
- `tf/resource/tf_english.txt`

The parser merges prefabs before reading item name, localized type, quality,
equip slot, class usability, capabilities, equip regions, tags, craft/tool
classification, static attributes, levels, and collection membership. See
`docs/tf2-items-game.md` for the operation safety and update contract. Schema image/material paths are
not converted into URLs. Images come only from exact Steam descriptions.

## Dota 2 metadata

The pinned Dota tracker provides the current GC protobufs, but it does not
contain a TF2/CS2-style cosmetic `items_game.txt` in its extracted game files.
Valve's `IEconItems_570/GetSchemaURL` endpoint currently requires credentials
(an unauthenticated request returned HTTP 403 during the 2026-07-15 source
audit). Therefore:

- ownership and numeric item fields come from Dota GC `CSOEconItem` objects;
- localized owned-item names, hero/slot/type tags, market names, and images come
  from exact Steam inventory descriptions when available;
- the UI explicitly diagnoses a missing description instead of inferring Dota
  definition metadata from gameplay `items.txt` files;
- adding a credentialed schema service requires a separate secret-management
  design and must not embed a Steam Web API key in the client or repository.

## Updating sources

1. Update one submodule at a time.
2. Review relevant proto diffs and schema paths.
3. Regenerate local bindings mechanically if selected message definitions
   changed.
4. Run transport fixture tests and all CS2 regression tests.
5. Update the pinned commit table and record any field/source changes here.
