import { createSignal, For, Show } from "solid-js";
import type { InventoryItemDto, InventorySnapshot } from "@cs-inv-edit/contracts";
import { formatItemId } from "../lib/format";

export interface InventoryViewProps {
  inventory: InventorySnapshot | undefined;
  selectedItemId: string | undefined;
  setSelectedItemId: (id: string | undefined) => void;
  onRefresh: () => void;
  onQueueOperation: () => void;
}

export function InventoryView(props: InventoryViewProps) {
  const [query, setQuery] = createSignal("");
  const [kindFilter, setKindFilter] = createSignal<"all" | InventoryItemDto["kind"]>("all");

  const filteredItems = () => {
    const q = query().toLowerCase();
    return (props.inventory?.items ?? []).filter((item) => {
      const matchesQuery = !q || item.name.toLowerCase().includes(q) || item.id.toLowerCase().includes(q);
      const matchesKind = kindFilter() === "all" || item.kind === kindFilter();
      return matchesQuery && matchesKind;
    });
  };

  const selectedItem = () => filteredItems().find((item) => item.id === props.selectedItemId) ?? filteredItems()[0];

  return (
    <div class="space-y-5">
      <header class="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h2 class="text-3xl font-semibold">Inventory</h2>
          <p class="mt-2 max-w-2xl text-sm text-slate-600">Search, inspect, and triage inventory items with development-safe detail cards.</p>
        </div>
        <div class="flex flex-wrap gap-2">
          <button class="rounded-md border border-slate-300 bg-white px-3 py-2 text-sm hover:border-slate-500" onClick={() => props.onRefresh()}>
            Refresh
          </button>
          <button class="rounded-md border border-cyan-700 bg-cyan-700 px-3 py-2 text-sm text-white hover:bg-cyan-800" onClick={() => props.onQueueOperation()}>
            Queue storage stub
          </button>
        </div>
      </header>

      <div class="flex flex-col gap-3 rounded-xl border border-slate-200 bg-white p-4 shadow-sm sm:flex-row sm:items-center">
        <input class="w-full rounded-md border border-slate-300 px-3 py-2 text-sm" placeholder="Search by name or ID" value={query()} onInput={(event) => setQuery(event.currentTarget.value)} />
        <select class="rounded-md border border-slate-300 px-3 py-2 text-sm" value={kindFilter()} onChange={(event) => setKindFilter(event.currentTarget.value as "all" | InventoryItemDto["kind"])}>
          <option value="all">All kinds</option>
          <option value="weapon_skin">Weapon skins</option>
          <option value="sticker_item">Stickers</option>
          <option value="container">Containers</option>
          <option value="storage_unit">Storage units</option>
          <option value="unknown">Unknown</option>
        </select>
      </div>

      <div class="grid grid-cols-1 gap-4 xl:grid-cols-[1.5fr_0.9fr]">
        <div class="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <For each={filteredItems()}>
            {(item) => (
              <article class={`min-h-28 cursor-pointer rounded-lg border p-4 shadow-sm ${props.selectedItemId === item.id ? "border-cyan-600 bg-cyan-50" : "border-slate-200 bg-white"}`} onClick={() => props.setSelectedItemId(item.id)}>
                <div class="flex items-start justify-between gap-3">
                  <strong class="text-base leading-snug">{item.name}</strong>
                  <span class="rounded-md bg-slate-100 px-2 py-1 text-xs text-slate-600">{item.kind}</span>
                </div>
                <dl class="mt-4 grid gap-1 text-sm text-slate-600">
                  <div class="flex justify-between gap-3">
                    <dt>ID</dt>
                    <dd class="truncate font-mono">{formatItemId(item.id)}</dd>
                  </div>
                  <Show when={item.paintWear !== undefined}>
                    <div class="flex justify-between gap-3">
                      <dt>Wear</dt>
                      <dd>{item.paintWear}</dd>
                    </div>
                  </Show>
                  <Show when={item.storageCount !== undefined}>
                    <div class="flex justify-between gap-3">
                      <dt>Stored</dt>
                      <dd>{item.storageCount}</dd>
                    </div>
                  </Show>
                </dl>
              </article>
            )}
          </For>
        </div>

        <aside class="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <Show when={selectedItem()} fallback={<p class="text-sm text-slate-500">No item selected.</p>}>
            {(item) => (
              <div class="space-y-4">
                <div>
                  <p class="text-sm font-medium text-slate-500">Selected item</p>
                  <h3 class="mt-1 text-xl font-semibold">{item().name}</h3>
                </div>
                <div class="rounded-lg border border-slate-200 p-3 text-sm text-slate-600">
                  <div class="flex items-center justify-between">
                    <span>Item ID</span>
                    <span class="font-mono text-slate-900">{item().id}</span>
                  </div>
                  <div class="mt-2 flex flex-wrap gap-2">
                    <Show when={item().stickers && item().stickers.length > 0}>
                      <span class="rounded-full bg-amber-100 px-2 py-1 text-xs text-amber-700">sticker</span>
                    </Show>
                    <Show when={item().storageCount !== undefined}>
                      <span class="rounded-full bg-emerald-100 px-2 py-1 text-xs text-emerald-700">storage</span>
                    </Show>
                    <Show when={item().casketId}>
                      <span class="rounded-full bg-blue-100 px-2 py-1 text-xs text-blue-700">casket linkage</span>
                    </Show>
                    <Show when={item().kind === "unknown"}>
                      <span class="rounded-full bg-rose-100 px-2 py-1 text-xs text-rose-700">unsupported/unknown</span>
                    </Show>
                  </div>
                </div>
              </div>
            )}
          </Show>
        </aside>
      </div>
    </div>
  );
}
