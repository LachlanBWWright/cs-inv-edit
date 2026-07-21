# Modularization and Regression-Safety Plan

## Purpose

This plan restructures the project into smaller, responsibility-focused modules without changing observable behavior. The work should be incremental: establish regression coverage first, move one capability at a time, and keep the repository buildable and releasable after every phase.

The plan focuses on the active workspace application under `apps/` and `packages/`, and the Go backend under `backend/`. The legacy root `src/` tree must be classified before it is changed or removed.

## Goals

- Give each module one clear reason to change.
- Keep platform-specific behavior in the web, Electron, and Capacitor shells.
- Keep shared UI and application behavior independent of its transport.
- Replace broad dependencies with small, consumer-owned interfaces.
- Preserve API payloads, operation behavior, inventory decoding, and user-visible states throughout the refactor.
- Make every extraction independently reviewable and reversible.
- Ensure all maintained source is linted, typechecked, tested, and built in CI.

## Non-goals

- Changing GC message layouts, message IDs, or generated protobuf bindings.
- Redesigning the UI or changing feature semantics.
- Replacing `neverthrow` or introducing exception-based TypeScript error handling.
- Rewriting the backend in a different framework.
- Combining modularization with metadata-source, market-overlay, or inventory-authority changes.
- Moving generated, vendored, or submodule content by hand.

## Current structure and pressure points

The repository already has useful top-level boundaries:

```text
apps/
  desktop/             Electron shell and backend process adapter
  web/                 Browser/WASM shell and HTTP adapter
packages/
  app/                 Shared SolidJS application and UI
  contracts/           Shared TypeScript DTOs, requests, and Zod schemas
backend/
  cmd/                 Native and WASM entry points
  internal/app/        Application orchestration and mutable state
  internal/domain/     Domain data
  internal/econ/       Economy metadata and overlays
  internal/operations/ Operation receipts and queueing
  internal/protocol/   GC operation encoding
  internal/rpc/        HTTP/WebSocket transport
  internal/transport/  Steam and GC transport
```

The main modularity risks are:

1. `packages/app/src/app-controller.tsx` owns navigation, all resources, polling, authentication, account persistence, refresh workflows, operation settlement, and notifications.
2. `packages/app/src/AppView.tsx` has a wide prop surface spanning nearly every feature.
3. `backend/internal/app.Service` owns most runtime dependencies and mutable feature state behind one mutex.
4. `transport.GCClient` exposes authentication, connection state, inventory, store, tracing, and raw transport operations through one interface.
5. `backend/internal/rpc/handler.go` is the registration and implementation point for a large number of unrelated routes.
6. The legacy root `src/` application coexists with the workspace application and is not covered consistently by active build and lint rules.
7. Typecheck and lint coverage is not yet uniform across the shared packages and platform adapters.

## Required safety rules

These rules apply to every phase:

- Add or strengthen tests before moving behavior.
- Do not change public payload shapes during a pure extraction.
- Do not change protobuf definitions or generated bindings as part of this plan.
- Keep GC protobuf inventory authoritative for owned items.
- Use `Result`, `ResultAsync`, `fromThrowable`, or `fromPromise` at every TypeScript boundary that can fail.
- Do not introduce `try`/`catch` in TypeScript.
- Prefer discriminated unions and exhaustive matching for feature state.
- Keep files below 400 effective lines and nesting at no more than three levels by extracting responsibility, not by disabling rules.
- Keep each pull request limited to one boundary or one feature extraction.
- Run the full regression suite after every extraction, even when targeted tests pass.

## Phase 0: Record the baseline

### Work

1. Capture the current commands, supported platforms, feature flags, and API routes.
2. Classify the root `src/` tree as one of:
   - obsolete code to remove;
   - a maintained prototype to turn into an explicit workspace package; or
   - a required application entry point to migrate deliberately.
3. Record representative backend responses for all read endpoints using deterministic test fixtures.
4. Record operation state transitions for successful, failed, disconnected, disabled, and validation-only cases.
5. Record representative frontend states for disconnected, loading, empty, ready, and error conditions.

### Tests added before restructuring

- An RPC route inventory test that asserts every documented route is registered and rejects unsupported methods consistently.
- Contract tests that encode representative Go responses to JSON and validate them with the corresponding Zod schema.
- Characterization tests for controller resource loading, refresh behavior, error presentation, and operation settlement.
- Adapter tests for web HTTP/WASM and Electron IPC success, schema-failure, network/process-failure, and cancellation paths.
- A smoke test for each maintained entry point.

