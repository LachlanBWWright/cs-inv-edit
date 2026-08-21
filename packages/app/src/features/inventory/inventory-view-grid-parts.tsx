import { createSignal, For, Show } from "solid-js";
import type { JSX } from "solid-js";
import type { InventoryItemDto } from "@cs-inv-edit/contracts";
import type { InventoryGridProps } from "./inventory-view-content-grid.js";
import {
  compactItemMeta,
  compactItemName,
  itemDisplayName,
  itemSubtitle,
  rarityBorderClass,
} from "./inventory-view-utils.js";
import { ItemInstanceDecorations } from "./ItemInstanceDecorations.js";
import { ItemMarketBadges } from "./ItemMarketBadges.js";
import { ResponsiveInspector } from "../../shared/ui/ResponsiveInspector.js";
import { Alert } from "../../shared/ui/Alert.js";
import { Button } from "../../shared/ui/Button.js";
import { Dialog } from "../../shared/ui/Dialog.js";
import { InventoryItemIcon as ItemIcon, InventoryItemWear as ItemWear } from "./inventory-view-content-elements.js";

function StorageFailureAlert(props: {
  failures: InventoryGridProps["storageFailures"];
}) {
  return (
    <Show when={props.failures.length > 0}>
      <Alert variant="danger">
        <p class="font-semibold">Some items could not be retrieved.</p>
        <ul class="mt-2 list-disc space-y-1 pl-5">
          <For each={props.failures}>
            {(failure) => (
              <li>
                <span class="font-mono">{failure.itemId}</span>: {failure.message}
              </li>
            )}
          </For>
        </ul>
        <p class="mt-2">Failed items remain selected for retry.</p>
      </Alert>
    </Show>
  );
}

export function StorageToolbar(props: {
  browsingStorageUnit: InventoryGridProps["browsingStorageUnit"];
  removeFromStorageMode: boolean;
  storageSelectedItemIds: string[];
  filteredItems: InventoryItemDto[];
  storageRetrieval: InventoryGridProps["storageRetrieval"];
  storageFailures: InventoryGridProps["storageFailures"];
  storageMutationsEnabled: boolean;
  storageUnavailableReason?: string;
  onBackFromStorage: () => void;
  onToggleRemoveFromStorageMode: () => void;
  onRetrieveFromStorage: () => Promise<void> | void;
  onRetrieveAllFromStorage: () => Promise<void> | void;
}) {
  const [confirmAllOpen, setConfirmAllOpen] = createSignal(false);
  const controlsDisabled = () =>
    !!props.storageRetrieval || !props.storageMutationsEnabled;
  const retrieveDisabled = () =>
    !props.removeFromStorageMode ||
    props.storageSelectedItemIds.length === 0 ||
    controlsDisabled();
  const retrieveAllDisabled = () =>
    props.filteredItems.length === 0 || controlsDisabled();
  const confirmRetrieveAll = () => {
    setConfirmAllOpen(false);
    void props.onRetrieveAllFromStorage();
  };
  return (
    <Show when={props.browsingStorageUnit}>
      {(unit) => (
        <div class="mb-3 grid shrink-0 gap-3">
          <div class="flex flex-wrap items-center gap-2 rounded-xl border border-slate-700 bg-slate-950 p-2.5">
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
              disabled={controlsDisabled()}
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
              disabled={retrieveDisabled()}
              onClick={() => void props.onRetrieveFromStorage()}
            >
              Retrieve from unit ({props.storageSelectedItemIds.length})
            </button>
            <button
              type="button"
              class="rounded-lg border border-cyan-500/60 px-3 py-2 text-sm font-semibold text-cyan-200 disabled:cursor-not-allowed disabled:opacity-40"
              disabled={retrieveAllDisabled()}
              onClick={() => setConfirmAllOpen(true)}
            >
              Retrieve all items
            </button>
            <span class="ml-auto truncate text-sm text-slate-400">
              {itemDisplayName(unit())}
            </span>
          </div>
          <Show when={props.storageUnavailableReason}>
            {(reason) => <Alert variant="warning">{reason()}</Alert>}
          </Show>
          <StorageFailureAlert failures={props.storageFailures} />
          <Dialog
            open={confirmAllOpen()}
            title="Retrieve every item?"
            description={`This will submit ${props.filteredItems.length} storage mutations to CS2.`}
            onOpenChange={setConfirmAllOpen}
          >
            <div class="flex justify-end gap-2">
              <Button
                variant="secondary"
                onClick={() => setConfirmAllOpen(false)}
                children="Cancel"
              />
              <Button
                variant="danger"
                onClick={confirmRetrieveAll}
                children={`Retrieve all ${props.filteredItems.length} items`}
              />
            </div>
          </Dialog>
        </div>
      )}
    </Show>
  );
}

