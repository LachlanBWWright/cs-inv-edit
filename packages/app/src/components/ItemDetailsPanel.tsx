import { Show, type Component } from "solid-js";
import type { InventoryItemDto } from "../lib/backend";
import { formatItemId, formatKind } from "../lib/format";

interface ItemDetailsPanelProps {
  item?: InventoryItemDto;
}

export const ItemDetailsPanel: Component<ItemDetailsPanelProps> = (props) => {
  return (
    <aside class="rounded-2xl border border-slate-200 bg-slate-50 p-5 shadow-sm">
      <Show when={props.item} fallback={<div class="text-sm text-slate-500">Select an item to inspect its metadata.</div>}>
        {(item) => (
          <div class="space-y-4">
            <div>
              <p class="text-xs font-semibold uppercase tracking-wide text-cyan-700">Selected item</p>
              <h3 class="mt-1 text-xl font-semibold text-slate-900">{item().name}</h3>
              <p class="mt-1 text-sm text-slate-600">{formatKind(item().kind)}</p>
            </div>

            <dl class="space-y-2 text-sm text-slate-700">
              <div class="flex items-center justify-between gap-3 rounded-lg bg-white px-3 py-2">
                <dt class="font-medium">Item ID</dt>
                <dd class="font-mono text-xs">{formatItemId(item().id)}</dd>
              </div>
              <Show when={item().defindex !== undefined}>
                <div class="flex items-center justify-between gap-3 rounded-lg bg-white px-3 py-2">
                  <dt class="font-medium">Defindex</dt>
                  <dd>{item().defindex}</dd>
                </div>
              </Show>
              <Show when={item().paintWear !== undefined}>
                <div class="flex items-center justify-between gap-3 rounded-lg bg-white px-3 py-2">
                  <dt class="font-medium">Paint wear</dt>
                  <dd>{item().paintWear?.toFixed(4)}</dd>
                </div>
              </Show>
              <Show when={item().storageCount !== undefined}>
                <div class="flex items-center justify-between gap-3 rounded-lg bg-white px-3 py-2">
                  <dt class="font-medium">Storage count</dt>
                  <dd>{item().storageCount}</dd>
                </div>
              </Show>
              <Show when={item().casketId !== undefined}>
                <div class="flex items-center justify-between gap-3 rounded-lg bg-white px-3 py-2">
                  <dt class="font-medium">Casket</dt>
                  <dd class="font-mono text-xs">{item().casketId}</dd>
                </div>
              </Show>
            </dl>

            <div class="rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
              <p class="font-semibold">Badges</p>
              <div class="mt-2 flex flex-wrap gap-2 text-xs">
                <span class="rounded-full bg-white/80 px-2.5 py-1">{item().kind === "sticker_item" ? "sticker" : "inventory"}</span>
                {item().storageCount !== undefined ? <span class="rounded-full bg-white/80 px-2.5 py-1">storage</span> : null}
                {item().casketId ? <span class="rounded-full bg-white/80 px-2.5 py-1">casket linkage</span> : null}
                <span class="rounded-full bg-white/80 px-2.5 py-1">{item().kind === "unknown" ? "unsupported" : "known fields"}</span>
              </div>
            </div>
          </div>
        )}
      </Show>
    </aside>
  );
};
