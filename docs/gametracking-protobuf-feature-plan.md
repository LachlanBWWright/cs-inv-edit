# GameTracking Protobuf Feature Plan

This plan is for a follow-up agent. The goal is to review SteamTracking/GameTracking protobuf sources, identify the authoritative files for CS2 first, note comparable TF2 and Dota 2 files if available, then implement the CS2 feature-flagged operations from authoritative protobuf definitions.

Do not implement `enableStickerExtract`.

## Source Rules

- Treat `proto/vendor/gametracking-cs2/Protobufs/` and `SteamTracking/Protobufs` as authoritative for CS2 GC message IDs, protobuf message structures, and field numbers.
- Use `proto/vendor/gametracking-cs2/Protobufs/base_gcmessages.proto` for shared economy messages such as `CMsgOpenCrate`, `CMsgUseItem`, `CMsgApplyStatTrakSwap`, `CMsgApplyStrangePart`, and `CSOEconItem`.
- Use `proto/vendor/gametracking-cs2/Protobufs/econ_gcmessages.proto` for economy GC EMsg enums such as `k_EMsgGCOpenCrate`, `k_EMsgGCUseItemRequest`, `k_EMsgGCItemCustomizationNotification`, casket/storage messages, gift messages, and related item operation IDs.
- Use `proto/vendor/gametracking-cs2/Protobufs/gcsdk_gcmessages.proto` for base GC client session messages such as `CMsgClientHello`, `CMsgClientWelcome`, and `CMsgConnectionStatus`.
- Use `proto/vendor/gametracking-cs2/Protobufs/cstrike15_gcmessages.proto` for CS2-specific GC messages that still retain legacy CS:GO/CStrike15 naming.
- Do not infer binary layouts when a protobuf message exists in the submodule.
  Generate isolated descriptor sets directly from the vendored files with
  `scripts/generate-protos.sh`; do not introduce copied partial schemas.

## Repository Review Tasks

1. Review CS2 protobuf files:
   - `https://github.com/SteamTracking/GameTracking-CS2/blob/master/Protobufs/base_gcmessages.proto`
   - `https://github.com/SteamTracking/GameTracking-CS2/blob/master/Protobufs/econ_gcmessages.proto`
   - `https://github.com/SteamTracking/GameTracking-CS2/blob/master/Protobufs/gcsdk_gcmessages.proto`
   - `https://github.com/SteamTracking/GameTracking-CS2/blob/master/Protobufs/cstrike15_gcmessages.proto`
   - Any imported files needed to resolve field options or nested message dependencies.
2. Search SteamTracking repositories for TF2 and Dota 2 equivalents:
   - TF2 likely uses TF/econ/base GC protobufs and app-specific GC files where available.
   - Dota 2 likely uses Dota-specific GC protobufs plus shared base/econ files where available.
   - Record relevant repo paths and filenames only. Do not implement TF2 or Dota 2 behavior in this pass.
3. Update this document with any newly discovered authoritative file paths before implementing code.

## CS2 Feature Scope

Implement CS2 operations corresponding to these feature flags:

- `enableContainerOpening`
- `enableStorageMutations`
- `enableTradeups`
- `enableNameTags`
- `enableItemDeletion`
- `enableStatTrakSwap`
- `enableStrangeParts`
- `enableItemUse`
- `enableToolApplication`
- `enableGifting`
- `enableInventoryDebug`

Do not implement:

- `enableStickerExtract`

If `enableStickerExtract` remains in the UI/settings model, leave it disabled and document that it is intentionally excluded from implementation.

## Implementation Guidelines

- Keep data structures separate from behavior:
  - GameTracking descriptors exposed by `backend/internal/proto/gametracking/`
  - stable protocol aliases in `backend/internal/protocol/constants.go`
  - small handwritten encoders/decoders only when no authoritative protobuf message exists
  - service behavior in `backend/internal/app/service.go` or smaller operation-specific files if the service grows further
- Prefer generated protobuf encoders for all GC payloads with known message definitions.
- Each operation should return explicit success/failure data in `operations.Receipt.Result` where useful.
- Frontend UI should display backend GC errors and decoded response details near the relevant action, not as generic toasts.
- Frontend inventory cards and item detail surfaces should use CS2 rarity-colored borders matching the in-game white-to-red rarity progression. Use live schema/Steam metadata rarity values; do not invent color classes from names.
- Never return mock inventory items or fabricated names/images.

## CS2 Operation Mapping Checklist

For each operation, identify and document:

- EMsg request ID
- EMsg response/notification IDs
- request protobuf message
- response protobuf message or binary decoder if no protobuf exists
- required item IDs
- required tool/key/subject item relationship
- expected success response
- expected failure response
- frontend result fields to show
- potential container contents and source loot list name, where the operation involves a container
- rarity value and UI border color mapping

Initial likely mappings to verify:

- Container opening:
  - `k_EMsgGCOpenCrate`
  - `CMsgOpenCrate` from `base_gcmessages.proto`
  - `k_EMsgGCUnlockCrateResponse`
  - Container/capsule detail UI should show potential items found in the selected container before opening it.
  - Potential contents must come from live `items_game.txt` loot list data and localization, joined to item metadata/images where available.
  - Show potential contents with the same rarity border colors used by inventory items.
  - For keyless capsules, treat the selected capsule/container as `subject_item_id`; only send a `tool_item_id` when a required key/tool item is selected.
- Storage/casket mutations:
  - `k_EMsgGCCasketItemAdd`
  - `k_EMsgGCCasketItemExtract`
  - `k_EMsgGCCasketItemLoadContents`
  - relevant casket item protobuf messages from authoritative sources
- Name tags:
  - `k_EMsgGCNameItem`
  - `k_EMsgGCRemoveItemName`
  - source message definitions from authoritative protobufs
- Trade-ups:
  - `k_EMsgGCCraft`
  - `k_EMsgGCCraftResponse`
  - verify whether current binary craft encoder should be replaced by generated protobuf messages
- StatTrak swap:
  - `CMsgApplyStatTrakSwap` from `base_gcmessages.proto`
- Strange parts:
  - `CMsgApplyStrangePart` from `base_gcmessages.proto`
- Generic item use/tool application:
  - `CMsgUseItem`
  - `CMsgApplyToolToItem`
  - `CMsgApplyToolToBaseItem`
- Gifting:
  - verify current gift message against authoritative protobuf source before enabling.
- Item deletion:
  - verify destructive payload and response before enabling.

## Acceptance Criteria

- `AGENTS.md` and this plan list every authoritative protobuf source used.
- `proto/vendor/gametracking-cs2/Protobufs/` is available as a submodule, with source notes in `proto/vendor/README.md`.
- No local generated subset exists; runtime messages resolve from the pinned
  GameTracking descriptor set.
- `scripts/generate-protos.sh` regenerates successfully.
- `npm run build` passes.
- Implemented CS2 feature-flag operations do not use mock data, guessed binary payloads, or stale package wrappers.
- TF2 and Dota 2 findings are documented but not wired into runtime behavior.
