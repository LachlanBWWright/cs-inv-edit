import { For, Show } from "solid-js";
import type { ConnectionStatus, InventoryItemDto, InventorySnapshot, SettingsData } from "@cs-inv-edit/contracts";
import { InventoryDetailsPanel } from "./InventoryDetailsPanel.js";
import { Alert } from "./ui/Alert.js";
import { Button } from "./ui/Button.js";
import { Card, CardContent } from "./ui/Card.js";
import { Input } from "./ui/Input.js";
import { Select } from "./ui/Select.js";
import { itemDisplayName, itemInitials, itemSubtitle } from "./inventory-view-utils.js";

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
  onRefresh: () => void;
  onQueryChange: (value: string) => void;
  onKindFilterChange: (value: "all" | InventoryItemDto["kind"]) => void;
  onSelectItem: (item: InventoryItemDto, index: number) => void;
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

  return (
    <div class="space-y-5">
      <header class="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h2 class="text-3xl font-semibold text-slate-50">Inventory workspace</h2>
          <p class="mt-2 max-w-2xl text-sm text-slate-400">Inspect and edit inventory items without entering raw IDs.</p>
        </div>
        <div class="flex flex-wrap gap-2">
          <Button variant="secondary" onClick={() => props.onRefresh()}>
            Refresh
          </Button>
        </div>
      </header>

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

      <Card>
        <CardContent class="flex flex-col gap-3 sm:flex-row sm:items-center">
          <Input class="max-w-none" placeholder="Search by name, type, collection, storage, stickers, or tools" value={props.query} onInput={(event) => props.onQueryChange((event.currentTarget as HTMLInputElement | null)?.value ?? "")} />
          <Select value={props.kindFilter} onChange={(event) => props.onKindFilterChange(((event.currentTarget as HTMLInputElement | null)?.value ?? "") as "all" | InventoryItemDto["kind"])}>
            <option value="all">All kinds</option>
            <option value="weapon_skin">Weapon skins</option>
            <option value="sticker_item">Stickers</option>
            <option value="tool_item">Tools</option>
            <option value="cs2_econ_item">CS2 items</option>
            <option value="container">Containers</option>
            <option value="storage_unit">Storage units</option>
            <option value="unknown">Unknown</option>
          </Select>
        </CardContent>
      </Card>

      <div class="grid grid-cols-1 gap-4 xl:grid-cols-[1.4fr_0.9fr]">
        <div class="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Show when={props.filteredItems.length > 0} fallback={<Alert>{props.inventoryLoading ? "Loading CS2 inventory from Steam Game Coordinator..." : "No inventory items are loaded."}</Alert>}>
            <For each={props.filteredItems}>
              {(item, index) => (
                <button
                  type="button"
                  class={`min-h-28 cursor-pointer rounded-2xl border border-slate-800 text-left shadow-[0_10px_60px_-30px_rgba(34,211,238,0.35)] transition duration-150 hover:border-cyan-400/50 hover:bg-slate-800/90 hover:shadow-[0_0_0_1px_rgba(34,211,238,0.18)] focus:outline-none focus:ring-2 focus:ring-cyan-400/50 ${
                    props.selectedItemKey === `${index()}:${item.id}:${item.defindex ?? ""}:${item.marketName ?? item.name}` ? "border-cyan-500/60 bg-cyan-500/10 shadow-[0_0_0_1px_rgba(34,211,238,0.25)]" : "bg-slate-900/70"
                  }`}
                  onClick={() => props.onSelectItem(item, index())}
                >
                  <CardContent>
                    <div class="flex items-start justify-between gap-3">
                      <div class="flex min-w-0 gap-3">
                        <ItemIcon item={item} />
                        <div class="min-w-0">
                          <strong class="text-base leading-snug text-slate-50">{itemDisplayName(item)}</strong>
                          <Show when={itemSubtitle(item)}>
                            <p class="mt-1 text-sm text-slate-400">{itemSubtitle(item)}</p>
                          </Show>
                        </div>
                      </div>
                    </div>
                    <dl class="mt-4 grid gap-1 text-sm text-slate-400">
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
                      <Show when={item.paintWear !== undefined}>
                        <div class="flex justify-between gap-3">
                          <dt>Wear</dt>
                          <dd>{item.paintWear}</dd>
                        </div>
                      </Show>
                      <Show when={item.marketPrice}>
                        <div class="flex justify-between gap-3">
                          <dt>Market</dt>
                          <dd>{item.marketPrice}</dd>
                        </div>
                      </Show>
                    </dl>
                  </CardContent>
                </button>
              )}
            </For>
          </Show>
        </div>

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
  );
}
