# Extended agent handoff: frontend completion and Go protobuf backend

## Mission

Complete the scaffold into a working desktop-first CS2 inventory tool with:

- one shared Solid/Tailwind frontend used by all wrappers,
- an Electron desktop wrapper that launches and talks to the local Go backend,
- a web wrapper that uses the same app package for safe/read-only companion views,
- a Go backend that owns Steam session state, CS2 Game Coordinator transport, protobuf encoding/decoding, operation queues, and validation gates.

You should make tangible implementation progress even where protocol confidence is incomplete. Low-confidence protocol paths must be isolated behind feature flags, test fixtures, and explicit validation harnesses rather than presented as production-ready.

## Current repo shape

Important files and directories:

```text
apps/
  desktop/
    src/electron/main.ts       Electron shell and Go sidecar launcher
    src/preload/index.ts       Narrow renderer bridge
    src/renderer/main.tsx      Desktop wrapper entry
  web/
    src/main.tsx               Web wrapper entry
backend/
  cmd/cs2-backend/main.go      Go backend entrypoint
  internal/app/service.go      Stub service
  internal/rpc/handler.go      HTTP/SSE API
packages/
  app/src/index.tsx            Shared Solid/Tailwind app UI
  app/src/styles.css           Tailwind entry only
  contracts/src/index.ts       Shared TypeScript DTOs
electron-web-go-plan.md        Architecture plan
cs-solid.md                    Detailed protobuf/Electron research
deep-research-report.md        Risk-focused protocol research
```

Before changing code, read:

1. `agent-handoff-implementation-plan.md`
2. `electron-web-go-plan.md`
3. `deep-research-report.md`
4. `cs-solid.md`

Treat `deep-research-report.md` as the risk baseline when it conflicts with `cs-solid.md`.

## Non-negotiable architecture decisions

1. Keep a single shared frontend app in `packages/app`.
2. Do not recreate separate desktop and web UIs.
3. Use Tailwind utility classes in Solid components.
4. Do not add wrapper-specific CSS except tiny platform bootstrapping if unavoidable.
5. Keep Steam credentials, refresh tokens, cookies, protobuf encoding, and GC sockets out of the renderer.
6. Electron talks to Go through domain commands, not raw protobuf messages.
7. JavaScript receives Steam item IDs as strings, never as numbers.
8. Go may use `uint64` internally for item IDs.
9. Mutation success must be based on post-operation inventory/shared-object reconciliation, not successful outbound sends.
10. Low-confidence operations are allowed in code only behind feature flags and validation warnings.

## Preferred development commands

Use these often:

```bash
npm install
npm run check
npm run build:backend
npm run dev:desktop
npm run dev:web
go test ./backend/...
```

If you add Go packages from inside `backend`, run:

```bash
cd backend
go mod tidy
```

Keep generated/build artifacts out of commits unless explicitly required. `dist/`, `bin/`, and `node_modules/` are ignored.

## Phase 1: Make the shared frontend feel like a real app

Goal: complete the main UI skeleton so the app can support inventory, storage, trade-ups, operations, and settings without protocol work being finished.

Work in:

- `packages/app/src/index.tsx`
- add subcomponents under `packages/app/src/components/`
- add state/helpers under `packages/app/src/state/` or `packages/app/src/lib/`
- update `packages/contracts/src/index.ts`

Required frontend views:

1. Inventory
   - searchable item grid
   - kind filter
   - selected item details panel
   - item ID shown as mono string
   - badges for sticker, storage, casket linkage, and unsupported/unknown fields

2. Storage
   - list storage units
   - show storage count
   - load contents action
   - move item in/out actions using backend operation receipts
   - clear pending/completed/error states

3. Trade-ups
   - selection area for exactly 10 items
   - recipe/tier placeholder validation
   - preview panel
   - disabled execution until backend says validation passed
   - destructive action confirmation UX

4. Stickers
   - read-only sticker display first
   - extract sticker control behind a warning state
   - remove/apply controls hidden or feature-flagged
   - visible “requires live validation” copy in development builds only

5. Operations
   - operation log
   - receipt state: queued, awaiting confirmation, completed, failed
   - raw operation ID
   - timestamps
   - retry only for safe operations

6. Settings
   - backend health
   - Steam connection placeholder
   - feature flags
   - local backend URL
   - protocol validation mode / sacrificial account mode

Frontend implementation guidance:

- Split `App` into layout + route/view components.
- Use simple local state first; do not introduce a router unless it materially helps.
- Keep wrapper-specific differences as props such as `platform`.
- Use Tailwind classes only.
- Use compact operational UI, not a marketing/landing page.
- Make mobile responsive, but the core target is desktop.
- Add loading and error states for every backend call.
- Keep controls disabled when backend health is offline.

Suggested component structure:

```text
packages/app/src/
  index.tsx
  components/
    AppShell.tsx
    Sidebar.tsx
    HealthBadge.tsx
    InventoryView.tsx
    InventoryGrid.tsx
    ItemDetailsPanel.tsx
    StorageView.tsx
    TradeUpView.tsx
    StickersView.tsx
    OperationsView.tsx
    SettingsView.tsx
  lib/
    backend.ts
    format.ts
    featureFlags.ts
```

Update shared contracts as needed. Keep them plain JSON-compatible.

## Phase 2: Make wrappers thin and correct

Desktop wrapper:

- `apps/desktop/src/electron/main.ts`
- `apps/desktop/src/preload/index.ts`
- `apps/desktop/src/renderer/main.tsx`

Tasks:

1. Ensure Electron launches the Go backend from `bin/cs2-backend`.
2. Keep a clear error if the backend binary is missing.
3. Add backend readiness polling before the renderer starts making calls.
4. Expose only typed methods through preload.
5. Add methods for all frontend commands:
   - `health`
   - `inventory`
   - `refreshInventory`
   - `submitOperation`
   - `events`
   - later: `connectSteam`, `submitSteamGuard`, `disconnectSteam`
6. Do not expose raw `ipcRenderer`.

Web wrapper:

- `apps/web/src/main.tsx`

Tasks:

1. Keep it as a thin fetch client into the backend.
2. Default to `http://127.0.0.1:7331`.
3. Do not add mutation-only web affordances unless they require local confirmation.
4. Web can show read-only and diagnostic views.

## Phase 3: Expand Go API contracts

Goal: replace ad hoc stub endpoints with stable domain endpoints.

Work in:

- `backend/internal/rpc/handler.go`
- `backend/internal/app/service.go`
- new files under `backend/internal/domain/`, `backend/internal/inventory/`, `backend/internal/operations/`

Add Go domain types matching TS contracts:

```go
type ConnectionStatus struct {
    State string `json:"state"`
    Detail string `json:"detail,omitempty"`
}

type OperationReceipt struct {
    OperationID string `json:"operationId"`
    Type string `json:"type"`
    State string `json:"state"`
    CreatedAt string `json:"createdAt"`
}

type OperationEvent struct {
    OperationID string `json:"operationId"`
    Type string `json:"type"`
    State string `json:"state"`
    Message string `json:"message,omitempty"`
    CreatedAt string `json:"createdAt"`
}
```

Add endpoints:

```text
GET  /health
GET  /inventory
POST /inventory/refresh
GET  /events
POST /steam/connect
POST /steam/guard
POST /steam/disconnect
POST /storage/load
POST /storage/move-in
POST /storage/move-out
POST /tradeups/preview
POST /tradeups/execute
POST /stickers/extract
POST /stickers/remove
POST /stickers/apply
GET  /settings
POST /settings
```

Initially, these may return scaffolded receipts/errors, but the route shape should be stable.

Add tests for:

- JSON request/response contracts,
- operation receipt creation,
- invalid request handling,
- item ID validation as string decimal uint64,
- feature-flag blocking.

## Phase 4: Protobuf scaffold in Go

Goal: create the Go protobuf pipeline and low-confidence protocol code in a quarantined, testable form.

Add:

```text
proto/
  cs2_item_subset.proto
backend/internal/proto/
  generated/
  encode.go
  messages.go
scripts/
  generate-protos.sh
```

Start with this subset, copied from the plans:

```proto
syntax = "proto2";

package cs2item;

option go_package = "cs-inv-edit/backend/internal/proto/generated;cs2pb";

message CMsgApplySticker {
  optional uint64 sticker_item_id = 1;
  optional uint64 item_item_id = 2;
  optional uint32 sticker_slot = 3;
  optional uint32 baseitem_defidx = 4;
  optional float sticker_wear = 5;
  optional float sticker_rotation = 6;
  optional float sticker_scale = 7;
  optional float sticker_offset_x = 8;
  optional float sticker_offset_y = 9;
  optional float sticker_offset_z = 10;
  optional float sticker_wear_target = 11;
}

message CMsgGCItemCustomizationNotification {
  repeated uint64 item_id = 1;
  optional uint32 request = 2;
  repeated uint64 extra_data = 3;
}

message CMsgCasketItem {
  optional uint64 casket_item_id = 1;
  optional uint64 item_item_id = 2;
}

message CMsgSetItemPositions {
  message ItemPosition {
    optional uint32 legacy_item_id = 1;
    optional uint32 position = 2;
    optional uint64 item_id = 3;
  }
  repeated ItemPosition item_positions = 1;
}
```