Avoid broad visual snapshots. Prefer assertions on roles, labels, state, emitted requests, operation receipts, and stable DTO fields. Use small golden JSON fixtures only at the Go-to-TypeScript contract boundary, where exact compatibility matters.

### Exit criteria

- The legacy root `src/` tree has a documented disposition.
- Every public backend response type has at least one valid contract fixture.
- Critical failure states have regression tests.
- The full baseline suite passes on a clean checkout.

## Phase 1: Make quality gates cover the whole workspace

### Work

1. Add `typecheck`, `lint`, `test`, and `build` scripts to each maintained workspace package where applicable.
2. Change root scripts to execute package gates recursively.
3. Typecheck both Electron configurations:
   - renderer configuration;
   - main/preload NodeNext configuration.
4. Typecheck the web shell and its WASM adapter.
5. Stop excluding maintained renderer and preload code from lint. Add appropriate environment globals/configuration instead.
6. Keep generated output, dependencies, vendored code, and submodules excluded.
7. Add repository checks for:
   - files approaching 400 lines;
   - excessive nesting;
   - generated files changed without source proto changes, where practical;
   - stale or invalid README commands.

### Proposed root gates

```text
pnpm lint          all maintained TypeScript
pnpm typecheck     contracts, app, web, desktop renderer, desktop main/preload
pnpm test:frontend all TypeScript unit, contract, component, and adapter tests
pnpm test:backend  all Go packages, including race-sensitive packages where feasible
pnpm build         packages, platform shells, and native backend
pnpm check         lint + typecheck + tests + build
```

Run `go test -race` for stateful backend packages in CI, at minimum `internal/app`, `internal/operations`, `internal/rpc`, and `internal/transport`. If Steam-dependent tests cannot run under the race detector, isolate them behind fakes instead of skipping the package.

### Exit criteria

- No maintained TypeScript source is silently excluded from typecheck or lint.
- CI runs the same principal gate as local development.
- Web, desktop renderer, desktop preload/main, native backend, and WASM backend compile independently.

## Phase 2: Stabilize contracts and transport adapters

Contracts form the seam that lets frontend and backend refactors proceed independently.

### Target structure

```text
packages/contracts/src/
  common.ts
  inventory.ts
  economy-inventory.ts
  armory.ts
  store.ts
  trades.ts
  operations.ts
  settings.ts
  auth.ts
  pricing.ts
  schemas/
    inventory.ts
    economy-inventory.ts
    armory.ts
    store.ts
    trades.ts
    operations.ts
    settings.ts
    auth.ts
    pricing.ts
    index.ts
  index.ts
```

### Work

1. Split large request and schema modules by capability without changing exported names.
2. Keep a compatibility barrel in `index.ts` so consumers can migrate gradually.
3. Derive TypeScript types from Zod schemas where the schema is the runtime authority and doing so does not conflict with existing discriminated DTO design.
4. Replace stringly typed operation inputs with a discriminated request map where endpoints have known request types.
5. Split `AppBackendClient` into consumer-owned capability interfaces:

```text
HealthBackend
InventoryBackend
EconomyInventoryBackend
AuthBackend
ArmoryBackend
StoreBackend
TradeBackend
OperationBackend
SettingsBackend
PricingBackend
```

The platform adapters can implement the intersection type used by the application root.

### Regression tests

- Each schema accepts the baseline fixture produced by Go.
- Each schema rejects missing required fields, invalid discriminants, and invalid numeric ranges.
- Every web and Electron client method maps to the same URL/IPC operation, HTTP method, request body, response schema, and error category as before.
- Public barrel exports remain import-compatible until all consumers migrate.
- Compile-time tests assert that the combined backend client satisfies every capability interface.

### Exit criteria

- Contracts are organized by feature and contain no platform code.
- Platform adapters implement small feature interfaces.
- All existing payload fixtures remain valid.

## Phase 3: Split the frontend controller by feature

### Target structure

```text
packages/app/src/
  app/
    App.tsx
    AppView.tsx
    createAppController.ts
    navigation.ts
  features/
    auth/
      controller.ts
      AccountView.tsx
      account-storage.ts
    inventory/
      controller.ts
      InventoryView.tsx
      selectors.ts
    economy-inventory/
      controller.ts
      GameInventoryView.tsx
    armory/
      controller.ts
      ArmoryView.tsx
    store/
      controller.ts
      StoreView.tsx
    trades/
      controller.ts
      TradesView.tsx
    operations/
      controller.ts
      OperationsView.tsx
    settings/
      controller.ts
      SettingsView.tsx
  shared/
    components/
    formatting/
    result/
```

