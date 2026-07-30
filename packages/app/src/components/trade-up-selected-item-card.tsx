import type { InventoryItemDto } from "@cs-inv-edit/contracts";
import { rarityBorderClass } from "./inventory-view-utils.js";
import { effectiveFloat } from "./trade-up-utils.js";

const formatFloat = (value: number) => value.toFixed(6);
const displayName = (item: { name: string; marketName?: string }) =>
  item.marketName || item.name;

export function SelectedTradeUpItemCard(props: {
  item: InventoryItemDto;
  index: number;
  onRemove: () => void;
}) {
  return (
    <article
      class={`rounded-xl border-2 bg-slate-900/80 p-3 ${rarityBorderClass(props.item.rarity)}`}
    >
      <div class="flex items-start justify-between gap-2">
        <p class="min-w-0 truncate font-medium text-slate-100">
          {props.index + 1}. {displayName(props.item)}
        </p>
        <button
          type="button"
          class="text-xs text-slate-400 hover:text-rose-300"
          onClick={props.onRemove}
        >
          Remove
        </button>
      </div>
      <div class="mt-3 grid grid-cols-2 gap-2 text-xs">
        <div>
          <p class="text-slate-500">Float</p>
          <p class="font-mono text-slate-200">
            {formatFloat(props.item.paintWear!)}
          </p>
        </div>
        <div>
          <p class="text-slate-500">Effective</p>
          <p class="font-mono text-cyan-300">
            {formatFloat(effectiveFloat(props.item))}
          </p>
        </div>
      </div>
      <p class="mt-2 text-xs text-slate-500">
        Caps {formatFloat(props.item.paintWearMin ?? 0)}–
        {formatFloat(props.item.paintWearMax ?? 1)} ·{" "}
        {props.item.collection ?? "Unknown collection"}
      </p>
    </article>
  );
}
