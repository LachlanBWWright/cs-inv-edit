# TF2 economy schema and protocol sources

TF2 ownership comes only from the authenticated AppID `440` Game Coordinator `CSOEconItem` SOCache. Steam Community inventory responses are metadata overlays and never add owned items.

## Live tracked metadata

The metadata provider refreshes these GameTracking-TF2 files:

- `tf/scripts/items/items_game.txt`
- `tf/resource/tf_english.txt`

The schema parser resolves prefab inheritance and extracts definition identity, localized presentation, quality, classes, slots, equip regions, capabilities, tags, craft classification, tool type, static attributes, levels, collection membership, and action-oriented item classification. Instance fields and raw attributes remain sourced from GC-owned `CSOEconItem` objects.

Steam `icon_url` or `icon_url_large` tokens from exact Community descriptions are the only supported remote image source. `image_inventory` is a game material key and is never converted into a guessed CDN URL.

## Protocol definitions

Use `proto/vendor/gametracking-tf2/Protobufs/`:

- `base_gcmessages.proto` for `CSOEconItem` and protobuf-backed economy requests;
- `econ_gcmessages.proto` for TF2 economy EMsg values and newer economy bodies;
- `gcsdk_gcmessages.proto` and `gcsystemmsgs.proto` for GC session/SOCache messages;
- `tf_gcmessages.proto` for TF2-specific messages;
- `tf_proto_def_messages.proto` for tracked proto-definition structures.

The backend generates an isolated descriptor set directly from the pinned TF2
GameTracking files and consumes it through `dynamicpb`. No local partial schema
is maintained. Run `scripts/generate-protos.sh` after updating the pinned
tracker revision.

## Permanent-operation safety

All TF2 mutations are backend-gated and default off:

- `enableTf2Loadouts`
- `enableTf2ItemUse`
- `enableTf2Tools`
- `enableTf2Crafting`
- `enableTf2Tradeups`
- `enableTf2Unboxing`
- `enableTf2Customization`

TF2 crafting is split across several protocol families:

- Ordinary recipe crafting uses the legacy raw `k_EMsgGCCraft` (`1002`) frame: signed recipe ID, item count, and little-endian item IDs.
- Item-grade trade-ups use protobuf `CMsgCraftCollectionUpgrade` on `k_EMsgGCCraftCollectionUpgrade` (`2567`).
- Halloween offerings use protobuf `CMsgCraftHalloweenOffering` on `k_EMsgGCCraftHalloweenOffering` (`2568`).
- Civilian Stat Clock crafting uses protobuf `CMsgCraftCommonStatClock` on `k_EMsgGCCraftCommonStatClock` (`2574`).

Standard recipe crafting is behind `enableTf2Crafting`. Collection trade-ups, Halloween offerings, and Civilian Stat Clock crafting are behind the separate `enableTf2Tradeups` flag. The app supports only the explicit standard recipe IDs `3–11` (excluding disabled `12`) and `13–15`; wildcard recipe selection and item-specific blueprints are not supported. All enabled operations validate against the authoritative GC-owned inventory and wait for SOCache reconciliation. Crate unlocking (`k_EMsgGCUnlockCrate`, `1007`) remains capture-gated because the current tracked source does not define its request body.

No automated test may connect to a live Steam account or send a live GC mutation. Protocol tests use generated-message round trips, sanitized fixtures, and the in-memory test transport only.

## Refresh procedure

1. Advance the TF2 tracker intentionally and record its commit in `docs/multi-game-economy-sources.md`.
2. Review `Protobufs/`, `tf/steam.inf`, `items_game.txt`, and `tf_english.txt` diffs.
3. Update source declarations, never generated output, and run `scripts/generate-protos.sh`.
4. Run offline backend, contract, frontend, typecheck, lint, and build checks.
5. Add a regression fixture for every new field, message, or compatibility rule.