The exact directory names may be adjusted, but ownership must remain feature-first. A component used by one feature stays with that feature; only genuinely cross-feature primitives belong under `shared/`.

### Extraction order

Use the following order to limit coupling:

1. Pure navigation and view-selection logic.
2. Toast/notification state.
3. Settings resource and save workflow.
4. Operations, receipts, events, and settlement.
5. Inventory and multi-game inventory refresh workflows.
6. Store, armory, and trades workflows.
7. Authentication, account storage, status polling, and cleanup.

After extraction, the root controller should only compose feature controllers and expose the selected feature model to the view.

### View boundary

Replace the single very-wide `AppViewProps` interface with grouped models:

```ts
interface AppViewProps {
  shell: ShellViewModel;
  auth: AuthViewModel;
  inventory: InventoryViewModel;
  economyInventory: EconomyInventoryViewModel;
  operations: OperationsViewModel;
  store: StoreViewModel;
  armory: ArmoryViewModel;
  trades: TradesViewModel;
  settings: SettingsViewModel;
}
```

Do not expose the full backend client or feature controller through UI context. Components should receive only the state and commands they consume.

### Regression tests

For every extracted controller, add tests for:

- initial state;
- successful load and refresh;
- backend `Err` mapping to user-visible state;
- repeated refresh and stale response ordering;
- optional backend capability unavailable;
- cleanup of timers, WebSocket listeners, and effects;
- no update after cleanup/unmount;
- feature-flag transitions;
- operation receipt and toast behavior;
- preservation of the previous snapshot while a refresh is loading, where currently expected.

Use a typed fake implementing only the feature capability interface. Return `okAsync` and `errAsync`; do not mock rejecting promises as the normal error path.

Add integration tests at the composed `App` boundary for these user journeys:

1. Connect or select an account, then load inventory.
2. Refresh inventory and preserve selection when the item still exists.
3. Submit an operation, observe its receipt, then reconcile inventory.
4. Load and refresh store data.
5. Start a purchase and reconcile its session.
6. Load TF2/Dota 2 inventory according to feature flags.
7. Disconnect and verify account-scoped state is cleared or retained exactly as before.

### Exit criteria

- No feature controller approaches 400 lines.
- Feature controllers depend only on their capability interfaces.
- The root controller is composition code rather than business workflow code.
- All timers and subscriptions have explicit lifecycle tests.

## Phase 4: Split backend application services

### Target shape

```text
backend/internal/app/
  application.go          Composition root/facade
  auth/service.go
  inventory/service.go
  economyinventory/service.go
  armory/service.go
  store/service.go
  trades/service.go
  operations/service.go
  settings/service.go
```

Go `internal` package rules may make a flatter layout more practical. If subpackages create cycles or force domain leakage, retain one `app` package but use separate unexported service structs with explicit dependencies. The important outcome is separate state ownership and narrow collaboration, not directory count.

### Work

1. Inventory all fields currently held by `app.Service` and assign one owner to each field.
2. Introduce feature services behind the existing `Service` facade so RPC behavior remains unchanged.
3. Move read-only methods first, then refresh workflows, then mutation workflows.
4. Replace the single broad mutex with feature-owned synchronization.
5. Pass clocks, ID generators, and external providers as dependencies where deterministic testing benefits.
6. Keep process construction in `NewService` or a dedicated composition root; feature packages must not instantiate real Steam or HTTP clients themselves.
7. Preserve operation ordering, connection checks, feature-flag enforcement, and receipt state transitions exactly.

### State ownership table

Create and maintain a table during implementation. An initial allocation is:

| State/dependency | Proposed owner |
| --- | --- |
| connection, pending credentials, auth cancellation | auth service |
| CS2 inventory, economy provider | inventory service |
| game inventories, refresh generations, cancellations | economy-inventory service |
| armory snapshot | armory service |
| store snapshot, currency, purchase sessions | store service |
| trades, trade token/provider | trades service |
| receipts, events, last operation | operations service |
| settings and feature flags | settings service or application configuration |
| GC client lifecycle | connection/auth service with narrow clients passed to features |

### Regression tests

- Preserve all current application service tests before moving implementations.
- Add feature-level tests using small fakes, not the concrete Steam GC client.
- Add concurrency tests for overlapping refreshes, cancellation, disconnect during refresh, and stale generation suppression.
- Add race-detector coverage for mutable feature services.
- Assert operation receipt state sequences, not only final states.
- Assert inventory snapshots are cloned or treated immutably at public boundaries.
- Assert a failure in one feature does not corrupt another feature's state.
- Keep end-to-end facade tests to ensure RPC can continue using the old surface during migration.

