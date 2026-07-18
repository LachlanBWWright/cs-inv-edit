import { For, Show } from "solid-js";
import type { ConnectionStatus, InventoryItemDto, InventorySnapshot, SettingsData } from "@cs-inv-edit/contracts";
import { InventoryDetailsPanel } from "./InventoryDetailsPanel.js";
import { Alert } from "./ui/Alert.js";
import { compactItemMeta, compactItemName, itemDisplayName, itemInitials, itemKindLabel, itemSubtitle, rarityBorderClass, type InventorySort } from "./inventory-view-utils.js";
import { ItemInstanceDecorations } from "./ItemInstanceDecorations.js";
import { formatFloat, hasSkinWearFloat } from "./item-instance-utils.js";
import { TradeLockIndicator } from "./TradeLockIndicator.js";
import type { InventoryMode } from "../view.js";
import { LoadingProgress, type LoadingStage } from "./ui/LoadingProgress.js";
import { WearRangeBar } from "./ui/WearRangeBar.js";

const inventoryLoadingStages: readonly LoadingStage[] = [
  { afterSeconds: 0, label: "Contacting the CS2 Game Coordinator", detail: "Requesting the authoritative owned-item SOCache for this Steam account." },
  { afterSeconds: 8, label: "Waiting for inventory data", detail: "The Game Coordinator can take several retries before it sends the inventory snapshot." },
  { afterSeconds: 20, label: "Resolving current CS2 item metadata", detail: "Loading the live item schema, localization, and tracked image index." },
  { afterSeconds: 35, label: "Enriching item previews", detail: "Matching names, images, collections, containers, and available Steam market metadata." },
  { afterSeconds: 65, label: "Still working—Steam is responding slowly", detail: "The request remains active. Image and market lookups are bounded, but Steam may throttle metadata requests." },
];

