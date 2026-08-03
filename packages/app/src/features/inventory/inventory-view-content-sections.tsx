import { For, Show } from "solid-js";
import type { JSX } from "solid-js";
import type {
  InventoryItemDto,
  InventorySnapshot,
} from "@cs-inv-edit/contracts";
import {
  compactItemMeta,
  compactItemName,
  itemDisplayName,
  itemSubtitle,
  rarityBorderClass,
} from "./inventory-view-utils.js";
import { ItemInstanceDecorations } from "./ItemInstanceDecorations.js";
import { ItemMarketBadges } from "./ItemMarketBadges.js";
import { PullToRefresh } from "../../shared/ui/PullToRefresh.js";
import { ResponsiveInspector } from "../../shared/ui/ResponsiveInspector.js";
import { InventoryStorageMoveToolbar } from "./InventoryStorageMoveToolbar.js";
import {
  InventoryEmptyState,
  InventoryItemIcon as ItemIcon,
  InventoryItemWear as ItemWear,
} from "./inventory-view-content-elements.js";

export interface InventoryGridProps {
  inventory: InventorySnapshot | undefined;
  inventoryLoading: boolean;
  filteredItems: InventoryItemDto[];
  selectionMode: "inventory";
  selectedItem: InventoryItemDto | undefined;
  selectedItemExplicit: boolean;
  selectedItemIds: string[];
  compactMode: "icons" | "concise" | "detailed";
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
  onBackFromStorage: () => void;
  onToggleRemoveFromStorageMode: () => void;
  onRetrieveFromStorage: () => Promise<void> | void;
  onRetrieveAllFromStorage: () => Promise<void> | void;
  onCancelMoveIntoStorage: () => void;
  onConfirmMoveIntoStorage: () => Promise<void> | void;
  alerts: JSX.Element;
}