export function InventoryItemCard(props: {
  item: InventoryItemDto;
  itemCardClass: string;
  compactLayout: string;
  compactSummary: JSX.Element;
  onSelectItem: InventoryGridProps["onSelectItem"];
  onPointerDown: (event: MouseEvent) => void;
  onPointerEnter: () => void;
  storageSelectionActive: boolean;
  storageSelectedItemIds: string[];
  marketPrices: ReadonlyMap<string, number>;
}) {
  return (
    <button
      type="button"
      class={`focus:outline-none focus:ring-2 focus:ring-cyan-400/50 ${props.itemCardClass}`}
      aria-pressed={props.storageSelectionActive ? props.storageSelectedItemIds.includes(props.item.id) : undefined}
      aria-label={
        props.storageSelectionActive
          ? `${props.storageSelectedItemIds.includes(props.item.id) ? "Deselect" : "Select"} ${itemDisplayName(props.item)}`
          : undefined
      }
      onClick={(event) => {
        event.stopPropagation();
        if (props.storageSelectionActive) return;
        props.onSelectItem(props.item, { range: event.shiftKey });
      }}
      onPointerDown={props.onPointerDown}
      onPointerEnter={props.onPointerEnter}
    >
      <Show when={props.storageSelectionActive}>
        <span
          class={`absolute left-2.5 top-2.5 z-10 flex h-6 w-6 items-center justify-center rounded-md border-2 text-sm font-bold shadow ${props.storageSelectedItemIds.includes(props.item.id) ? "border-cyan-300 bg-cyan-400 text-slate-950" : "border-slate-400 bg-slate-950 text-transparent"}`}
          aria-hidden="true"
        >
          ✓
        </span>
      </Show>
      <ItemMarketBadges
        item={props.item}
        priceMinor={props.marketPrices.get(props.item.marketName ?? "")}
      />
      <ItemIcon item={props.item} large />
      <div class={props.compactLayout}>{props.compactSummary}</div>
    </button>
  );
}

export function InventoryRetrievalOverlay(props: {
  retrieval: NonNullable<InventoryGridProps["storageRetrieval"]>;
}) {
  return (
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
            {props.retrieval.completed} of {props.retrieval.total} items
            retrieved from the storage unit.
          </p>
        </div>
      </div>
    </div>
  );
}

export function InventoryItemGrid(props: {
  filteredItems: InventoryItemDto[];
  itemCardClass: (item: InventoryItemDto) => string;
  compactLayout: string;
  compactSummary: (item: InventoryItemDto) => JSX.Element;
  onSelectItem: InventoryGridProps["onSelectItem"];
  storageSelectionActive: boolean;
  storageSelectedItemIds: string[];
  marketPrices: ReadonlyMap<string, number>;
  onPointerUp: () => void;
  onPointerLeave: () => void;
  onItemPointerDown: (item: InventoryItemDto, event: MouseEvent) => void;
  onItemPointerEnter: (item: InventoryItemDto) => void;
}) {
  return (
    <div
      class="grid gap-3"
      onPointerUp={props.onPointerUp}
      onPointerLeave={props.onPointerLeave}
      style={{
        "grid-template-columns": "repeat(auto-fill, minmax(190px, 1fr))",
      }}
    >
      <For each={props.filteredItems}>
        {(item) => (
          <InventoryItemCard
            item={item}
            itemCardClass={props.itemCardClass(item)}
            compactLayout={props.compactLayout}
            compactSummary={props.compactSummary(item)}
            onSelectItem={props.onSelectItem}
            onPointerDown={(event) => props.onItemPointerDown(item, event)}
            onPointerEnter={() => props.onItemPointerEnter(item)}
            storageSelectionActive={props.storageSelectionActive}
            storageSelectedItemIds={props.storageSelectedItemIds}
            marketPrices={props.marketPrices}
          />
        )}
      </For>
    </div>
  );
}

export function InventoryDetailsPanel(props: {
  selectionMode: InventoryGridProps["selectionMode"];
  selectedItem: InventoryItemDto | undefined;
  selectedItemExplicit: boolean;
  selectedItemIds: string[];
  detailsPanel: JSX.Element;
}) {
  return (
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
            {props.selectedItem ? itemDisplayName(props.selectedItem) : "Selected item"}
          </p>
          <p class="mt-0.5 truncate text-xs text-slate-500">{props.selectedItem ? itemSubtitle(props.selectedItem) : ""}</p>
        </div>
      }
    >
      {props.detailsPanel}
    </ResponsiveInspector>
  );
}

export function createInventorySummary(item: InventoryItemDto, compactMode: string) {
  if (compactMode === "icons") {
    return (
      <div class="flex h-full flex-col text-center">
        <p class="line-clamp-2 text-xs font-medium text-slate-200" title={itemDisplayName(item)}>
          {compactItemName(item)}
        </p>
        <Show when={compactItemMeta(item)}>
          <p class="mt-1 truncate text-[11px] text-slate-500">{compactItemMeta(item)}</p>
        </Show>
        <ItemInstanceDecorations item={item} />
        <ItemWear item={item} />
      </div>
    );
  }
  if (compactMode === "detailed") {
    return (
      <div class="flex h-full min-w-0 flex-col">
        <strong class="text-base leading-tight text-slate-50">{itemDisplayName(item)}</strong>
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
      <strong class="line-clamp-2 text-base leading-tight text-slate-50" title={itemDisplayName(item)}>
        {compactItemName(item)}
      </strong>
      <Show when={compactItemMeta(item)}>
        <p class="mt-1 truncate text-sm text-slate-400">{compactItemMeta(item)}</p>
      </Show>
      <ItemInstanceDecorations item={item} />
      <ItemWear item={item} />
    </div>
  );
}

export function createInventoryItemClass(item: InventoryItemDto, props: InventoryGridProps) {
  const isSelected =
    props.tradeUpActive
      ? props.selectedItemIds.includes(item.id)
      : props.removeFromStorageMode || props.movingIntoStorageUnit
      ? props.storageSelectedItemIds.includes(item.id)
      : props.selectionMode === "inventory"
        ? props.selectedItem?.id === item.id
        : props.selectedItemIds.includes(item.id);
  return `inventory-item-card group relative flex cursor-pointer flex-col overflow-hidden rounded-2xl border-2 bg-slate-950 text-left transition duration-150 ${rarityBorderClass(item.rarity)} ${isSelected ? "is-selected" : ""}`;
}

export function createInventoryCompactLayout(compactMode: string) {
  if (compactMode === "icons") {
    return "flex flex-1 flex-col px-3 py-3 text-center";
  }
  return "flex flex-1 flex-col px-3 py-3";
}
