import { Show } from "solid-js";
import type { JSX } from "solid-js";
import type { CompactMode } from "../../shared/ui-types.js";
import type {
  InventoryItemDto,
  InventorySnapshot,
} from "@cs-inv-edit/contracts";
import { PullToRefresh } from "../../shared/ui/PullToRefresh.js";
import { InventoryStorageMoveToolbar } from "./InventoryStorageMoveToolbar.js";
import { InventoryTradeUpToolbar } from "./InventoryTradeUpToolbar.js";
import { InventoryEmptyState } from "./inventory-view-content-elements.js";
import type { StorageMutationFailure } from "./inventory-action-handlers.js";
import {
  createInventoryCompactLayout,
  createInventoryItemClass,
  createInventorySummary,
  InventoryDetailsPanel,
  InventoryItemGrid,
  InventoryRetrievalOverlay,
  StorageToolbar,
} from "./inventory-view-grid-parts.js";

export interface InventoryGridProps {
  inventory: InventorySnapshot | undefined;
  inventoryLoading: boolean;
  filteredItems: InventoryItemDto[];
  selectionMode: "inventory";
  selectedItem: InventoryItemDto | undefined;
  selectedItemExplicit: boolean;
  selectedItemIds: string[];
  compactMode: CompactMode;
  marketPrices: ReadonlyMap<string, number>;
  onSelectItem: (
    item: InventoryItemDto,
    options?: { range: boolean; selected?: boolean },
  ) => void;
  onRefresh: () => void;
  detailsPanel: JSX.Element;
  browsingStorageUnit: InventoryItemDto | undefined;
  movingIntoStorageUnit: InventoryItemDto | undefined;
  removeFromStorageMode: boolean;
  storageSelectedItemIds: string[];
  storageRetrieval: { completed: number; total: number } | undefined;
  storageFailures: StorageMutationFailure[];
  storageMutationsEnabled: boolean;
  storageUnavailableReason?: string;
  onBackFromStorage: () => void;
  onToggleRemoveFromStorageMode: () => void;
  onRetrieveFromStorage: () => Promise<void> | void;
  onRetrieveAllFromStorage: () => Promise<void> | void;
  onCancelMoveIntoStorage: () => void;
  onConfirmMoveIntoStorage: () => Promise<void> | void;
  alerts: JSX.Element;
  tradeUpActive: boolean;
  tradeUpSelectedCount: number;
  tradeUpRequiredCount: number;
  onStartTradeUp: () => void;
  onCancelTradeUp: () => void;
  onReviewTradeUp: () => void;
}

export function InventoryGrid(props: InventoryGridProps) {
  let dragSelecting = false;
  let dragSelectionValue = true;
  const storageSelectionActive = () =>
    !!props.movingIntoStorageUnit ||
    (!!props.browsingStorageUnit && props.removeFromStorageMode);
  const finishDragSelection = () => {
    dragSelecting = false;
  };
  const beginDragSelection = (item: InventoryItemDto, event: MouseEvent) => {
    if (!storageSelectionActive() || event.button !== 0) return;
    event.preventDefault();
    dragSelecting = true;
    dragSelectionValue = !props.storageSelectedItemIds.includes(item.id);
    props.onSelectItem(item, { range: false, selected: dragSelectionValue });
  };
  const continueDragSelection = (item: InventoryItemDto) => {
    if (!storageSelectionActive() || !dragSelecting) return;
    if (props.storageSelectedItemIds.includes(item.id) === dragSelectionValue)
      return;
    props.onSelectItem(item, { range: false, selected: dragSelectionValue });
  };
  const compactSummary = (item: InventoryItemDto) =>
    createInventorySummary(item, props.compactMode);

  return (
    <div
      class={`grid flex-1 grid-cols-1 items-start gap-4 ${props.movingIntoStorageUnit ? "" : "lg:grid-cols-[minmax(320px,0.95fr)_minmax(0,1fr)]"}`}
    >
      <Show when={props.movingIntoStorageUnit}>
        {(unit) => (
          <InventoryStorageMoveToolbar
            unit={unit()}
            selectedCount={props.storageSelectedItemIds.length}
            pending={!!props.storageRetrieval}
            enabled={props.storageMutationsEnabled}
            unavailableReason={props.storageUnavailableReason}
            failures={props.storageFailures}
            onCancel={props.onCancelMoveIntoStorage}
            onConfirm={props.onConfirmMoveIntoStorage}
          />
        )}
      </Show>
      <div class="flex min-h-0 flex-col lg:order-2">
        <div class="mb-4 grid gap-4 empty:hidden">{props.alerts}</div>
        <Show when={!props.browsingStorageUnit && !props.movingIntoStorageUnit}>
          <InventoryTradeUpToolbar
            active={props.tradeUpActive}
            selectedCount={props.tradeUpSelectedCount}
            requiredCount={props.tradeUpRequiredCount}
            onStart={props.onStartTradeUp}
            onCancel={props.onCancelTradeUp}
            onReview={props.onReviewTradeUp}
          />
        </Show>
        <StorageToolbar
          browsingStorageUnit={props.browsingStorageUnit}
          removeFromStorageMode={props.removeFromStorageMode}
          storageSelectedItemIds={props.storageSelectedItemIds}
          filteredItems={props.filteredItems}
          storageRetrieval={props.storageRetrieval}
          storageFailures={props.storageFailures}
          storageMutationsEnabled={props.storageMutationsEnabled}
          storageUnavailableReason={props.storageUnavailableReason}
          onBackFromStorage={props.onBackFromStorage}
          onToggleRemoveFromStorageMode={props.onToggleRemoveFromStorageMode}
          onRetrieveFromStorage={props.onRetrieveFromStorage}
          onRetrieveAllFromStorage={props.onRetrieveAllFromStorage}
        />
        <PullToRefresh
          class="relative min-h-0 flex-1 pb-24 lg:pb-0"
          onRefresh={props.onRefresh}
        >
          <Show
            when={props.filteredItems.length > 0}
            fallback={
              <InventoryEmptyState
                inventory={props.inventory}
                inventoryLoading={props.inventoryLoading}
              />
            }
          >
            <InventoryItemGrid
              filteredItems={props.filteredItems}
              itemCardClass={(item) => createInventoryItemClass(item, props)}
              compactLayout={createInventoryCompactLayout(props.compactMode)}
              compactSummary={compactSummary}
              onSelectItem={props.onSelectItem}
              storageSelectionActive={storageSelectionActive()}
              storageSelectedItemIds={props.storageSelectedItemIds}
              marketPrices={props.marketPrices}
              onPointerUp={finishDragSelection}
              onPointerLeave={finishDragSelection}
              onItemPointerDown={beginDragSelection}
              onItemPointerEnter={continueDragSelection}
            />
          </Show>
          <Show when={props.storageRetrieval}>
            {(retrieval) => (
              <InventoryRetrievalOverlay retrieval={retrieval()} />
            )}
          </Show>
        </PullToRefresh>
      </div>
      <Show when={!props.movingIntoStorageUnit && !props.tradeUpActive}>
        <InventoryDetailsPanel
          selectionMode={props.selectionMode}
          selectedItem={props.selectedItem}
          selectedItemExplicit={props.selectedItemExplicit}
          selectedItemIds={props.selectedItemIds}
          detailsPanel={props.detailsPanel}
        />
      </Show>
    </div>
  );
}
