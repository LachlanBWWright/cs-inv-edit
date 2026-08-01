# CS2 `items_game.txt` Metadata

> TF2 campaign metadata uses the live GameTracking-TF2 mirror: `tf/scripts/items/items_game.txt`, `tf/resource/tf_english.txt`, and `tf/resource/tf_quests_english.txt`. The quest localization file resolves GC contract definition indexes to contract names, descriptions, and objective text; the GC shared-object cache remains authoritative for owned contracts, progress, campaign nodes, and reward-redemption records.

`items_game.txt` is CS2's live economy schema file. This app fetches it from the public SteamDatabase GameTracking-CS2 mirror during inventory refresh so item names and categories do not depend on stale bundled data.

Source:

```text
https://raw.githubusercontent.com/SteamTracking/GameTracking-CS2/master/game/csgo/pak01_dir/scripts/items/items_game.txt
```

Localization source:

```text
https://raw.githubusercontent.com/SteamTracking/GameTracking-CS2/master/game/csgo/pak01_dir/resource/csgo_english.txt
```

## Cash-store catalogue and pricing

The real-money Store is separate from the Armory XP Shop. Authoritative availability and account-local prices come from the CS2 GC `CMsgStoreGetUserDataResponse` price sheet (`k_EMsgGCStoreGetUserDataResponse`, 2501), which is Valve LZMA-compressed binary KeyValues. Live `items_game.txt` and localization only add names and classifications; Community Market prices never replace GC store prices.

Modern price sheets expose global catalogue entries under `entries`; each entry supplies an `item_link`, currency amounts under `prices`, and optional discounted amounts under `sale_prices`. The backend resolves `item_link` against the live `items_game.txt` `items[].name` field to obtain the authoritative defindex and display metadata. It does not expect personalized offer objects or direct defindex/price fields on an entry.

The CS2 protocol descriptor set is generated directly from the pinned files in
`proto/vendor/gametracking-cs2/Protobufs/` into
`backend/internal/proto/gametracking/gametracking_store.pb`. Inventory,
shared-object, mutation, store, and diagnostic messages all use those external
descriptors through `dynamicpb`; the repository has no copied partial CS2
schema. An isolated descriptor registry avoids globally registering another
copy of Valve's package-less GC definitions. Checkout URLs originate in a
correlated GC/Steam transaction response and are never derived from item
metadata.

