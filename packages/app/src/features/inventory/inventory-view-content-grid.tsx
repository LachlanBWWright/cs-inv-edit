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

function selectItemsInRectangle(input: {
  grid: HTMLDivElement;
  items: InventoryItemDto[];
  bounds: { left: number; right: number; top: number; bottom: number };
  selected: boolean;
  selectedIds: string[];
  onSelect: InventoryGridProps["onSelectItem"];
}) {
  for (const candidate of input.items) {
    const card = input.grid.querySelector<HTMLButtonElement>(
      `[data-item-id="${CSS.escape(candidate.id)}"]`,
    );
    if (!card) continue;
    const rect = card.getBoundingClientRect();
    const inside =
      rect.left < input.bounds.right &&
      rect.right > input.bounds.left &&
      rect.top < input.bounds.bottom &&
      rect.bottom > input.bounds.top;
    if (
      inside &&
      input.selectedIds.includes(candidate.id) !== input.selected
    ) {
      input.onSelect(candidate, { range: false, selected: input.selected });
    }
  }
}

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
  tradeUpsEnabled?: boolean;
  tradeUpActive: boolean;
  tradeUpSelectedCount: number;
  tradeUpRequiredCount: number;
  onStartTradeUp: () => void;
  onCancelTradeUp: () => void;
  onReviewTradeUp: () => void;
}

function InventoryItemsPane(props: {
  grid: InventoryGridProps;
  storageSelectionActive: boolean;
  compactSummary: (item: InventoryItemDto) => JSX.Element;
  onPointerUp: () => void;
  onPointerLeave: () => void;
  gridElement: (element: HTMLDivElement) => void;
  onItemPointerDown: (item: InventoryItemDto, event: MouseEvent) => void;
  onItemPointerEnter: (item: InventoryItemDto, event: PointerEvent) => void;
}) {
  return (
    <Show
      when={props.grid.filteredItems.length > 0}
      fallback={
        <InventoryEmptyState
          inventory={props.grid.inventory}
          inventoryLoading={props.grid.inventoryLoading}
        />
      }
    >
      <InventoryItemGrid
        filteredItems={props.grid.filteredItems}
        itemCardClass={(item) => createInventoryItemClass(item, props.grid)}
        compactLayout={createInventoryCompactLayout(props.grid.compactMode)}
        compactSummary={props.compactSummary}
        onSelectItem={props.grid.onSelectItem}
        storageSelectionActive={props.storageSelectionActive}
        storageSelectedItemIds={props.grid.storageSelectedItemIds}
        marketPrices={props.grid.marketPrices}
        onPointerUp={props.onPointerUp}
        onPointerLeave={props.onPointerLeave}
        onItemPointerDown={props.onItemPointerDown}
        onItemPointerEnter={props.onItemPointerEnter}
        ref={props.gridElement}
      />
    </Show>
  );
}

export function InventoryGrid(props: InventoryGridProps) {
  let dragSelecting = false;
  let dragSelectionValue = true;
  let dragAnchorItemId: string | undefined;
  let gridElement: HTMLDivElement | undefined;
  const storageSelectionActive = () =>
    !!props.movingIntoStorageUnit ||
    (!!props.browsingStorageUnit && props.removeFromStorageMode);
  const finishDragSelection = () => {
    dragSelecting = false;
    dragAnchorItemId = undefined;
  };
  const beginDragSelection = (item: InventoryItemDto, event: MouseEvent) => {
    if (!storageSelectionActive() || event.button !== 0) return;
    event.preventDefault();
    dragSelecting = true;
    dragAnchorItemId = item.id;
    dragSelectionValue = !props.storageSelectedItemIds.includes(item.id);
    props.onSelectItem(item, { range: false, selected: dragSelectionValue });
  };
  const continueDragSelection = (item: InventoryItemDto, event: PointerEvent) => {
    if (!storageSelectionActive() || !dragSelecting) return;
    const grid = gridElement;
    if (!grid) return;
    const anchor = grid.querySelector<HTMLButtonElement>(
      `[data-item-id="${CSS.escape(dragAnchorItemId ?? "")}"]`,
    );
    if (!anchor) return;
    const anchorRect = anchor.getBoundingClientRect();
    const currentTarget = event.currentTarget;
    if (!(currentTarget instanceof HTMLElement)) return;
    const currentRect = currentTarget.getBoundingClientRect();
    const left = Math.min(anchorRect.left, currentRect.left);
    const right = Math.max(anchorRect.right, currentRect.right);
    const top = Math.min(anchorRect.top, currentRect.top);
    const bottom = Math.max(anchorRect.bottom, currentRect.bottom);
    selectItemsInRectangle({
      grid,
      items: props.filteredItems,
      bounds: { left, right, top, bottom },
      selected: dragSelectionValue,
      selectedIds: props.storageSelectedItemIds,
      onSelect: props.onSelectItem,
    });
  };
  const compactSummary = (item: InventoryItemDto) =>
    createInventorySummary(item, props.compactMode);
  const itemsPane = () => (
    <InventoryItemsPane
      grid={props}
      storageSelectionActive={storageSelectionActive()}
      compactSummary={compactSummary}
      onPointerUp={finishDragSelection}
      onPointerLeave={finishDragSelection}
      gridElement={(element) => {
        gridElement = element;
      }}
      onItemPointerDown={beginDragSelection}
      onItemPointerEnter={continueDragSelection}
    />
  );

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
        <Show
          when={
            (props.tradeUpsEnabled ?? false) &&
            !props.browsingStorageUnit &&
            !props.movingIntoStorageUnit
          }
        >
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
        <Show
          when={props.storageRetrieval}
          fallback={
            <PullToRefresh
              class="relative min-h-0 flex-1 pb-24 lg:pb-0"
              onRefresh={props.onRefresh}
            >
              {itemsPane()}
            </PullToRefresh>
          }
        >
          {(retrieval) => <InventoryRetrievalOverlay retrieval={retrieval()} />}
        </Show>
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