Generate Go code with:

```bash
protoc \
  --go_out=backend/internal/proto/generated \
  --go_opt=paths=source_relative \
  --proto_path=proto \
  proto/cs2_item_subset.proto
```

If `protoc-gen-go` is missing:

```bash
cd backend
go install google.golang.org/protobuf/cmd/protoc-gen-go@latest
```

Implement encoders:

- `EncodeCasketItem(casketID, itemID uint64) ([]byte, error)`
- `EncodeLoadCasketContents(casketID uint64) ([]byte, error)`
- `EncodeExtractSticker(itemID uint64, slot uint32) ([]byte, error)`
- `EncodeRemoveSticker(itemID uint64, slot uint32) ([]byte, error)` behind feature flag
- `EncodeApplySticker(input ApplyStickerInput) ([]byte, error)` behind feature flag and warning
- `EncodeSetItemPositions(...) ([]byte, error)`

Use constants:

```go
const (
    AppIDCS2 = 730

    EMsgCraft = 1002
    EMsgCraftResponse = 1003
    EMsgSetItemPositions = 1077
    EMsgApplySticker = 1086
    EMsgItemCustomizationNotification = 1090
    EMsgCasketItemAdd = 1092
    EMsgCasketItemExtract = 1093
    EMsgCasketItemLoadContents = 1094

    CustomizationRemoveSticker = 1053
    CustomizationExtractSticker = 1054
    CustomizationEncapsulateSticker = 1055
    CustomizationApplySticker = 1086
)
```

Important confidence notes:

- `CMsgCasketItem` for storage add/extract/load is high confidence.
- `Craft (1002)` is raw little-endian binary, not protobuf, high confidence as a shape but still needs live validation.
- `ExtractSticker (1054)` using `CMsgGCItemCustomizationNotification` is medium/high confidence.
- `RemoveSticker (1053)` using the same shape is inferred and must be feature-flagged.
- `ApplySticker (1086)` has a protobuf message shape in tracked dumps, but the live current payload contract is not fully trusted. Implement encoder and tests, but keep execution disabled by default.

## Phase 5: Raw craft/trade-up encoder

Add:

```text
backend/internal/protocol/craft.go
backend/internal/protocol/craft_test.go
```

Implement:

```go
func EncodeCraftRequest(recipe int16, itemIDs []uint64) ([]byte, error)
func DecodeCraftResponse(body []byte) (CraftResponse, error)
```

Expected request shape:

```text
offset  size  type      meaning
0       2     int16le   recipe
2       2     int16le   item_count
4       8*n   uint64le  item IDs
```

Expected response shape from current research:

```text
offset  size  type      meaning
0       2     int16le   recipe
2       4     uint32le  reserved zero
6       2     uint16le  gained item count
8       8*n   uint64le  gained item IDs
```

Validation:

- require exactly 10 item IDs for normal trade-up execution,
- reject duplicate IDs,
- reject non-decimal item IDs before conversion,
- keep recipe validation separate and extensible.

## Phase 6: Steam/GC transport abstraction

Do not wire real Steam protocol calls directly into app service code.

Create an interface:

```go
type GCClient interface {
    Connect(ctx context.Context) error
    Close() error
    SendToGC(ctx context.Context, appID uint32, emsg uint32, body []byte) error
    Events() <-chan GCEvent
    State() GCConnectionState
}
```

Add two implementations:

1. `MockGCClient`
   - default implementation for development and tests,
   - emits fake inventory and operation events,
   - deterministic.

2. `SteamGCClient`
   - real implementation placeholder,
   - may initially return `not implemented`,
   - behind build tag or feature flag until selected library is added.

Agent instruction: If you cannot confidently choose or integrate a Go Steam client library, still complete the interface, mock implementation, operation queue, and encoder tests. Do not block frontend/backend progress on real Steam connectivity.

## Phase 7: Operation queue and reconciliation

Build operation execution as a state machine.

States:

```text
queued
validating
encoded
sent
awaiting_gc_confirmation
reconciling_inventory
completed
failed
blocked_by_feature_flag
requires_validation
```