See [`cs2-store-purchases.md`](cs2-store-purchases.md) for the complete coupon
and headless GC checkout lifecycle. That document also records
[CS2Interface](https://github.com/Citrinate/CS2Interface) as a useful working
reference for Steam/GC session orchestration while retaining SteamTracking as
the authority for message definitions.

## Documentation Sources

Keep this document in this repository at:

```text
docs/cs2-items-game.md
```

When updating it, use the live tracked CS2 files as the source of truth:

```text
https://github.com/SteamTracking/GameTracking-CS2/tree/master/game/csgo/pak01_dir/scripts/items
https://github.com/SteamTracking/GameTracking-CS2/tree/master/game/csgo/pak01_dir/resource
```

The raw files used by the backend are:

```text
https://raw.githubusercontent.com/SteamTracking/GameTracking-CS2/master/game/csgo/pak01_dir/scripts/items/items_game.txt
https://raw.githubusercontent.com/SteamTracking/GameTracking-CS2/master/game/csgo/pak01_dir/resource/csgo_english.txt
```

For GC protobuf message IDs, field numbers, and enum values referenced by inventory or item operations, use:

```text
https://github.com/SteamTracking/GameTracking-CS2/tree/master/Protobufs
https://github.com/SteamTracking/Protobufs
```

The relevant CS2-current files are:

```text
https://github.com/SteamTracking/GameTracking-CS2/blob/master/Protobufs/econ_gcmessages.proto
https://github.com/SteamTracking/GameTracking-CS2/blob/master/Protobufs/base_gcmessages.proto
https://github.com/SteamTracking/GameTracking-CS2/blob/master/Protobufs/gcsdk_gcmessages.proto
https://github.com/SteamTracking/GameTracking-CS2/blob/master/Protobufs/cstrike15_gcmessages.proto
```

The upstream paths still use legacy names such as `csgo`, `cstrike15`, and `ECsgoGCMsg`; do not treat those names alone as evidence that the data is obsolete. Verify recency by checking the GameTracking-CS2 repository path and commit history.

## What It Provides

- `items` keyed by defindex.
- `prefabs`, which must be merged into concrete item definitions.
- `item_name` localization tokens such as `#SFUI_WPNHUD_AK47`.
- `item_type_name`, `item_class`, `item_rarity`, and tool/capability metadata.
- `paint_kits`, including localization tokens and `wear_remap_min` / `wear_remap_max` caps used by wear and trade-up previews.
- `item_sets`, which link weapon/finish pairs to named collections.
- `client_loot_lists` and each container's `loot_list_name`, which describe possible container contents (including nested loot lists).
- Logical inventory image keys such as `econ/weapons/base_weapons/weapon_ak47`.

## What It Does Not Provide

- The user's owned item list. Owned items still come from the authenticated CS2 Game Coordinator SOCache.
- Asset IDs. Those come from `CSOEconItem`.
- Final Steam CDN icon hashes. The `image_inventory` field is a logical CS2 asset key, not the `icon_url` hash used by Steam community inventory descriptions.
- Complete market names for every instance by itself. Weapon skins require joining GC item attributes, especially paint kit and wear, with schema data.

## Current Join Strategy

1. Load inventory instances from CS2 GC `ClientWelcome` / SOCache.
2. Read each `CSOEconItem.def_index`.

The UI's **Preview in game** action is retained from the matched owned asset's
live Steam inventory-description `actions[].link`. Owner and asset placeholders
are expanded with the authenticated SteamID and GC-matched asset ID. The app
does not construct inspect links when Steam omits that action. 3. Fetch latest `items_game.txt`. 4. Fetch latest `csgo_english.txt`. 5. Parse Valve KeyValues. 6. Merge item prefabs into concrete item definitions. 7. Resolve localization tokens. 8. Join by `def_index`. 9. If the GC item has paint kit attribute `6`, join it to `paint_kits`. 10. Join the resulting `[paint_kit]weapon` key to `item_sets` for collection membership and contents. 11. For containers, recursively resolve `loot_list_name` through `client_loot_lists`; this is descriptive metadata and does not predict an opening result. Resolve required opening keys from the container's prefab-merged `associated_items` / `associated_item` defindexes; an absent association identifies a keyless container.

For case-backed collection previews, rarity is taken from the case's tiered
`client_loot_lists` (for example, the `_rare`, `_mythical`, `_legendary`, and
`_ancient` child lists). A paint kit can be reused by another collection at a
different grade, so the global `paint_kits_rarity` value is only the fallback
when no unambiguous collection-specific loot-list tier exists.

## Important Attribute IDs

- `6`: paint kit ID.
- `8`: paint wear float bits.
- `113`: sticker slot 0 ID; for unsealed graffiti this identifies the graffiti pattern.
- `232`: remaining graffiti charges (`sprays_remaining`).
- `233`: graffiti tint ID (`spray_tint_id`), not the remaining charge count.

These IDs are decoded from `CSOEconItem.attribute`; do not infer paint names from defindex alone.

See [`trade-up-formula.md`](trade-up-formula.md) for normalized input wear,
outcome wear, collection probabilities, knife/glove contracts, and Souvenir
conversion behavior.

## Steam Inventory Description Overlay

`items_game.txt` is not enough for reliable images. During inventory refresh, the app may also request Steam community inventory descriptions for the authenticated SteamID:

```text
https://steamcommunity.com/inventory/<steamid>/730/2?l=english&count=5000
```

The GC-owned item list remains authoritative. The web response is metadata only. It is joined by:

1. `assets[].assetid` to GC `CSOEconItem.id`.
2. `assets[].classid` + `assets[].instanceid` to `descriptions[]`.
3. Description fields such as `market_hash_name`, `icon_url`, and `icon_url_large` overlay the schema-derived metadata.

If the Steam asset ID does not match either the GC item ID or original ID, the
overlay may use a normalized exact display/market-name key only when it maps to
one unique Steam description. Both the full name and a trailing-variant base
name are indexed (for example, a sealed-graffiti color suffix). Ambiguous keys
are recorded and deliberately rejected. This fallback supplies valid Steam
icons for non-marketable collectibles without changing the GC-owned item list.

Permanent definition-level non-tradability is read from the fully merged
`items_game` `capabilities.can_trade = 0` value. Instance-level tradability and
temporary `Tradable After` timestamps continue to come from the Steam inventory
description overlay; a positive schema capability never overrides an instance
trade lock.

If this request fails, inventory should still render with schema-derived names and include a diagnostic that Steam inventory description metadata was unavailable.

## Images

The primary image overlay is the live MIT-licensed
[`counter-strike-image-tracker`](https://github.com/ByMykel/counter-strike-image-tracker)
index:

```text
https://raw.githubusercontent.com/ByMykel/counter-strike-image-tracker/refs/heads/main/static/images.json
```

That index maps Valve `image_inventory` keys to verified HTTPS assets hosted on
Steam's static/economy CDNs or, for newly extracted assets awaiting CDN
resolution, the tracker's raw GitHub files. Weapon finishes use the tracked
`econ/default_generated/<weapon>_<paint-kit>_<wear-tier>` keys. This is a lookup
of published URLs, not fabrication of a CDN path or hash.

If the tracker is unavailable, image resolution continues through Steam
inventory and market descriptions. Do not otherwise fabricate image URLs from
`image_inventory`; the field alone is not the final URL shape needed by the
frontend.

The tracker is also pinned as the sparse
`vendor/counter-strike-image-tracker` Git submodule. A gzip-compressed copy of
that revision's `static/images.json` is embedded into the Go backend at build
time. Runtime resolution tries the live index first and automatically uses the
embedded snapshot if the request fails or returns invalid JSON. After advancing
the submodule revision, regenerate the embedded snapshot with:

```bash
./scripts/refresh-cs2-image-fallback.sh
```

When inventory debug diagnostics are enabled, each owned item reports the image
source, the matched tracker key (when applicable), and the final URL. Steam
inventory and market fallbacks are identified separately.

Use Steam description `icon_url_large` or `icon_url` when available. These are usually CDN path tokens, not complete URLs. Expand them with:

```text
https://community.fastly.steamstatic.com/economy/image/<icon_url_token>
```

If neither the tracker nor Steam description metadata resolves an image, omit
`imageUrl` rather than returning a broken link. Tracker URLs take precedence so
private community inventories and Steam Market throttling do not prevent normal
item previews; Steam descriptions remain authoritative for owned-instance names,
tradability, market data, and applied-item image markup.

## Failure Policy

If live schema fetch or parsing fails, inventory refresh should fail with an explicit backend error. It should not silently fall back to fake display names like `CS2 item #970`.

# Armory catalogue

The universal Armory catalogue is read from the live `items_game.txt` current
`seasonaloperations` entry whose `redeemable_goods` value is `xpshop`, matching
Panorama's `MissionsAPI.GetSeasonalOperationRedeemableGoodsCount/Schema` path.
The redemption message's `redeem_id` is the unsigned IEEE CRC-32 of each
`operational_point_redeemable.item_name`; it is not the offer's array index.
For example, `lootlist:set_overpass_2024` maps to `2917110498`.
The GC `XpShop` SOCache object (`CSOAccountXpShop`) supplies only
account-specific generation, star balance, and XP tracks. `XpShopBids` objects
are active user bids and are not the universal offer catalogue.
The object may be embedded in `ClientWelcome.outofdate_subscribed_caches` or
arrive immediately afterward in `k_ESOMsg_CacheSubscribed` (message 24); the
Armory refresh waits for both protocol-defined delivery paths.
The currently observed `CSOAccountXpShop` SO type is 6. Because numeric SO type
IDs are not declared by the protobuf schema, structural discovery remains a
fallback: candidate objects are accepted only when their wire fields exactly
match fields 1–3 of `CSOAccountXpShop`, all values fit their authoritative
uint32 types, and `generation_time` is present. Type 6 is preferred when another
account object has the same wire shape; otherwise a fallback candidate must be
unique. Inventory type 1 and multi-object cache types are excluded before
decoding.

Collection, container, and Armory previews are sorted from highest to lowest
rarity. Preview images are populated from the tracked `image_inventory` index
described above, with exact Steam description icons as a fallback; no CDN hash
is fabricated. Missing tracked and Steam icons render an explicit UI fallback.
Owned items may also use a
unique exact-name Steam inventory-description join when GC/original asset IDs
do not match; ambiguous names are never joined. This covers non-marketable
badges and sealed graffiti when Steam exposes their description icons.
Bracketed sticker loot entries such as `[paper_name]sticker` resolve through
`sticker_kits`, rather than the generic sticker item definition. The same
resolver handles `[spray]spray` graffiti and `[patch]patch` patch kits;
`[keychain]keychain` entries resolve through `keychain_definitions`, while pin
loot lists resolve their named commodity-pin item definitions. Weapon cases
resolve their `set supply crate series` attribute through
`revolving_loot_lists` before recursively expanding `client_loot_lists`.
Sticker Slabs are keychain instances with keychain attribute `299` set to the
display-case definition (`37`) and the contained sticker kit in attribute
`321`. Inventory metadata resolves that kit through `sticker_kits`, exposes it
as a contained sticker, and prefers the tracked composite image key
`econ/stickers/<sticker_material>_1355_37` when one is available.
Paintable gloves use the same GC paint-kit (`6`) and wear (`8`) attributes as
weapon finishes, despite inheriting the `hands_paintable` prefab rather than a
`weapon_*` prefab. Their localized market names therefore join the glove item
name with `paint_kits.description_tag`, and tracked wear images use
`econ/default_generated/<glove_name>_<paint_kit_name>_<wear_tier>`. Generic
patch instances similarly resolve attribute `113` through `sticker_kits`, but
use `patch_material` and the `econ/patches/` image namespace.
Applied stickers, agent patches, and charms are named from these same live
definitions and use tracked schema image keys when available. The inventory UI
still renders a typed fallback marker when an applied item's image is missing,
so GC-owned attachment data is never hidden by an unavailable image overlay.
`CSOEconItem.custom_name` is presented separately as the item's applied Name
Tag while the underlying market name remains visible.
Sticker slot wear comes from GC attributes `114 + slot*4` and is displayed as a
read-only scrape percentage alongside a larger attachment preview. No sticker
scrape or removal operation is exposed; those mutations remain in-game only.

Bulk Armory redemption sends the authoritative redeem message once per item,
adjusting `redeemable_balance` before each message. Messages are paced by the
editable `armoryPurchasePacingSeconds` setting (default 5 seconds).
After a single redemption is confirmed by a newly created GC inventory item,
the cached Armory balance is reduced immediately so the next redemption sends
the current pre-purchase balance without requiring a manual Armory refresh.
Armory redemption is enabled by default and is not blocked by the app's general
validation mode; its dedicated feature flag remains the explicit kill switch.
Container, trade-up, and Armory slot-machine candidates reuse these resolved
related-item names, rarities, and tracked thumbnails.
Simulated collection-reveal misses also use live finish wear caps, the shared
inventory wear bar, and the bracket-first float process documented in
[`collection-reveal-wear-generation.md`](collection-reveal-wear-generation.md).
The ready inventory snapshot includes a collection catalogue built from every
live `item_sets` entry in the refreshed schema, so the Settings debug picker is
not limited to collections represented by owned GC items. GC protobuf items
remain the authoritative owned-item list; this catalogue is metadata only.

Collection-preview rows are compact and expandable. Expanded rows expose live
paint-kit float caps and lazily request one Steam Market description for that
item. Selecting an owned inventory item does the same when its initial overlay
has no price. Successful lookups are cached for the backend and frontend
sessions. Catalogue previews do not bulk-preload prices: a typical inventory
plus Armory catalogue requires hundreds of public Market searches, which Steam
rejects with HTTP 429 and which previously delayed refreshes by up to a minute.
Container-context previews additionally calculate
base item odds by assigning adjacent rarity tiers a 5:1 probability ratio and
dividing each tier evenly among its resolved items. Eligible weapon finishes
show the separate 10% StatTrak™ share of their base item probability.

Inventory refresh fetches the live item schema, English localization, and image
index concurrently. After the GC-owned items arrive, schema/image work and the
Steam inventory-description overlay also proceed concurrently. The backend
updates the snapshot message at each real processing boundary; while a refresh
is active, the frontend polls that lightweight snapshot and displays the
reported stage with elapsed time.

Historical category-first wear probabilities and the subsequent paint-kit
float-cap transform are kept in the client valuation utilities for container
expected-value/ROI calculations. They are not presented as another set of
per-item opening odds in the preview UI. See
[`trade-up-float-and-paint-seed-distribution.md`](trade-up-float-and-paint-seed-distribution.md)
for the empirical basis and its confidence limits.

Preview identity keys remain canonical market names, not display labels.
Without an exact description overlay, weapon-finish previews link to Steam
Market search because a base schema name such as `Zeus x27 | Dragon Snore` does
not identify one wear-qualified listing. When an exact `market_hash_name` is
available, it is retained separately and links directly to that listing.
