import { For, Show } from "solid-js";
import type { JSX } from "solid-js";
import type { InventoryItemDto, InventorySnapshot } from "@cs-inv-edit/contracts";
import { Alert } from "./ui/Alert.js";
import { compactItemMeta, compactItemName, itemDisplayName, itemInitials, itemKindLabel, itemSubtitle, rarityBorderClass } from "./inventory-view-utils.js";
import { ItemInstanceDecorations } from "./ItemInstanceDecorations.js";
import { formatFloat, hasSkinWearFloat } from "./item-instance-utils.js";
import { TradeLockIndicator } from "./TradeLockIndicator.js";
import { WearRangeBar } from "./ui/WearRangeBar.js";
import type { LoadingStage } from "./ui/LoadingProgress.js";
import { InventoryLoadingState } from "./ui/InventoryLoadingState.js";
import { PullToRefresh } from "./ui/PullToRefresh.js";

const inventoryLoadingStages: readonly LoadingStage[] = [
  { afterSeconds: 0, label: "Contacting the CS2 Game Coordinator", detail: "Requesting the authoritative owned-item SOCache for this Steam account." },
  { afterSeconds: 8, label: "Waiting for inventory data", detail: "The Game Coordinator can take several retries before it sends the inventory snapshot." },
  { afterSeconds: 20, label: "Resolving current CS2 item metadata", detail: "Loading the live item schema, localization, and tracked image index." },
  { afterSeconds: 35, label: "Enriching item previews", detail: "Matching names, images, collections, containers, and available Steam market metadata." },
  { afterSeconds: 65, label: "Still working—Steam is responding slowly", detail: "The request remains active. Image and market lookups are bounded, but Steam may throttle metadata requests." },
];

export interface InventoryFiltersProps {
  class?: string;
  kindFilter: "all" | InventoryItemDto["kind"];
  rarityFilter: string;
  weaponFilter: string;
  collectionFilter: string;
  rarityOptions: string[];
  weaponOptions: string[];
  collectionOptions: string[];
  onKindFilterChange: (value: "all" | InventoryItemDto["kind"]) => void;
  onRarityFilterChange: (value: string) => void;
  onWeaponFilterChange: (value: string) => void;
  onCollectionFilterChange: (value: string) => void;
}

export function InventoryFilters(props: InventoryFiltersProps) {
  const selectClass = "mt-1.5 h-10 w-full rounded-xl border border-slate-700/80 bg-slate-900 px-3 text-sm text-slate-100 outline-none transition hover:border-slate-600 focus:border-cyan-400/70 focus:ring-2 focus:ring-cyan-400/15";
  return (
    <div class={props.class ?? "grid gap-3 rounded-2xl border border-slate-800 bg-slate-950/60 p-3 sm:grid-cols-2"}>
      <label class="block text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-400">Item type<select aria-label="Item type" class={selectClass} value={props.kindFilter} onInput={(event) => props.onKindFilterChange(event.currentTarget.value as "all" | InventoryItemDto["kind"])}><option value="all">All types</option><For each={["weapon_skin", "sticker_item", "container", "storage_unit", "tool_item", "cs2_econ_item", "unknown"] as const}>{(kind) => <option value={kind}>{itemKindLabel(kind)}</option>}</For></select></label>
      <label class="block text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-400">Rarity<select aria-label="Rarity tier" class={selectClass} value={props.rarityFilter} onInput={(event) => props.onRarityFilterChange(event.currentTarget.value)}><option value="all">All rarities</option><For each={props.rarityOptions}>{(rarity) => <option value={rarity}>{rarity}</option>}</For></select></label>
      <label class="block text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-400">Weapon<select aria-label="Weapon" class={selectClass} value={props.weaponFilter} onInput={(event) => props.onWeaponFilterChange(event.currentTarget.value)}><option value="all">All weapons</option><For each={props.weaponOptions}>{(weapon) => <option value={weapon}>{weapon}</option>}</For></select></label>
      <label class="block text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-400">Collection<select aria-label="Collection" class={selectClass} value={props.collectionFilter} onInput={(event) => props.onCollectionFilterChange(event.currentTarget.value)}><option value="all">All collections</option><For each={props.collectionOptions}>{(collection) => <option value={collection}>{collection}</option>}</For></select></label>
    </div>
  );
}