### Exit criteria

- Each mutable field has one clear owner.
- Feature tests do not require constructing unrelated providers.
- The facade contains delegation and cross-feature orchestration only.
- Targeted race tests pass.

## Phase 5: Narrow Steam/GC transport boundaries

### Proposed consumer-owned interfaces

Define interfaces in or near the consuming application feature rather than in the concrete transport package:

```go
type AuthClient interface { /* authentication methods only */ }
type ConnectionClient interface { /* lifecycle and state only */ }
type InventoryClient interface { /* CS2 inventory only */ }
type EconomyInventoryClient interface { /* multi-game inventory only */ }
type ArmoryClient interface { /* armory reads/redemptions only */ }
type StoreClient interface { /* store reads/purchases only */ }
type ProtocolTraceClient interface { /* tracing only */ }
```

The concrete `SteamGCClient` may implement all of them. Avoid a wrapper that merely recreates the original large interface.

### Internal transport split

Split large files by protocol responsibility while keeping wire-format helpers close to their tests:

```text
transport/
  client.go
  auth_password.go
  auth_qr.go
  connection.go
  inventory_cs2.go
  inventory_multigame.go
  armory.go
  store.go
  gc_packet.go
  trace.go
```

Do not alter protobuf field numbers, binary layouts, or message IDs during these file moves. Use the vendored SteamTracking/GameTracking definitions as the source of truth.

### Regression tests

- Retain binary fixture decode tests byte-for-byte.
- Add table-driven tests for each supported app ID and expected protobuf envelope.
- Assert encoded request message ID, protobuf flag, and body bytes against known fixtures where deterministic.
- Test malformed, truncated, unknown-type, and partial SOCache payloads.
- Test authentication cancellation, polling timeout, retry exhaustion, and guard-required results.
- Test that tracing never changes the transmitted or decoded payload.
- Use fake connections and recorded fixtures; no live Steam account is required in CI.

### Exit criteria

- Application features compile against narrow interfaces.
- The concrete GC client retains existing behavior and fixture compatibility.
- Large transport files are divided by protocol responsibility without duplicating codecs.

## Phase 6: Split RPC routing and handlers

### Target structure

```text
backend/internal/rpc/
  handler.go             Handler construction and shared middleware
  decode.go              Bounded JSON decoding and validation helpers
  response.go            JSON/error response helpers
  auth_routes.go
  inventory_routes.go
  economy_routes.go
  armory_routes.go
  store_routes.go
  trade_routes.go
  operation_routes.go
  settings_routes.go
  pricing_routes.go
  websocket_routes.go
```

### Work

1. Extract route registration by feature.
2. Make the handler depend on small service interfaces instead of concrete `*app.Service` wherever practical.
3. Centralize bounded body decoding, unknown-field rejection, method enforcement, and error response formatting.
4. Preserve route paths and HTTP semantics.
5. Keep WebSocket lifecycle code separate from ordinary request handlers.

### Regression tests

Use table-driven tests covering every endpoint:

| Concern | Required assertions |
| --- | --- |
| Routing | path and method reach the intended service method |
| Request validation | malformed JSON, unknown fields, missing fields, oversized body |
| Response contract | status code, content type, and schema-valid JSON |
| Service failure | stable status mapping and error body |
| CORS | expected preflight and response headers |
| Timeouts | request context is cancelled and work does not leak |
| WebSocket | initial/update delivery, disconnect cleanup, disabled capability |

Add a route manifest test so accidental route removal or path changes fail loudly.

### Exit criteria

- Feature route files are independently testable.
- Shared transport policies are implemented once.
- All baseline routes and payload fixtures remain compatible.

## Phase 7: Remove transitional duplication

Only perform cleanup after the new boundaries have been exercised in prior phases.

### Work

1. Remove the legacy root `src/` tree if Phase 0 established it is obsolete; otherwise make its package status explicit.
2. Rename ambiguous casing pairs such as `AppView.tsx` and `app-view.tsx` to names that describe their roles, for example `AppView.tsx` and `App.tsx`.
3. Remove compatibility barrels and facade methods only after all consumers have migrated.
4. Update README commands, architecture documentation, and diagrams.
5. Remove unused packages such as an empty or superseded backend package only after repository-wide reference checks.

### Regression tests

