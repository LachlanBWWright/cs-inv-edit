import { createMemo, createSignal, For, Show, type Component } from "solid-js";
import type { InventoryItemDto, InventorySnapshot } from "../lib/backend";
import { InventoryGrid } from "./InventoryGrid";
import { ItemDetailsPanel } from "./ItemDetailsPanel";

interface InventoryViewProps {
  inventory: InventorySnapshot | null;
  error?: string | null;
  loading: boolean;
  onRefresh(): void;
}

export const InventoryView: Component<InventoryViewProps> = (props) => {
  const [query, setQuery] = createSignal("");
  const [kind, setKind] = createSignal("all");
  const [selectedId, setSelectedId] = createSignal<string | undefined>();

  const filteredItems = createMemo(() => {
    const items = props.inventory?.items ?? [];
    const q = query().trim().toLowerCase();
    return items.filter((item) => {
      const matchesQuery = !q || item.name.toLowerCase().includes(q) || item.id.toLowerCase().includes(q);
      const matchesKind = kind() === "all" || item.kind === kind();
      return matchesQuery && matchesKind;
    });
  });

  const selectedItem = createMemo(() => filteredItems().find((item) => item.id === selectedId()) ?? props.inventory?.items.find((item) => item.id === selectedId()));

  return (
    <div class="space-y-5">
      <div class="flex flex-col gap-4 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm lg:flex-row lg:items-end lg:justify-between">
        <div>
          <h2 class="text-2xl font-semibold text-slate-900">Inventory</h2>
          <p class="mt-1 text-sm text-slate-600">Search items across the local inventory snapshot and inspect metadata without touching the renderer.</p>
        </div>
        <div class="flex flex-wrap gap-2">
          <label class="flex items-center gap-2 rounded-lg border border-slate-300 bg-slate-50 px-3 py-2 text-sm text-slate-600">
            <span>Search</span>
            <input class="bg-transparent outline-none" value={query()} onInput={(event) => setQuery(event.currentTarget.value)} placeholder="AK-47, sticker..." />
          </label>
          <label class="flex items-center gap-2 rounded-lg border border-slate-300 bg-slate-50 px-3 py-2 text-sm text-slate-600">
            <span>Kind</span>
            <select class="bg-transparent outline-none" value={kind()} onChange={(event) => setKind(event.currentTarget.value)}>
              <option value="all">All</option>
              <option value="weapon_skin">Weapon skin</option>
              <option value="sticker_item">Sticker</option>
              <option value="storage_unit">Storage</option>
              <option value="container">Container</option>
              <option value="unknown">Unknown</option>
            </select>
          </label>
          <button class="rounded-lg border border-slate-300 px-3 py-2 text-sm font-medium text-slate-700 hover:border-slate-500" onClick={() => props.onRefresh()}>
            {props.loading ? "Refreshing..." : "Refresh inventory"}
          </button>
        </div>
      </div>

      <Show when={props.error} fallback={null}>
        <div class="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800">{props.error}</div>
      </Show>

      <div class="grid gap-5 xl:grid-cols-[1.5fr_0.8fr]">
        <InventoryGrid items={filteredItems()} selectedId={selectedId()} onSelect={(item) => setSelectedId(item.id)} />
        <ItemDetailsPanel item={selectedItem()} />
      </div>
    </div>
  );
};
