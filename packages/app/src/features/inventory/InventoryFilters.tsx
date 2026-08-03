import { For } from "solid-js";
import type { InventoryItemDto } from "@cs-inv-edit/contracts";
import { itemKindLabel } from "./inventory-view-utils.js";

export interface InventoryFiltersProps {
  class?: string;
  kindFilter: "all" | InventoryItemDto["kind"];
  rarityFilter: string;
  weaponFilter: string;
  collectionFilter: string;
  rarityOptions: string[];
  weaponOptions: string[];
  collectionOptions: string[];
  onKindFilterChange: (value: "all" | InventoryItemDto["kind"]) => void;
  onRarityFilterChange: (value: string) => void;
  onWeaponFilterChange: (value: string) => void;
  onCollectionFilterChange: (value: string) => void;
}

export function InventoryFilters(props: InventoryFiltersProps) {
  const selectClass =
    "mt-1.5 h-10 w-full rounded-xl border border-slate-700/80 bg-slate-900 px-3 text-sm text-slate-100 outline-none transition hover:border-slate-600 focus:border-cyan-400/70 focus:ring-2 focus:ring-cyan-400/15";
  const filters = [
    {
      label: "Rarity",
      ariaLabel: "Rarity tier",
      value: props.rarityFilter,
      options: props.rarityOptions,
      allLabel: "All rarities",
      onChange: props.onRarityFilterChange,
    },
    {
      label: "Weapon",
      ariaLabel: "Weapon",
      value: props.weaponFilter,
      options: props.weaponOptions,
      allLabel: "All weapons",
      onChange: props.onWeaponFilterChange,
    },
    {
      label: "Collection",
      ariaLabel: "Collection",
      value: props.collectionFilter,
      options: props.collectionOptions,
      allLabel: "All collections",
      onChange: props.onCollectionFilterChange,
    },
  ];
  return (
    <div
      class={
        props.class ??
        "grid gap-3 rounded-2xl border border-slate-800 bg-slate-950 p-3 sm:grid-cols-2"
      }
    >
      <label class="block text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-400">
        Item type
        <select
          aria-label="Item type"
          class={selectClass}
          value={props.kindFilter}
          onInput={(event) =>
            props.onKindFilterChange(
              event.currentTarget.value as "all" | InventoryItemDto["kind"],
            )
          }
        >
          <option value="all">All types</option>
          <For
            each={
              [
                "weapon_skin",
                "sticker_item",
                "container",
                "storage_unit",
                "tool_item",
                "cs2_econ_item",
                "unknown",
              ] as const
            }
          >
            {(kind) => <option value={kind}>{itemKindLabel(kind)}</option>}
          </For>
        </select>
      </label>
      <For each={filters}>
        {(filter) => (
          <label class="block text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-400">
            {filter.label}
            <select
              aria-label={filter.ariaLabel}
              class={selectClass}
              value={filter.value}
              onInput={(event) => filter.onChange(event.currentTarget.value)}
            >
              <option value="all">{filter.allLabel}</option>
              <For each={filter.options}>
                {(option) => <option value={option}>{option}</option>}
              </For>
            </select>
          </label>
        )}
      </For>
    </div>
  );
}
