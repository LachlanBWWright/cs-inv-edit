# CS2 Inventory Editor Implementation Plan

## Goal
Finish the implementation of the CS2 inventory editor such that all counter strike inventory editing protobufs are exposed in the UI.

## Missing Operations (According to `cs-solid.md` and `deep-research-report.md`)
1. **Name Tags**: Apply (`CMsgSetItemName`), Remove (`CMsgRemoveItemName`)
2. **Item Deletion**: `CMsgDeleteItem`
3. **StatTrak Swaps**: `CMsgApplyStatTrakSwap`
4. **Strange Parts**: `CMsgApplyStrangePart`
5. **Item Usage**: Single (`CMsgUseItem`), Multiple (`CMsgUseMultipleItems`)
6. **Tool Application**: Generic tool (`CMsgApplyToolToItem`), Base item tool (`CMsgApplyToolToBaseItem`)
7. **Gifting**: `CMsgGiftItem`
8. **Crafting (Trade-up)**: `CMsgCraftItems` (Already partially implemented with raw binary, but needs full UI wiring and definition if applicable)

## Step-by-Step Implementation Plan

### Phase 1: Protocol & Backend Foundation
1. **Update Protobuf Definitions (`proto/cs2_item_subset.proto`)**
   - Add all the missing protobuf message definitions listed above.
2. **Generate Go Bindings**
   - Run `scripts/generate-protos.sh` to update the Go code in `backend/internal/proto/generated/cs2_item_subset.pb.go`.
3. **Update Protocol Constants (`backend/internal/protocol/craft.go`)**
   - Define any missing EMsg IDs (e.g. `EMsgGCUseItemRequest`, `EMsgGCCraft`, etc.) and request codes needed for these new operations.
4. **Implement Go Encoders (`backend/internal/proto/generated/encode.go`)**
   - Add encoder functions for each new message (e.g. `EncodeSetItemName`, `EncodeApplyStatTrakSwap`, etc.) similar to the existing `EncodeApplySticker`.
5. **Update Backend RPC Handlers (`backend/internal/rpc/handler.go`)**
   - Add new HTTP POST routes for each operation (e.g., `/nametags/apply`, `/items/delete`, `/stattrak/swap`).
6. **Implement Backend Service Logic (`backend/internal/app/service.go`)**
   - Add handling in `SubmitOperation` for the new operations.
   - Enforce feature flags for each dangerous operation (e.g., `EnableNameTags`, `EnableItemDeletion`) and update `internal/domain/domain.go` to include these flags.

### Phase 2: Frontend Contracts & Architecture
1. **Update TypeScript Contracts (`packages/contracts/src/messages.ts`)**
   - Add TypeScript interface definitions matching the new protobuf messages.
   - Add the new methods to the RPC/HTTP contracts and update request/response types.
2. **Update Frontend API Client (`packages/app/src/lib/api.ts` or similar)**
   - Add functions to call the new backend HTTP endpoints.
   - Ensure the new operation receipts are correctly tracked.

### Phase 3: UI Implementation
1. **New Operation Views (`packages/app/src/components/`)**
   - **NameTagsView.tsx**: Form for `CMsgSetItemName` (Item ID, Name Tag ID, Name string) and `CMsgRemoveItemName`.
   - **ToolsView.tsx**: Form for `CMsgApplyStatTrakSwap`, `CMsgApplyStrangePart`, `CMsgApplyToolToItem`, `CMsgApplyToolToBaseItem`.
   - **ItemManagementView.tsx**: Form for `CMsgDeleteItem`, `CMsgUseItem`, `CMsgUseMultipleItems`, `CMsgGiftItem`.
2. **Update App Layout**
   - Add the new views to the `Sidebar.tsx` navigation.
   - Ensure they map to the correct components in the main routing area (likely in `App.tsx` or an `index.tsx` router).
3. **Wire Forms to Backend**
   - Connect the submit buttons in each form to the API client methods.
   - Handle loading states and display operation receipts/errors from the backend.

### Phase 4: Polish & Testing
1. **Validation Harness**
   - Add support for the new operations in the CLI `encode` subcommand (`backend/cmd/cs2-backend/main.go`) to allow encoding-only validation before sending to GC.
2. **Error Handling & Reconciliation**
   - Ensure the UI gracefully handles failure responses from the backend for these new operations.
   - Wait for `inventory_refresh` to reconcile inventory state after a successful operation.
