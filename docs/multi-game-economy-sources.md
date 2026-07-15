# Multi-game economy sources

The read-only economy viewers use a shared Steam CM connection but isolate GC
messages, SOCache state, inventory snapshots, and metadata by AppID.

Only one optional game GC is driven on demand at a time. A TF2 or Dota refresh
announces `[730, selected AppID]`, so CS2 presence is always retained while
switching the optional GC. Account/game snapshots remain isolated and cached in
memory even when the other optional GC becomes active. Disabling a mode cancels
its work and re-announces CS2 plus any other still-enabled optional mode.

## Pinned protocol repositories

| Game | AppID | Vendored source | Pinned commit |
| --- | ---: | --- | --- |
| CS2 | 730 | `proto/vendor/gametracking-cs2` | `fe4e895b3b44d4c1e4ae32e4b62daa6150d6c8f0` |
| Team Fortress 2 | 440 | `proto/vendor/gametracking-tf2` | `c9b6d8ab62974272a5eb461f22c62035cf65ccc8` |
| Dota 2 | 570 | `proto/vendor/gametracking-dota2` | `8281466d75ee68c0af40bad40fe0d5cc07505526` |

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

GC hello versions are taken from the pinned game files rather than guessed:

- TF2 `tf/steam.inf`: `ClientVersion=10815139`;
- Dota 2 `game/dota/steam.inf`: `ClientVersion=6859`.

Dota's hello also sets `engine = k_ESE_Source2` (`1`) explicitly because the
protobuf's historical default is Source 1. Updating either tracker requires
reviewing these values and regenerating the local subset.

`CSOEconItem` is the authoritative owned-item source. Steam Community inventory
responses are descriptions only: names, market hash names, trade state, tags,
and `icon_url` tokens are joined to GC items by asset/original ID. Community
inventory assets never add owned items that were not present in the GC cache.

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
equip slot, class usability, and capabilities. Schema image/material paths are
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
