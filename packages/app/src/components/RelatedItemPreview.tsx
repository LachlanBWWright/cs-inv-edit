import { Show, createSignal } from "solid-js";
import type { RelatedItemDto } from "@cs-inv-edit/contracts";
import { rarityBorderClass } from "./inventory-view-utils.js";
import { formatProbability, isWeaponFinish, steamMarketURL } from "./related-item-preview-utils.js";

export type RelatedItemPreviewContext = "collection" | "container" | "trade-up";

export function RelatedItemPreview(props: { item: RelatedItemDto; context?: RelatedItemPreviewContext; probability?: number }) {
  const [failed, setFailed] = createSignal(false);
  const label = () => props.item.marketName || props.item.name;

  return <details class={`group rounded-xl border-2 bg-slate-900/80 ${rarityBorderClass(props.item.rarity)}`}>
    <summary class="flex cursor-pointer list-none items-center gap-3 p-3 marker:content-none">
      <Show when={props.item.imageUrl && !failed()} fallback={<div class="flex h-12 w-16 shrink-0 items-center justify-center rounded bg-slate-950 text-xs font-semibold text-slate-600">{label().slice(0, 2).toUpperCase()}</div>}>
        <img class="h-12 w-16 shrink-0 rounded bg-slate-950 object-contain" src={props.item.imageUrl} alt={label()} loading="lazy" referrerpolicy="no-referrer" onError={() => setFailed(true)} />
      </Show>
      <div class="min-w-0 flex-1">
        <p class="truncate font-medium text-slate-100">{label()}</p>
        <Show when={props.context === "container" && props.probability !== undefined}>
          <p class="mt-1 text-xs text-cyan-200">Base drop chance {formatProbability(props.probability!)}</p>
        </Show>
      </div>
      <span class="text-xs text-slate-500 transition-transform group-open:rotate-180" aria-hidden="true">▼</span>
    </summary>
    <div class="border-t border-slate-800/80 px-3 pb-3 pt-3 text-xs text-slate-400">
      <dl class="grid gap-2 sm:grid-cols-2">
        <Show when={props.item.price}><div><dt class="uppercase tracking-wide text-slate-500">Market price</dt><dd class="mt-1 font-medium text-slate-200">{props.item.price}</dd></div></Show>
        <Show when={props.item.rarity}><div><dt class="uppercase tracking-wide text-slate-500">Rarity label</dt><dd class="mt-1 font-medium text-slate-200">{props.item.rarity}</dd></div></Show>
        <Show when={isWeaponFinish(props.item)}>
          <div><dt class="uppercase tracking-wide text-slate-500">Float caps</dt><dd class="mt-1 font-mono text-slate-200">{(props.item.wearMin ?? 0).toFixed(6)}–{(props.item.wearMax ?? 1).toFixed(6)}</dd></div>
        </Show>
        <Show when={props.item.paintWear !== undefined}><div><dt class="uppercase tracking-wide text-slate-500">Predicted float</dt><dd class="mt-1 font-mono text-slate-200">{props.item.paintWear?.toFixed(8)}</dd></div></Show>
      </dl>
      <Show when={props.context === "container" && isWeaponFinish(props.item)}><p class="mt-3 text-slate-500">StatTrak™ chance when supported: 10% of this item’s base drop chance ({formatProbability((props.probability ?? 0) * 0.1)}).</p></Show>
      <Show when={props.item.listingName || (!isWeaponFinish(props.item) && props.item.marketName)}>
        <a class="mt-3 inline-block font-medium text-sky-300 underline decoration-sky-500/50 underline-offset-4 hover:text-sky-200" href={steamMarketURL((props.item.listingName || props.item.marketName)!)} target="_blank" rel="noreferrer">Open exact Steam listing ↗</a>
      </Show>
      <Show when={!props.item.price}><p class="mt-2 text-slate-500">Market price unavailable for this exact market listing.</p></Show>
    </div>
  </details>;
}