function ItemIcon(props: { item: InventoryItemDto; large?: boolean }) {
  const boxClass = () =>
    props.large
      ? "flex h-36 w-full items-center justify-center bg-slate-950 text-xl font-semibold text-slate-600"
      : "flex h-16 w-20 shrink-0 items-center justify-center rounded bg-slate-950 text-sm font-semibold text-slate-600";
  const imageClass = () =>
    props.large
      ? "h-36 w-full bg-slate-950 object-contain object-top"
      : "h-16 w-20 shrink-0 rounded bg-slate-950 object-contain object-top";

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

export interface InventoryViewContentProps {
  inventory: InventorySnapshot | undefined;
  selectionMode: InventoryMode;
  selectedItemIds: string[];
  connection: ConnectionStatus | undefined;
  settings: SettingsData | undefined;
  query: string;
  kindFilter: "all" | InventoryItemDto["kind"];
  rarityFilter: string;
  weaponFilter: string;
  collectionFilter: string;
  sort: InventorySort;
  rarityOptions: string[];
  weaponOptions: string[];
  collectionOptions: string[];
  filteredItems: InventoryItemDto[];
  selectedItem: InventoryItemDto | undefined;
  selectedItemKey: string | undefined;
  statusMessage: string;
  containerStatusMessage: string;
  renameOpen: boolean;
  draftName: string;
  selectedToolId: string;
  pending: boolean;
  inventoryError: string;
  inventoryDiagnostics: string[];
  inventoryLoading: boolean;
  connected: boolean;
  nameTagTools: InventoryItemDto[];
  compatibleContainerKey: InventoryItemDto | undefined;
  canOpenContainer: boolean;
  canUseNameTagOn: boolean;
  compactMode: "icons" | "concise" | "detailed";
  onRefresh: () => void;
  onMarketPreview: (marketName: string) => Promise<import("@cs-inv-edit/contracts").RelatedItemDto | undefined>;
  onQueryChange: (value: string) => void;
  onKindFilterChange: (value: "all" | InventoryItemDto["kind"]) => void;
  onRarityFilterChange: (value: string) => void;
  onWeaponFilterChange: (value: string) => void;
  onCollectionFilterChange: (value: string) => void;
  onSortChange: (value: InventorySort) => void;
  onCompactModeChange: (value: "icons" | "concise" | "detailed") => void;
  onSelectItem: (item: InventoryItemDto) => void;
  onOpenRenameEditor: (item: InventoryItemDto) => void;
  onRenameSubmit: () => Promise<void> | void;
  onRemoveName: () => Promise<void> | void;
  onOpenContainer: () => Promise<void> | void;
  onCloseRename: () => void;
  onDraftNameChange: (value: string) => void;
  onSelectedToolChange: (value: string) => void;
}

export function InventoryViewContent(props: InventoryViewContentProps) {
  const inventoryDebugEnabled = () => props.settings?.featureFlags.enableInventoryDebug ?? false;

  const itemCardClass = (item: InventoryItemDto) => {
    const isSelected = props.selectionMode === "inventory" ? props.selectedItem?.id === item.id : props.selectedItemIds.includes(item.id);
    return `group relative flex cursor-pointer flex-col overflow-hidden rounded-2xl border-2 bg-slate-950 text-left transition duration-150 ${rarityBorderClass(item.rarity)} ${isSelected ? "ring-2 ring-cyan-300" : "hover:brightness-110"}`;
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
    <div class="flex h-full min-h-0 flex-col gap-4">
	  <Show when={props.selectionMode !== "inventory"}>
		<Alert variant="warning">{props.selectionMode === "inventory-storage" ? "Storage selection is a stub." : "Trade-up selection is a stub."} Select multiple inventory items below; no operation will be performed. Selected: {props.selectedItemIds.length}.</Alert>
	  </Show>
      <Show when={props.inventory?.status === "requires_connection" && !props.connected}>
        <Alert variant="warning">Connect a Steam account to load inventory items and enable name-tag editing.</Alert>
      </Show>
      <Show when={props.inventory?.status === "error"}>
        <Alert variant="danger">
          <div class="space-y-2">
            <p>Inventory sync is unavailable.</p>
            <Show when={props.inventoryError}>
              <details class="text-xs text-rose-100/80">
                <summary class="cursor-pointer">Diagnostics</summary>
                <div class="mt-1 space-y-1 font-mono">
                  <p>{props.inventoryError}</p>
                  <For each={props.inventoryDiagnostics}>{(line) => <p>{line}</p>}</For>
                </div>
              </details>
            </Show>
          </div>
        </Alert>
      </Show>
      <Show when={props.inventory?.status === "ready" && props.inventoryDiagnostics.length > 0}>
        <Alert variant="warning">
          <details class="text-xs text-amber-100/80">
            <summary class="cursor-pointer">Inventory metadata diagnostics</summary>
            <div class="mt-1 space-y-1 font-mono">
              <For each={props.inventoryDiagnostics}>{(line) => <p>{line}</p>}</For>
            </div>
          </details>
        </Alert>
      </Show>

      <Show when={props.statusMessage}>
        <Alert>{props.statusMessage}</Alert>
      </Show>

      <div class="flex flex-wrap gap-2 rounded-2xl border border-slate-800 bg-slate-950/60 p-3">
        <label><span class="sr-only">Item type</span><select aria-label="Item type" class="h-9 rounded-lg border border-slate-700 bg-slate-900 px-3 text-sm text-slate-200" value={props.kindFilter} onInput={(event) => props.onKindFilterChange(event.currentTarget.value as "all" | InventoryItemDto["kind"])}>
          <option value="all">All types</option>
          <For each={["weapon_skin", "sticker_item", "container", "storage_unit", "tool_item", "cs2_econ_item", "unknown"] as const}>{(kind) => <option value={kind}>{itemKindLabel(kind)}</option>}</For>
        </select></label>
        <label><span class="sr-only">Rarity tier</span><select aria-label="Rarity tier" class="h-9 rounded-lg border border-slate-700 bg-slate-900 px-3 text-sm text-slate-200" value={props.rarityFilter} onInput={(event) => props.onRarityFilterChange(event.currentTarget.value)}><option value="all">All rarities</option><For each={props.rarityOptions}>{(rarity) => <option value={rarity}>{rarity}</option>}</For></select></label>
        <label><span class="sr-only">Weapon</span><select aria-label="Weapon" class="h-9 max-w-48 rounded-lg border border-slate-700 bg-slate-900 px-3 text-sm text-slate-200" value={props.weaponFilter} onInput={(event) => props.onWeaponFilterChange(event.currentTarget.value)}><option value="all">All weapons</option><For each={props.weaponOptions}>{(weapon) => <option value={weapon}>{weapon}</option>}</For></select></label>
        <label><span class="sr-only">Collection</span><select aria-label="Collection" class="h-9 max-w-56 rounded-lg border border-slate-700 bg-slate-900 px-3 text-sm text-slate-200" value={props.collectionFilter} onInput={(event) => props.onCollectionFilterChange(event.currentTarget.value)}><option value="all">All collections</option><For each={props.collectionOptions}>{(collection) => <option value={collection}>{collection}</option>}</For></select></label>
        <label class="ml-auto"><span class="sr-only">Sort inventory</span><select aria-label="Sort inventory" class="h-9 rounded-lg border border-slate-700 bg-slate-900 px-3 text-sm text-slate-200" value={props.sort} onInput={(event) => props.onSortChange(event.currentTarget.value as InventorySort)}>
          <option value="name">Name A–Z</option><option value="float-low">Float: low to high</option><option value="float-high">Float: high to low</option><option value="rarity-high">Rarity: high to low</option><option value="rarity-low">Rarity: low to high</option>
        </select></label>
      </div>

      <div class="grid min-h-0 flex-1 grid-cols-1 gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(320px,0.95fr)]">
        <div class="min-h-0 overflow-y-auto pr-1">
            <Show
              when={props.filteredItems.length > 0}
              fallback={
                <Alert class="flex h-full min-h-48 items-center justify-center">
                  <Show when={props.inventoryLoading} fallback={<p>No inventory items are loaded.</p>}>
                    <LoadingProgress active={props.inventoryLoading} title="Loading CS2 inventory" stages={inventoryLoadingStages} currentStage={props.inventory?.message} />
                  </Show>
                </Alert>
              }
            >
              <div class="grid gap-3" style={{ "grid-template-columns": "repeat(auto-fill, minmax(190px, 1fr))" }}>
                <For each={props.filteredItems}>
                  {(item) => (
                    <button
                      type="button"
                      class={`focus:outline-none focus:ring-2 focus:ring-cyan-400/50 ${itemCardClass(item)}`}
                      aria-pressed={props.selectionMode === "inventory" ? props.selectedItem?.id === item.id : props.selectedItemIds.includes(item.id)}
                      onClick={(event) => { event.stopPropagation(); props.onSelectItem(item); }}
                    >
                      <TradeLockIndicator item={item} />
                      <ItemIcon item={item} large />
                      <div class={compactLayout()}>
                        {compactSummary(item)}
                      </div>
                    </button>
                  )}
                </For>
              </div>
            </Show>
        </div>

        <div class="min-h-0 overflow-hidden">
          <InventoryDetailsPanel
            selectedItem={props.selectedItem}
            pending={props.pending}
            renameOpen={props.renameOpen}
            draftName={props.draftName}
            selectedToolId={props.selectedToolId}
            inventoryDebugEnabled={inventoryDebugEnabled()}
            nameTagTools={props.nameTagTools}
            compatibleContainerKey={props.compatibleContainerKey}
            canOpenContainer={props.canOpenContainer}
            canUseNameTagOn={props.canUseNameTagOn}
            containerStatusMessage={props.containerStatusMessage}
            onOpenRenameEditor={props.onOpenRenameEditor}
            onRenameSubmit={props.onRenameSubmit}
            onRemoveName={props.onRemoveName}
            onOpenContainer={props.onOpenContainer}
            onMarketPreview={props.onMarketPreview}
            onCloseRename={props.onCloseRename}
            onDraftNameChange={props.onDraftNameChange}
            onSelectedToolChange={props.onSelectedToolChange}
          />
        </div>
      </div>
    </div>
  );
}
