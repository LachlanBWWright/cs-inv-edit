import { Show } from "solid-js";
import type { SteamTradeItemDto } from "@cs-inv-edit/contracts";

export function TradeItemTile(props: { item: SteamTradeItemDto }) {
  return (
    <div class="flex min-w-0 items-center gap-3 rounded-xl border border-slate-800/80 bg-slate-950 p-2.5">
      <div class="flex h-12 w-12 shrink-0 items-center justify-center rounded-lg bg-slate-900">
        <Show
          when={props.item.imageUrl}
          fallback={<span class="text-xs text-slate-600">No image</span>}
        >
          <img
            class="h-11 w-11 object-contain"
            src={props.item.imageUrl}
            alt=""
            loading="lazy"
          />
        </Show>
      </div>
      <div class="min-w-0">
        <p class="truncate text-sm font-medium text-slate-100">
          {props.item.marketName ||
            props.item.name ||
            `Asset ${props.item.assetId}`}
        </p>
        <p class="truncate text-xs text-slate-500">
          {props.item.type || `App ${props.item.appId}`}
          <Show when={props.item.amount > 1}> · ×{props.item.amount}</Show>
        </p>
      </div>
    </div>
  );
}