- Run a clean install, full check, native build, WASM build, and package builds.
- Verify imports on a case-sensitive filesystem in CI.
- Verify packaged Electron resources include and launch the backend.
- Verify Android/WASM asset generation and unit tests.

### Exit criteria

- There is one clearly documented active implementation of each application layer.
- No transitional aliases or dead entry points remain.
- Documentation matches executable scripts and directory layout.

## Test architecture

### Test pyramid

1. **Pure unit tests**: selectors, mapping, validation, state transitions, protobuf helpers, and metadata parsing.
2. **Feature service/controller tests**: one capability with typed fakes and deterministic clocks.
3. **Contract tests**: Go JSON output validated by TypeScript Zod schemas.
4. **Adapter tests**: HTTP, WebSocket, Electron IPC, WASM bridge, and process lifecycle.
5. **Composition tests**: application facade and root UI workflows.
6. **Packaging smoke tests**: native, web/WASM, desktop, and Android build artifacts.

Most cases should live at levels 1-3. Use composition and packaging tests for wiring failures that smaller tests cannot detect.

### Regression matrix

Every affected feature must cover the applicable rows:

| Scenario | Frontend | App service | RPC | Transport/contract |
| --- | --- | --- | --- | --- |
| Ready/success | rendered state and command | resulting snapshot/receipt | 2xx and body | valid schema/message |
| Loading/in-flight | stable prior state and progress | generation/state | timeout context | pending interaction |
| Disconnected | reconnect guidance | no unsafe request | stable error/status | no send |
| Feature disabled | hidden/disabled UI | blocked receipt | stable status | no send |
| Validation failure | field feedback/toast | validation receipt | 400 response | no send |
| External failure | error state without rejection | state preserved | mapped error | typed error/result |
| Cancellation | cleanup/no stale update | cancel respected | context cancelled | poll/send stopped |
| Retry/reconcile | no duplicate action | idempotent outcome | stable resource ID | expected request count |
| Malformed response | typed app error | n/a | n/a | schema rejection |

### Fixture policy

- Store small, reviewed fixtures close to the owning test.
- Include the source and purpose of binary protobuf fixtures.
- Never regenerate golden fixtures automatically during normal tests.
- Require intentional review when a public JSON fixture changes.
- Scrub account credentials, access tokens, Steam IDs, and other secrets.
- Do not use live Steam inventory as a CI oracle.
- Keep live metadata refresh testing separate from deterministic parser and overlay tests.

### Fake and mock policy

- Prefer handwritten typed fakes for capability interfaces.
- Fake the nearest external boundary, not internal pure functions.
- Record calls and inputs so tests can assert absence of duplicate or unsafe operations.
- Model failures as typed results/errors returned by the interface.
- Use deterministic clocks and ID generators for receipt/event assertions.
- Avoid a single universal fake that recreates the broad production client.

## Pull request strategy

Each pull request should follow this sequence:

1. Add characterization tests for the behavior being moved.
2. Confirm those tests pass before structural changes.
3. Extract one responsibility without changing public behavior.
4. Run targeted tests during development.
5. Run the full repository check before review.
6. Document any deliberate contract or behavior change separately from the extraction.

Recommended pull request sizing:

- one capability interface split;
- one frontend feature controller extraction;
- one backend feature service extraction;
- one RPC route group extraction; or
- one transport protocol file split.

Do not combine all frontend or backend restructuring into one pull request.

## Definition of done for each extraction

- The module has a clear responsibility and narrow public API.
- Dependencies are passed explicitly or imported from a lower-level pure module.
- No new circular dependency exists.
- No TypeScript exception-based error handling was introduced.
- No lint or type rule was disabled to accommodate the extraction.
- Existing characterization tests still pass.
- New module-level success, failure, cancellation, and cleanup tests pass where applicable.
- Contract fixtures are unchanged unless the change is explicitly approved as behavioral.
- Full lint, typecheck, tests, and builds pass.
- Relevant documentation is updated.

## Completion criteria for the program

The modularization is complete when:

- all maintained code belongs to an explicit workspace/application boundary;
- frontend features own their controllers, views, and feature-specific utilities;
- the root frontend application performs composition only;
- backend mutable state has explicit feature ownership;
- backend consumers use narrow interfaces rather than the full GC client or application service;
- RPC and transport files are organized by capability;
- public JSON and protobuf behavior remains covered by contract and fixture tests;
- every maintained platform is linted, typechecked, tested, and built in CI;
- race-sensitive backend packages pass targeted race tests;
- no maintained source file needs a line-count or nesting-rule suppression;
- README and architecture documentation describe the actual commands and structure.