export function InventoryGrid(props: InventoryGridProps) {
  let dragSelecting = false;
  let dragSelectionValue = true;
  const itemCardClass = (item: InventoryItemDto) => {
    const isSelected =
      props.removeFromStorageMode || props.movingIntoStorageUnit
        ? props.storageSelectedItemIds.includes(item.id)
        : props.selectionMode === "inventory"
          ? props.selectedItem?.id === item.id
          : props.selectedItemIds.includes(item.id);
    return `inventory-item-card group relative flex cursor-pointer flex-col overflow-hidden rounded-2xl border-2 bg-slate-950 text-left transition duration-150 ${rarityBorderClass(item.rarity)} ${isSelected ? "is-selected" : ""}`;
  };

  const compactLayout = () => {
    if (props.compactMode === "icons") {
      return "flex flex-1 flex-col px-3 py-3 text-center";
    }
    return "flex flex-1 flex-col px-3 py-3";
  };

  const compactSummary = (item: InventoryItemDto) => {
    if (props.compactMode === "icons") {
      return (
        <div class="flex h-full flex-col text-center">
          <p
            class="line-clamp-2 text-xs font-medium text-slate-200"
            title={itemDisplayName(item)}
          >
            {compactItemName(item)}
          </p>
          <Show when={compactItemMeta(item)}>
            <p class="mt-1 truncate text-[11px] text-slate-500">
              {compactItemMeta(item)}
            </p>
          </Show>
          <ItemInstanceDecorations item={item} />
          <ItemWear item={item} />
        </div>
      );
    }
    if (props.compactMode === "detailed") {
      return (
        <div class="flex h-full min-w-0 flex-col">
          <strong class="text-base leading-tight text-slate-50">
            {itemDisplayName(item)}
          </strong>
          <Show when={itemSubtitle(item)}>
            <p class="mt-1 text-sm text-slate-400">{itemSubtitle(item)}</p>
          </Show>
          <dl class="mt-3 grid gap-1 text-sm text-slate-400">
            <Show when={item.collection}>
              <div class="flex justify-between gap-3">
                <dt>Collection</dt>
                <dd>{item.collection}</dd>
              </div>
            </Show>
            <Show when={item.exterior}>
              <div class="flex justify-between gap-3">
                <dt>Exterior</dt>
                <dd>{item.exterior}</dd>
              </div>
            </Show>
            <Show when={item.storageLocation}>
              <div class="flex justify-between gap-3">
                <dt>Storage</dt>
                <dd>{item.storageLocation}</dd>
              </div>
            </Show>
            <Show when={item.marketPrice}>
              <div class="flex justify-between gap-3">
                <dt>Market</dt>
                <dd>{item.marketPrice}</dd>
              </div>
            </Show>
          </dl>
          <ItemInstanceDecorations item={item} />
          <ItemWear item={item} />
        </div>
      );
    }
    return (
      <div class="flex h-full min-w-0 flex-col">
        <strong
          class="line-clamp-2 text-base leading-tight text-slate-50"
          title={itemDisplayName(item)}
        >
          {compactItemName(item)}
        </strong>
        <Show when={compactItemMeta(item)}>
          <p class="mt-1 truncate text-sm text-slate-400">
            {compactItemMeta(item)}
          </p>
        </Show>
        <ItemInstanceDecorations item={item} />
        <ItemWear item={item} />
      </div>
    );
  };

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
            onCancel={props.onCancelMoveIntoStorage}
            onConfirm={props.onConfirmMoveIntoStorage}
          />
        )}
      </Show>
      <div class="flex min-h-0 flex-col lg:order-2">
        <div class="mb-4 grid gap-4 empty:hidden">{props.alerts}</div>
        <Show when={props.browsingStorageUnit}>
          <div class="mb-3 flex shrink-0 flex-wrap items-center gap-2 rounded-xl border border-slate-700 bg-slate-950 p-2.5">
            <button
              type="button"
              class="rounded-lg border border-slate-700 px-3 py-2 text-sm font-medium text-slate-200 hover:border-cyan-400/50 disabled:cursor-not-allowed disabled:opacity-40"
              disabled={!!props.storageRetrieval}
              onClick={props.onBackFromStorage}
            >
              ← Back
            </button>
            <button
              type="button"
              role="switch"
              aria-checked={props.removeFromStorageMode}
              class="inline-flex items-center gap-2 rounded-lg px-2 py-2 text-sm font-medium text-slate-200 disabled:cursor-not-allowed disabled:opacity-40"
              disabled={!!props.storageRetrieval}
              onClick={props.onToggleRemoveFromStorageMode}
            >
              <span
                class={`relative h-6 w-11 rounded-full transition ${props.removeFromStorageMode ? "bg-amber-400" : "bg-slate-700"}`}
                aria-hidden="true"
              >
                <span
                  class={`absolute top-1 h-4 w-4 rounded-full bg-white shadow transition-transform ${props.removeFromStorageMode ? "translate-x-6" : "translate-x-1"}`}
                />
              </span>
              Remove item mode
            </button>
            <button
              type="button"
              class="rounded-lg bg-cyan-500 px-3 py-2 text-sm font-semibold text-slate-950 disabled:cursor-not-allowed disabled:opacity-40"
              disabled={
                !props.removeFromStorageMode ||
                props.storageSelectedItemIds.length === 0 ||
                !!props.storageRetrieval
              }
              onClick={() => void props.onRetrieveFromStorage()}
            >
              Retrieve from unit ({props.storageSelectedItemIds.length})
            </button>
            <button
              type="button"
              class="rounded-lg border border-cyan-500/60 px-3 py-2 text-sm font-semibold text-cyan-200 disabled:cursor-not-allowed disabled:opacity-40"
              disabled={
                props.filteredItems.length === 0 || !!props.storageRetrieval
              }
              onClick={() => void props.onRetrieveAllFromStorage()}
            >
              Retrieve all items
            </button>
            <span class="ml-auto truncate text-sm text-slate-400">
              {itemDisplayName(props.browsingStorageUnit!)}
            </span>
          </div>
        </Show>
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
            <div
              class="grid gap-3"
              onPointerUp={() => (dragSelecting = false)}
              onPointerLeave={() => (dragSelecting = false)}
              style={{
                "grid-template-columns":
                  "repeat(auto-fill, minmax(190px, 1fr))",
              }}
            >
              <For each={props.filteredItems}>
                {(item) => (
                  <button
                    type="button"
                    class={`focus:outline-none focus:ring-2 focus:ring-cyan-400/50 ${itemCardClass(item)}`}
                    aria-pressed={
                      props.removeFromStorageMode || props.movingIntoStorageUnit
                        ? props.storageSelectedItemIds.includes(item.id)
                        : props.selectionMode === "inventory"
                          ? props.selectedItem?.id === item.id
                          : props.selectedItemIds.includes(item.id)
                    }
                    onClick={(event) => {
                      event.stopPropagation();
                      if (props.movingIntoStorageUnit) return;
                      props.onSelectItem(item, { range: event.shiftKey });
                    }}
                    onPointerDown={(event) => {
                      if (!props.movingIntoStorageUnit || event.button !== 0)
                        return;
                      event.preventDefault();
                      dragSelecting = true;
                      dragSelectionValue =
                        !props.storageSelectedItemIds.includes(item.id);
                      props.onSelectItem(item, {
                        range: false,
                        selected: dragSelectionValue,
                      });
                    }}
                    onPointerEnter={() => {
                      if (!props.movingIntoStorageUnit || !dragSelecting)
                        return;
                      if (
                        props.storageSelectedItemIds.includes(item.id) ===
                        dragSelectionValue
                      )
                        return;
                      props.onSelectItem(item, {
                        range: false,
                        selected: dragSelectionValue,
                      });
                    }}
                  >
                    <Show when={props.movingIntoStorageUnit}>
                      <span
                        class={`absolute left-2.5 top-2.5 z-10 flex h-6 w-6 items-center justify-center rounded-md border-2 text-sm font-bold shadow ${props.storageSelectedItemIds.includes(item.id) ? "border-cyan-300 bg-cyan-400 text-slate-950" : "border-slate-400 bg-slate-950 text-transparent"}`}
                        role="checkbox"
                        aria-checked={props.storageSelectedItemIds.includes(
                          item.id,
                        )}
                      >
                        ✓
                      </span>
                    </Show>
                    <ItemMarketBadges
                      item={item}
                      priceMinor={props.marketPrices.get(item.marketName ?? "")}
                    />
                    <ItemIcon item={item} large />
                    <div class={compactLayout()}>{compactSummary(item)}</div>
                  </button>
                )}
              </For>
            </div>
          </Show>
          <Show when={props.storageRetrieval}>
            {(retrieval) => (
              <div
                class="absolute inset-0 z-10 flex items-start justify-center bg-slate-950 px-4 pt-10"
                role="status"
                aria-live="polite"
              >
                <div class="flex w-full max-w-sm items-center gap-4 rounded-2xl border border-cyan-400/30 bg-slate-900 p-5 shadow-2xl">
                  <span
                    class="h-9 w-9 shrink-0 animate-spin rounded-full border-2 border-slate-700 border-t-cyan-300"
                    aria-hidden="true"
                  />
                  <div>
                    <strong class="text-slate-50">Retrieving items</strong>
                    <p class="mt-1 text-sm text-slate-400">
                      {retrieval().completed} of {retrieval().total} items
                      retrieved from the storage unit.
                    </p>
                  </div>
                </div>
              </div>
            )}
          </Show>
        </PullToRefresh>
      </div>
      <Show when={!props.movingIntoStorageUnit}>
        <ResponsiveInspector
          open={
            props.selectionMode === "inventory" &&
            props.selectedItemExplicit &&
            !!props.selectedItem
          }
          selectionKey={props.selectedItem?.id}
          label="Selected CS2 item details"
          summary={
            <div class="min-w-0">
              <p class="truncate text-sm font-semibold text-slate-100">
                {props.selectedItem
                  ? itemDisplayName(props.selectedItem)
                  : "Selected item"}
              </p>
              <p class="mt-0.5 truncate text-xs text-slate-500">
                {props.selectedItem ? itemSubtitle(props.selectedItem) : ""}
              </p>
            </div>
          }
        >
          {props.detailsPanel}
        </ResponsiveInspector>
      </Show>
    </div>
  );
}
