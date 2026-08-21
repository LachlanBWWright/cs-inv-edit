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
- `enableTf2Unboxing`
- `enableTf2Customization`

Ordinary crafting (`k_EMsgGCCraft`, `1002`) and crate unlocking (`k_EMsgGCUnlockCrate`, `1007`) have EMsg entries but no request protobuf in the current tracked source. They remain capture-gated even when their feature flag is enabled. Do not create guessed protobuf declarations or legacy structs. A sanitized, independently corroborated current-client fixture is required before either encoder can be enabled.

No automated test may connect to a live Steam account or send a live GC mutation. Protocol tests use generated-message round trips, sanitized fixtures, and the in-memory test transport only.

## Refresh procedure

1. Advance the TF2 tracker intentionally and record its commit in `docs/multi-game-economy-sources.md`.
2. Review `Protobufs/`, `tf/steam.inf`, `items_game.txt`, and `tf_english.txt` diffs.
3. Update source declarations, never generated output, and run `scripts/generate-protos.sh`.
4. Run offline backend, contract, frontend, typecheck, lint, and build checks.
5. Add a regression fixture for every new field, message, or compatibility rule.
