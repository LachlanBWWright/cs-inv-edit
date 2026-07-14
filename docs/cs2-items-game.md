# CS2 `items_game.txt` Metadata

`items_game.txt` is CS2's live economy schema file. This app fetches it from the public SteamDatabase GameTracking-CS2 mirror during inventory refresh so item names and categories do not depend on stale bundled data.

Source:

```text
https://raw.githubusercontent.com/SteamDatabase/GameTracking-CS2/master/game/csgo/pak01_dir/scripts/items/items_game.txt
```

Localization source:

```text
https://raw.githubusercontent.com/SteamDatabase/GameTracking-CS2/master/game/csgo/pak01_dir/resource/csgo_english.txt
```

## Documentation Sources

Keep this document in this repository at:

```text
docs/cs2-items-game.md
```

When updating it, use the live tracked CS2 files as the source of truth:

```text
https://github.com/SteamDatabase/GameTracking-CS2/tree/master/game/csgo/pak01_dir/scripts/items
https://github.com/SteamDatabase/GameTracking-CS2/tree/master/game/csgo/pak01_dir/resource
```

The raw files used by the backend are:

```text
https://raw.githubusercontent.com/SteamDatabase/GameTracking-CS2/master/game/csgo/pak01_dir/scripts/items/items_game.txt
https://raw.githubusercontent.com/SteamDatabase/GameTracking-CS2/master/game/csgo/pak01_dir/resource/csgo_english.txt
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
- `paint_kits`, including paint kit localization tokens such as `description_tag`.
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
3. Fetch latest `items_game.txt`.
4. Fetch latest `csgo_english.txt`.
5. Parse Valve KeyValues.
6. Merge item prefabs into concrete item definitions.
7. Resolve localization tokens.
8. Join by `def_index`.
9. If the GC item has paint kit attribute `6`, join it to `paint_kits`.
10. Join the resulting `[paint_kit]weapon` key to `item_sets` for collection membership and contents.
11. For containers, recursively resolve `loot_list_name` through `client_loot_lists`; this is descriptive metadata and does not predict an opening result.

## Important Attribute IDs

- `6`: paint kit ID.
- `8`: paint wear float bits.

These IDs are decoded from `CSOEconItem.attribute`; do not infer paint names from defindex alone.

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
overlay may fall back to an exact, case-insensitive display/market-name match
only when that name identifies one unique Steam description. Ambiguous names
are deliberately left unmatched. This is particularly important for
non-marketable collectible badges, whose valid CDN icon token is available in
the Steam description but not through market search.

Permanent definition-level non-tradability is read from the fully merged
`items_game` `capabilities.can_trade = 0` value. Instance-level tradability and
temporary `Tradable After` timestamps continue to come from the Steam inventory
description overlay; a positive schema capability never overrides an instance
trade lock.

If this request fails, inventory should still render with schema-derived names and include a diagnostic that Steam inventory description metadata was unavailable.

## Images

Do not fabricate image URLs from `image_inventory`. The field is useful, but it is not the final URL shape needed by the frontend.

Use Steam description `icon_url_large` or `icon_url` when available. These are usually CDN path tokens, not complete URLs. Expand them with:

```text
https://community.fastly.steamstatic.com/economy/image/<icon_url_token>
```

If no Steam description metadata is available, omit `imageUrl` rather than returning broken image links.

## Failure Policy

If live schema fetch or parsing fails, inventory refresh should fail with an explicit backend error. It should not silently fall back to fake display names like `CS2 item #970`.

# Armory catalogue

The universal Armory catalogue is read from the live `items_game.txt` current
`seasonaloperations` entry whose `redeemable_goods` value is `xpshop`, matching
Panorama's `MissionsAPI.GetSeasonalOperationRedeemableGoodsCount/Schema` path.
The GC `XpShop` SOCache object (`CSOAccountXpShop`) supplies only
account-specific generation, star balance, and XP tracks. `XpShopBids` objects
are active user bids and are not the universal offer catalogue.
The object may be embedded in `ClientWelcome.outofdate_subscribed_caches` or
arrive immediately afterward in `k_ESOMsg_CacheSubscribed` (message 24); the
Armory refresh waits for both protocol-defined delivery paths.
The numeric SO type is not assumed to be stable. Candidate objects are accepted
only when their wire fields exactly match fields 1–3 of `CSOAccountXpShop`, all
values fit their authoritative uint32 types, `generation_time` is present, and
the candidate is unique. Inventory type 1 and multi-object cache types are
excluded before decoding.
