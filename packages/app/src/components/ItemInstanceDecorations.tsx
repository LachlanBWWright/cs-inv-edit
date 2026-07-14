import { For, Show } from "solid-js";
import type { InventoryItemDto } from "@cs-inv-edit/contracts";
import { formatFloat, hasSkinWearFloat } from "./item-instance-utils.js";

export function ItemInstanceDecorations(props: { item: InventoryItemDto; showFloat?: boolean }) {
  return (
    <div class="mt-2 flex flex-wrap items-center gap-1.5">
      <Show when={props.item.isStatTrak}><span class="rounded bg-orange-500/20 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-orange-300">StatTrak™</span></Show>
      <Show when={props.item.isSouvenir}><span class="rounded bg-amber-400/20 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-amber-200">Souvenir</span></Show>
      <Show when={props.showFloat && hasSkinWearFloat(props.item)}>
        <span class="font-mono text-[11px] text-slate-400" title="Paint wear float">{formatFloat(props.item.paintWear!)}</span>
      </Show>
      <For each={(props.item.appliedItems ?? []).filter((applied) => !!applied.imageUrl)}>{(applied) => (
        <span class="inline-flex h-4 w-4 items-center justify-center overflow-hidden rounded-sm border border-slate-600 bg-slate-800" title={`${applied.kind}: ${applied.name}`}>
          <img class="h-full w-full object-contain" src={applied.imageUrl} alt={applied.name} loading="lazy" />
        </span>
      )}</For>
    </div>
  );
}