Each operation should have:

- operation ID,
- type,
- input summary,
- feature flag requirements,
- encoded message metadata `(appid, emsg, bodyHash)`,
- timeout,
- reconciliation predicate,
- final result or error.

Storage reconciliation examples:

- move in: expect `itemRemoved` and/or `CasketAdded`.
- move out: expect `itemAcquired` and/or `CasketRemoved`.
- load contents: expect `CasketContents` and inventory cache update.

Do not update frontend inventory optimistically for destructive operations.

## Phase 8: Inventory model and fixtures

Create a Go inventory domain model independent of protobuf/generated structs.

```go
type Item struct {
    ID string `json:"id"`
    Name string `json:"name"`
    Kind string `json:"kind"`
    Defindex *uint32 `json:"defindex,omitempty"`
    PaintWear *float64 `json:"paintWear,omitempty"`
    Stickers []Sticker `json:"stickers,omitempty"`
    StorageCount *uint32 `json:"storageCount,omitempty"`
    CasketID *string `json:"casketId,omitempty"`
}
```

Add fixture files under:

```text
backend/testdata/
  inventory_snapshot.json
  casket_contents_event.json
  craft_response.bin
```

Use fixtures in tests and frontend development until real GC data is available.

## Phase 9: Feature flags and low-confidence protocol policy

Add settings:

```json
{
  "enableStorageMutations": true,
  "enableTradeups": false,
  "enableStickerExtract": false,
  "enableStickerRemove": false,
  "enableStickerApply": false,
  "validationMode": true,
  "sacrificialAccountMode": true
}
```

Default flags:

- storage mutations: enabled only against mock backend until real GC is wired,
- trade-ups: disabled,
- sticker extract: disabled,
- sticker remove: disabled,
- sticker apply: disabled.

The frontend should show disabled controls with clear development-only reasons. Production UI should not expose unsupported actions as normal buttons.

## Phase 10: Validation harness

Even without full confidence in protobufs, build a harness that makes validation possible.

Add a backend endpoint or CLI command to encode but not send operations:

```bash
cs2-backend encode storage.move-in --casket-id ... --item-id ...
cs2-backend encode sticker.apply --json input.json
cs2-backend encode tradeup --json input.json
```

Output:

```json
{
  "appid": 730,
  "emsg": 1092,
  "bodyHex": "...",
  "bodySha256": "...",
  "confidence": "high",
  "requiresLiveValidation": false
}
```

For low-confidence ops, output:

```json
{
  "confidence": "low",
  "requiresLiveValidation": true,
  "reason": "ApplySticker payload contract not yet confirmed against current live client"
}
```

This lets another session compare encoded bytes against captured official-client traffic without changing app code.

## Suggested implementation order

1. Refactor frontend into views/components while preserving the current backend client prop model.
2. Expand shared TS contracts.
3. Expand Go HTTP API routes with stubbed receipts.
4. Add operation log and feature flags to frontend.
5. Add protobuf subset and generation script.
6. Add Go protobuf encoders and golden tests.
7. Add raw craft encoder/decoder and tests.
8. Add `GCClient` interface and mock implementation.
9. Add operation queue using mock GC events.
10. Wire storage UI to mocked queue and reconciliation.
11. Add validation harness for encoded bytes.
12. Only then investigate real Steam/GC transport.

## Acceptance criteria for the extended session

By the end, aim for:

- `npm run check` passes.
- The shared app has distinct Inventory, Storage, Trade-ups, Stickers, Operations, and Settings views.
- Desktop and web wrappers render the same app package.
- Tailwind utility classes are used; no real component CSS files.
- Go backend has stable route contracts for planned operations.
- Protobuf subset exists and Go code can be generated.
- Storage, sticker customization, apply-sticker, positions, and craft encoders exist with tests.
- Low-confidence operations are clearly marked in code and UI.
- A mock GC client can drive operation state changes.
- Real Steam/GC transport is isolated behind an interface, even if not implemented.

## What not to do

- Do not fork the UI into separate desktop and web apps.
- Do not put Steam tokens in renderer state.
- Do not use JavaScript numbers for item IDs.
- Do not claim sticker apply/remove are production-ready without live validation.
- Do not block all progress because the real Steam transport is uncertain.
- Do not make a decorative landing page.
- Do not add custom CSS classes for ordinary styling when Tailwind utilities cover it.
- Do not update inventory optimistically for destructive operations.
