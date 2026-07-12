import { For, Show } from "solid-js";
import type { InventoryItemDto } from "@cs-inv-edit/contracts";
import { Button } from "./ui/Button.js";
import { Card, CardContent } from "./ui/Card.js";
import { Input } from "./ui/Input.js";
import { Select } from "./ui/Select.js";
import { itemDisplayName, itemInitials, itemKindLabel, itemSubtitle } from "./inventory-view-utils.js";

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

export interface InventoryDetailsPanelProps {
  selectedItem: InventoryItemDto | undefined;
  pending: boolean;
  renameOpen: boolean;
  draftName: string;
  selectedToolId: string;
  inventoryDebugEnabled: boolean;
  nameTagTools: InventoryItemDto[];
  canOpenContainer: boolean;
  canUseNameTagOn: boolean;
  containerStatusMessage: string;
  onOpenRenameEditor: (item: InventoryItemDto) => void;
  onRenameSubmit: () => Promise<void> | void;
  onRemoveName: () => Promise<void> | void;
  onOpenContainer: () => Promise<void> | void;
  onCloseRename: () => void;
  onDraftNameChange: (value: string) => void;
  onSelectedToolChange: (value: string) => void;
}

export function InventoryDetailsPanel(props: InventoryDetailsPanelProps) {
  return (
    <Card>
      <CardContent>
        <Show keyed when={props.selectedItem} fallback={<p class="text-sm text-slate-400">No item selected.</p>}>
          {(selected) => (
            <div class="space-y-4">
              <div>
                <p class="text-sm font-medium text-slate-400">Selected item</p>
                <ItemIcon item={selected} large />
                <h3 class="mt-3 text-xl font-semibold text-slate-50">{itemDisplayName(selected)}</h3>
                <Show when={itemSubtitle(selected)}>
                  <p class="mt-1 text-sm text-slate-400">{itemSubtitle(selected)}</p>
                </Show>
              </div>

              <div class="rounded-2xl border border-slate-800 bg-slate-950/50 p-3 text-sm text-slate-300">
                <div class="grid gap-3 sm:grid-cols-2">
                  <Show when={selected.kind}>
                    <div>
                      <p class="text-xs uppercase tracking-wide text-slate-500">Type</p>
                      <p class="mt-1 font-medium text-slate-100">{itemKindLabel(selected.kind)}</p>
                    </div>
                  </Show>
                  <Show when={selected.rarity}>
                    <div>
                      <p class="text-xs uppercase tracking-wide text-slate-500">Rarity</p>
                      <p class="mt-1 font-medium text-slate-100">{selected.rarity}</p>
                    </div>
                  </Show>
                  <Show when={selected.exterior}>
                    <div>
                      <p class="text-xs uppercase tracking-wide text-slate-500">Exterior</p>
                      <p class="mt-1 font-medium text-slate-100">{selected.exterior}</p>
                    </div>
                  </Show>
                  <Show when={selected.storageLocation}>
                    <div>
                      <p class="text-xs uppercase tracking-wide text-slate-500">Storage</p>
                      <p class="mt-1 font-medium text-slate-100">{selected.storageLocation}</p>
                    </div>
                  </Show>
                  <Show when={selected.paintWear !== undefined}>
                    <div>
                      <p class="text-xs uppercase tracking-wide text-slate-500">Wear</p>
                      <p class="mt-1 font-medium text-slate-100">{selected.paintWear}</p>
                    </div>
                  </Show>
                  <Show when={selected.marketPrice}>
                    <div>
                      <p class="text-xs uppercase tracking-wide text-slate-500">Market</p>
                      <p class="mt-1 font-medium text-slate-100">{selected.marketPrice}</p>
                    </div>
                  </Show>
                  <Show when={selected.marketSellListings}>
                    <div>
                      <p class="text-xs uppercase tracking-wide text-slate-500">Listings</p>
                      <p class="mt-1 font-medium text-slate-100">{selected.marketSellListings}</p>
                    </div>
                  </Show>
                  <Show when={selected.stickers && selected.stickers.length > 0}>
                    <div>
                      <p class="text-xs uppercase tracking-wide text-slate-500">Stickers</p>
                      <p class="mt-1 font-medium text-slate-100">{selected.stickers?.length}</p>
                    </div>
                  </Show>
                </div>
              </div>

              <div class="flex flex-wrap gap-2">
                <Show when={props.canOpenContainer}>
                  <div class="flex flex-col gap-2">
                    <Button onClick={() => void props.onOpenContainer()} disabled={props.pending}>
                      Open container
                    </Button>
                    <Show when={props.containerStatusMessage}>
                      <p class="max-w-sm text-sm text-slate-400">{props.containerStatusMessage}</p>
                    </Show>
                  </div>
                </Show>
                <Show when={props.canUseNameTagOn}>
                  <Button variant="secondary" onClick={() => props.onOpenRenameEditor(selected)} disabled={props.pending}>
                    Rename
                  </Button>
                </Show>
                <Show when={selected.hasCustomName || selected.customName}>
                  <Button variant="danger" class="bg-rose-600/90 hover:bg-rose-500" onClick={() => void props.onRemoveName()} disabled={props.pending}>
                    Remove custom name
                  </Button>
                </Show>
              </div>

              <Show when={props.renameOpen}>
                <div class="rounded-2xl border border-slate-800 bg-slate-950/70 p-4 text-sm text-slate-300">
                  <label class="block font-medium text-slate-100">Custom name</label>
                  <Input class="mt-2" value={props.draftName} onInput={(event) => props.onDraftNameChange((event.currentTarget as HTMLInputElement | null)?.value ?? "")} />
                  <Show when={props.nameTagTools.length > 0}>
                    <label class="mt-3 block font-medium text-slate-100">Name tag tool</label>
                    <Select class="mt-2 w-full" value={props.selectedToolId} onChange={(event) => props.onSelectedToolChange((event.currentTarget as HTMLInputElement | null)?.value ?? "")}>
                      <For each={props.nameTagTools}>{(tool) => <option value={tool.id}>{tool.name}</option>}</For>
                    </Select>
                  </Show>
                  <Show when={props.nameTagTools.length === 0}>
                    <p class="mt-3 text-xs text-slate-500">No compatible name tag tools are available in the current inventory.</p>
                  </Show>
                  <div class="mt-4 flex flex-wrap gap-2">
                    <Button onClick={() => void props.onRenameSubmit()} disabled={props.pending}>
                      Apply
                    </Button>
                    <Button variant="secondary" onClick={() => props.onCloseRename()} disabled={props.pending}>
                      Cancel
                    </Button>
                  </div>
                </div>
              </Show>

              <details class="rounded-2xl border border-slate-800 p-3 text-sm text-slate-400">
                <summary class="cursor-pointer font-medium text-slate-200">Diagnostics</summary>
                <div class="mt-3 space-y-2 font-mono text-xs">
                  <p>Item ID: {selected.id}</p>
                  <Show when={selected.kind === "unknown"}>
                    <p>Kind: unsupported/unknown</p>
                  </Show>
                  <Show when={selected.unsupportedFields?.length}>
                    <p>Unsupported fields: {selected.unsupportedFields?.join(", ")}</p>
                  </Show>
                  <Show when={props.inventoryDebugEnabled && selected.debug}>
                    {(debug) => (
                      <div class="space-y-1 border-t border-slate-800 pt-2">
                        <p>GC ID: {debug().gcId}</p>
                        <p>GC original ID: {debug().gcOriginalId}</p>
                        <p>GC defindex: {debug().gcDefIndex}</p>
                        <p>GC inventory: {debug().gcInventory}</p>
                        <p>GC quantity: {debug().gcQuantity}</p>
                        <p>GC quality: {debug().gcQuality}</p>
                        <p>GC rarity: {debug().gcRarity}</p>
                        <p>GC paint kit: {debug().gcPaintKit}</p>
                        <p>Description matched: {debug().descriptionMatched ? "yes" : "no"}</p>
                        <p>Market fallback used: {debug().marketDescriptionUsed ? "yes" : "no"}</p>
                        <Show when={debug().attributes}>
                          <p>Attributes: {JSON.stringify(debug().attributes)}</p>
                        </Show>
                      </div>
                    )}
                  </Show>
                </div>
              </details>
            </div>
          )}
        </Show>
      </CardContent>
    </Card>
  );
}