export interface InventoryGridProps {
  inventory: InventorySnapshot | undefined;
  inventoryLoading: boolean;
  filteredItems: InventoryItemDto[];
  selectionMode: "inventory" | "inventory-storage" | "inventory-tradeup";
  selectedItem: InventoryItemDto | undefined;
  selectedItemIds: string[];
  compactMode: "icons" | "concise" | "detailed";
  onSelectItem: (item: InventoryItemDto) => void;
  onRefresh: () => void;
  detailsPanel: JSX.Element;
  browsingStorageUnit: InventoryItemDto | undefined;
  removeFromStorageMode: boolean;
  storageSelectedItemIds: string[];
  onBackFromStorage: () => void;
  onToggleRemoveFromStorageMode: () => void;
  onRetrieveFromStorage: () => Promise<void> | void;
}

export function InventoryGrid(props: InventoryGridProps) {
  const itemCardClass = (item: InventoryItemDto) => {
    const isSelected = props.removeFromStorageMode ? props.storageSelectedItemIds.includes(item.id) : props.selectionMode === "inventory" ? props.selectedItem?.id === item.id : props.selectedItemIds.includes(item.id);
    return `inventory-item-card group relative flex cursor-pointer flex-col overflow-hidden rounded-2xl border-2 bg-slate-950 text-left transition duration-150 ${rarityBorderClass(item.rarity)} ${isSelected ? "is-selected ring-2 ring-cyan-300" : "hover:brightness-110"}`;
  };

  const compactLayout = () => {
    if (props.compactMode === "icons") {
      return "flex flex-1 flex-col px-3 py-3 text-center";
    }
    return "flex flex-1 flex-col px-3 py-3";
  };

  const compactSummary = (item: InventoryItemDto) => {
    if (props.compactMode === "icons") {
      return <div class="flex h-full flex-col text-center"><p class="line-clamp-2 text-xs font-medium text-slate-200" title={itemDisplayName(item)}>{compactItemName(item)}</p><Show when={compactItemMeta(item)}><p class="mt-1 truncate text-[11px] text-slate-500">{compactItemMeta(item)}</p></Show><ItemInstanceDecorations item={item} /><ItemWear item={item} /></div>;
    }
    if (props.compactMode === "detailed") {
      return (
        <div class="flex h-full min-w-0 flex-col">
          <strong class="text-base leading-tight text-slate-50">{itemDisplayName(item)}</strong>
          <Show when={itemSubtitle(item)}>
            <p class="mt-1 text-sm text-slate-400">{itemSubtitle(item)}</p>
          </Show>
          <dl class="mt-3 grid gap-1 text-sm text-slate-400">
            <Show when={item.collection}>
              <div class="flex justify-between gap-3"><dt>Collection</dt><dd>{item.collection}</dd></div>
            </Show>
            <Show when={item.exterior}>
              <div class="flex justify-between gap-3"><dt>Exterior</dt><dd>{item.exterior}</dd></div>
            </Show>
            <Show when={item.storageLocation}>
              <div class="flex justify-between gap-3"><dt>Storage</dt><dd>{item.storageLocation}</dd></div>
            </Show>
            <Show when={item.marketPrice}>
              <div class="flex justify-between gap-3"><dt>Market</dt><dd>{item.marketPrice}</dd></div>
            </Show>
          </dl>
          <ItemInstanceDecorations item={item} />
          <ItemWear item={item} />
        </div>
      );
    }
    return (
      <div class="flex h-full min-w-0 flex-col">
        <strong class="line-clamp-2 text-base leading-tight text-slate-50" title={itemDisplayName(item)}>{compactItemName(item)}</strong>
        <Show when={compactItemMeta(item)}>
          <p class="mt-1 truncate text-sm text-slate-400">{compactItemMeta(item)}</p>
        </Show>
        <ItemInstanceDecorations item={item} />
        <ItemWear item={item} />
      </div>
    );
  };

  return (
    <div class="grid min-h-0 flex-1 grid-cols-1 gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(320px,0.95fr)]">
      <PullToRefresh class="min-h-0 overflow-y-auto pr-1" onRefresh={props.onRefresh}>
        <Show when={props.browsingStorageUnit}>
          <div class="sticky top-0 z-10 mb-3 flex flex-wrap items-center gap-2 rounded-xl border border-slate-700 bg-slate-950/95 p-2 shadow-lg backdrop-blur">
            <button type="button" class="rounded-lg border border-slate-700 px-3 py-2 text-sm font-medium text-slate-200 hover:border-cyan-400/50" onClick={props.onBackFromStorage}>← Back</button>
            <button type="button" aria-pressed={props.removeFromStorageMode} class={`rounded-lg border px-3 py-2 text-sm font-medium ${props.removeFromStorageMode ? "border-amber-400 bg-amber-400/15 text-amber-200" : "border-slate-700 text-slate-200 hover:border-amber-400/50"}`} onClick={props.onToggleRemoveFromStorageMode}>Remove item mode</button>
            <button type="button" class="rounded-lg bg-cyan-500 px-3 py-2 text-sm font-semibold text-slate-950 disabled:cursor-not-allowed disabled:opacity-40" disabled={!props.removeFromStorageMode || props.storageSelectedItemIds.length === 0} onClick={() => void props.onRetrieveFromStorage()}>Retrieve from unit ({props.storageSelectedItemIds.length})</button>
            <span class="ml-auto truncate text-sm text-slate-400">{itemDisplayName(props.browsingStorageUnit!)}</span>
          </div>
        </Show>
        <Show when={props.filteredItems.length > 0} fallback={<InventoryEmptyState inventory={props.inventory} inventoryLoading={props.inventoryLoading} />}>
          <div class="grid gap-3" style={{ "grid-template-columns": "repeat(auto-fill, minmax(190px, 1fr))" }}>
            <For each={props.filteredItems}>{(item) => (
              <button type="button" class={`focus:outline-none focus:ring-2 focus:ring-cyan-400/50 ${itemCardClass(item)}`} aria-pressed={props.removeFromStorageMode ? props.storageSelectedItemIds.includes(item.id) : props.selectionMode === "inventory" ? props.selectedItem?.id === item.id : props.selectedItemIds.includes(item.id)} onClick={(event) => { event.stopPropagation(); props.onSelectItem(item); }}>
                <TradeLockIndicator item={item} />
                <ItemIcon item={item} large />
                <div class={compactLayout()}>{compactSummary(item)}</div>
              </button>
        )}</For>
          </div>
        </Show>
      </PullToRefresh>
      <div class="min-h-0 overflow-hidden">
        {props.detailsPanel}
      </div>
    </div>
  );
}

