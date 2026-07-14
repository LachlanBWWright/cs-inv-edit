import { For, Show } from "solid-js";
import type { ConnectionStatus, InventoryItemDto, InventorySnapshot, SettingsData } from "@cs-inv-edit/contracts";
import { InventoryDetailsPanel } from "./InventoryDetailsPanel.js";
import { Alert } from "./ui/Alert.js";
import { itemDisplayName, itemInitials, itemSubtitle, rarityBorderClass } from "./inventory-view-utils.js";
import { ItemInstanceDecorations } from "./ItemInstanceDecorations.js";
import { formatFloat, hasSkinWearFloat } from "./item-instance-utils.js";
import { TradeLockIndicator } from "./TradeLockIndicator.js";

function ItemIcon(props: { item: InventoryItemDto; large?: boolean }) {
  const boxClass = () =>
    props.large
      ? "mt-3 flex h-32 w-full items-center justify-center rounded bg-slate-950 text-xl font-semibold text-slate-600"
      : "flex h-16 w-20 shrink-0 items-center justify-center rounded bg-slate-950 text-sm font-semibold text-slate-600";
  const imageClass = () =>
    props.large
      ? "mt-3 h-32 w-full rounded bg-slate-950 object-contain"
      : "h-16 w-20 shrink-0 rounded bg-slate-950 object-contain";

  return (
    <Show when={props.item.imageUrl} fallback={<div class={boxClass()}>{itemInitials(props.item)}</div>}>
      <img class={imageClass()} src={props.item.imageUrl} alt={itemDisplayName(props.item)} loading="lazy" />
    </Show>
  );
}

export interface InventoryViewContentProps {
  inventory: InventorySnapshot | undefined;
  connection: ConnectionStatus | undefined;
  settings: SettingsData | undefined;
  query: string;
  kindFilter: "all" | InventoryItemDto["kind"];
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
  canOpenContainer: boolean;
  canUseNameTagOn: boolean;
  compactMode: "icons" | "concise" | "detailed";
  onRefresh: () => void;
  onQueryChange: (value: string) => void;
  onKindFilterChange: (value: "all" | InventoryItemDto["kind"]) => void;
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
    const isSelected = props.selectedItem?.id === item.id;
    return `group relative min-h-24 cursor-pointer overflow-hidden rounded-2xl border-2 p-3 text-left transition duration-150 ${rarityBorderClass(item.rarity)} ${isSelected ? "bg-cyan-500/10 ring-2 ring-cyan-300" : "bg-slate-900/70 hover:bg-slate-800/90"}`;
  };

  const compactLayout = () => {
    if (props.compactMode === "icons") {
      return "flex flex-col items-center justify-center gap-2 px-3 py-3 text-center";
    }
    if (props.compactMode === "detailed") {
      return "flex flex-col gap-3";
    }
    return "flex items-start gap-3";
  };

  const compactSummary = (item: InventoryItemDto) => {
    if (props.compactMode === "icons") {
      return <div class="text-center"><div class="mb-2 flex h-12 w-12 items-center justify-center rounded-xl bg-slate-950/80 text-sm font-semibold text-slate-500"><span>{itemInitials(item)}</span></div><p class="text-xs font-medium text-slate-200">{itemDisplayName(item)}</p><ItemInstanceDecorations item={item} showFloat /></div>;
    }
    if (props.compactMode === "detailed") {
      return (
        <div class="min-w-0">
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
            <Show when={hasSkinWearFloat(item)}>
              <div class="flex justify-between gap-3"><dt>Float</dt><dd class="font-mono">{formatFloat(item.paintWear!)}</dd></div>
            </Show>
            <Show when={item.marketPrice}>
              <div class="flex justify-between gap-3"><dt>Market</dt><dd>{item.marketPrice}</dd></div>
            </Show>
          </dl>
          <ItemInstanceDecorations item={item} />
        </div>
      );
    }
    return (
      <div class="min-w-0">
        <strong class="text-base leading-tight text-slate-50">{itemDisplayName(item)}</strong>
        <Show when={itemSubtitle(item)}>
          <p class="mt-1 text-sm text-slate-400">{itemSubtitle(item)}</p>
        </Show>
        <ItemInstanceDecorations item={item} showFloat />
      </div>
    );
  };

  return (
    <div class="flex h-full min-h-0 flex-col gap-4">
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

      <div class="grid min-h-0 flex-1 grid-cols-1 gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(320px,0.95fr)]">
        <div class="min-h-0 overflow-y-auto pr-1">
            <Show when={props.filteredItems.length > 0} fallback={<Alert>{props.inventoryLoading ? "Loading CS2 inventory from Steam Game Coordinator..." : "No inventory items are loaded."}</Alert>}>
              <div class="grid grid-cols-1 gap-2 lg:grid-cols-2">
                <For each={props.filteredItems}>
                  {(item) => (
                    <button
                      type="button"
                      class={`cursor-pointer rounded-2xl border-2 p-3 text-left transition duration-150 focus:outline-none focus:ring-2 focus:ring-cyan-400/50 ${itemCardClass(item)}`}
                      aria-pressed={props.selectedItem?.id === item.id}
                      onClick={(event) => { event.stopPropagation(); props.onSelectItem(item); }}
                    >
                      <TradeLockIndicator item={item} />
                      <div class={compactLayout()}>
                        <ItemIcon item={item} />
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
            canOpenContainer={props.canOpenContainer}
            canUseNameTagOn={props.canUseNameTagOn}
            containerStatusMessage={props.containerStatusMessage}
            onOpenRenameEditor={props.onOpenRenameEditor}
            onRenameSubmit={props.onRenameSubmit}
            onRemoveName={props.onRemoveName}
            onOpenContainer={props.onOpenContainer}
            onCloseRename={props.onCloseRename}
            onDraftNameChange={props.onDraftNameChange}
            onSelectedToolChange={props.onSelectedToolChange}
          />
        </div>
      </div>
    </div>
  );
}
