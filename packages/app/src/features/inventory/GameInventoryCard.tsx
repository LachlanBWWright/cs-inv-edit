import { Show } from "solid-js";
import type { EconomyInventoryItemDto } from "@cs-inv-edit/contracts";
import type { CompactMode } from "../../shared/ui-types.js";
import { economyOutlineClass } from "./game-inventory-utils.js";
import { ItemMarketBadges } from "./ItemMarketBadges.js";
import { ItemImage } from "./game-inventory-elements.js";
import { TF2ItemEffectBadges } from "../tf2/TF2ItemEffectBadges.js";

export function GameInventoryCard(props: {
  item: EconomyInventoryItemDto;
  selected: boolean;
  compactMode: CompactMode;
  priceMinor: number | undefined;
  onSelect: () => void;
}) {
  const typeAndQuality = () =>
    [props.item.type, props.item.quality].filter(Boolean).join(" · ");
  return (
    <button
      type="button"
      class={`inventory-item-card rarity-outline group relative flex cursor-pointer flex-col overflow-hidden rounded-2xl border-2 bg-slate-950 text-left transition ${props.item.game === "tf2" ? "" : "duration-150"} ${economyOutlineClass(props.item)} ${props.selected ? "is-selected" : ""}`}
      aria-pressed={props.selected}
      onClick={props.onSelect}
    >
      <ItemMarketBadges item={props.item} priceMinor={props.priceMinor} />
      <Show when={props.item.game === "tf2"}>
        <TF2ItemEffectBadges item={props.item} />
      </Show>
      <ItemImage item={props.item} card />
      <div
        class={
          props.compactMode === "icons"
            ? "flex flex-1 flex-col px-3 py-3 text-center"
            : "flex flex-1 flex-col px-3 py-3"
        }
      >
        <p
          class={`${props.compactMode === "icons" ? "text-xs" : "text-base"} line-clamp-2 font-medium leading-tight text-slate-100`}
          title={props.item.name}
        >
          {props.item.name}
        </p>
        <Show when={props.compactMode !== "icons"}>
          <Show when={props.item.details.customName}>
            <p class="mt-1 truncate text-sm text-cyan-200">
              “{props.item.details.customName}”
            </p>
          </Show>
          <Show when={props.item.type || props.item.quality}>
            <p class="mt-1 truncate text-sm text-slate-400">
              {typeAndQuality()}
            </p>
          </Show>
        </Show>
        <Show when={props.item.quantity > 1}>
          <p class="mt-1 text-xs text-slate-400">
            Quantity {props.item.quantity}
          </p>
        </Show>
      </div>
    </button>
  );
}
