import { For, Show, type Component } from "solid-js";
import type { InventoryItemDto } from "../lib/backend";
import { formatItemId, formatKind } from "../lib/format";

interface InventoryGridProps {
  items: InventoryItemDto[];
  selectedId?: string;
  onSelect(item: InventoryItemDto): void;
}

export const InventoryGrid: Component<InventoryGridProps> = (props) => {
  return (
    <div class="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
      <For each={props.items}>
        {(item) => {
          const selected = props.selectedId === item.id;
          return (
            <button
              type="button"
              class={`rounded-xl border p-4 text-left shadow-sm transition ${selected ? "border-cyan-500 bg-cyan-50" : "border-slate-200 bg-white hover:border-slate-400"}`}
              onClick={() => props.onSelect(item)}
            >
              <div class="flex items-start justify-between gap-2">
                <div>
                  <div class="text-sm font-semibold text-slate-900">{item.name}</div>
                  <div class="mt-1 text-xs uppercase tracking-wide text-slate-500">{formatKind(item.kind)}</div>
                </div>
                <span class="rounded-full bg-slate-100 px-2 py-1 text-[10px] font-medium uppercase tracking-wide text-slate-600">
                  {item.kind === "storage_unit" ? "storage" : item.kind === "sticker_item" ? "sticker" : "item"}
                </span>
              </div>
              <dl class="mt-4 space-y-1 text-sm text-slate-600">
                <div class="flex justify-between gap-3">
                  <dt>ID</dt>
                  <dd class="max-w-[10rem] truncate font-mono text-xs">{formatItemId(item.id)}</dd>
                </div>
                <Show when={item.paintWear !== undefined}>
                  <div class="flex justify-between gap-3">
                    <dt>Wear</dt>
                    <dd>{item.paintWear?.toFixed(4)}</dd>
                  </div>
                </Show>
                <Show when={item.storageCount !== undefined}>
                  <div class="flex justify-between gap-3">
                    <dt>Storage</dt>
                    <dd>{item.storageCount}</dd>
                  </div>
                </Show>
              </dl>
            </button>
          );
        }}
      </For>
    </div>
  );
};