function InventoryEmptyState(props: { inventory: InventorySnapshot | undefined; inventoryLoading: boolean }) {
  return (
    <Show when={props.inventoryLoading} fallback={<Alert class="flex h-full min-h-48 items-center justify-center"><p>No inventory items are loaded.</p></Alert>}>
      <InventoryLoadingState active={props.inventoryLoading} title="Loading CS2 inventory" stages={inventoryLoadingStages} currentStage={props.inventory?.message} />
    </Show>
  );
}

function ItemIcon(props: { item: InventoryItemDto; large?: boolean }) {
  const boxClass = () => props.large ? "flex h-36 w-full items-center justify-center bg-transparent text-xl font-semibold text-slate-600" : "flex h-16 w-20 shrink-0 items-center justify-center rounded bg-slate-950 text-sm font-semibold text-slate-600";
  const imageClass = () => props.large ? "h-36 w-full bg-transparent object-contain object-top" : "h-16 w-20 shrink-0 rounded bg-slate-950 object-contain object-top";
  return (
    <div class={props.large ? "w-full" : "w-20 shrink-0"}>
      <Show when={props.item.imageUrl} fallback={<div class={boxClass()}>{itemInitials(props.item)}</div>}>
        <img class={imageClass()} src={props.item.imageUrl} alt={itemDisplayName(props.item)} loading="lazy" />
      </Show>
    </div>
  );
}

function ItemWear(props: { item: InventoryItemDto }) {
  return <Show when={hasSkinWearFloat(props.item)}><div class="mt-auto pt-3"><WearRangeBar compact wear={props.item.paintWear} min={props.item.paintWearMin} max={props.item.paintWearMax} /><p class="mt-1 text-right font-mono text-[11px] text-slate-400">{formatFloat(props.item.paintWear!)}</p></div></Show>;
}
