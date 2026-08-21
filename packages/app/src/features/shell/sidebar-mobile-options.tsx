import { For, Show, type JSX } from "solid-js";
import type { SidebarProps } from "./Sidebar.js";
import type { InventorySort } from "../inventory/inventory-view-utils.js";
import type { EconomyInventorySort } from "../inventory/game-inventory-utils.js";
import type { CommerceSort } from "../commerce/commerce-view-utils.js";
import { isOption } from "../../shared/lib/options.js";
import { InventoryFilters } from "../inventory/InventoryFilters.js";
import { SettingsView } from "../settings/SettingsView.js";
import { Button } from "../../shared/ui/Button.js";
import { MobileSheet } from "../../shared/ui/MobileSheet.js";
import { Select } from "../../shared/ui/Select.js";
import {
  isCommerceScreen,
  isEconomyInventoryScreen,
  isInventoryScreen,
} from "./view.js";

const economySorts = [
  "name",
  "quality-high",
  "quality-low",
  "price-high",
  "price-low",
  "quantity-high",
] as const satisfies readonly EconomyInventorySort[];
const commerceSorts = [
  "name",
  "price-low",
  "price-high",
] as const satisfies readonly CommerceSort[];

export interface MobileNavOptionsProps {
  open: boolean;
  onClose: () => void;
  activeFilterCount: number;
  sortOptions: { value: InventorySort; label: string; detail: string }[];
  props: SidebarProps;
}

function SortOption(props: {
  option: MobileNavOptionsProps["sortOptions"][number];
}) {
  return (
    <option value={props.option.value}>
      {props.option.label} · {props.option.detail}
    </option>
  );
}

function InventoryFilterSection(props: {
  input: MobileNavOptionsProps;
  props: SidebarProps;
}) {
  if (!isInventoryScreen(props.props.view)) return null;
  const setSort: JSX.EventHandler<HTMLSelectElement, InputEvent> = (event) => {
    const value = event.currentTarget.value;
    const options = props.input.sortOptions.map((option) => option.value);
    if (isOption(value, options)) props.props.setSort(value);
  };
  return (
    <>
      <section>
        <div class="mb-2 flex items-center justify-between">
          <h3 class="text-xs font-semibold uppercase tracking-[0.14em] text-slate-400">
            Filters
          </h3>
          <button
            type="button"
            class="rounded-lg px-2 py-1 text-xs font-medium text-cyan-300 hover:bg-cyan-950"
            onClick={() => {
              props.props.setKindFilter("all");
              props.props.setRarityFilter("all");
              props.props.setWeaponFilter("all");
              props.props.setCollectionFilter("all");
            }}
          >
            Reset
          </button>
        </div>
        <InventoryFilters
          class="grid gap-3"
          kindFilter={props.props.kindFilter}
          rarityFilter={props.props.rarityFilter}
          weaponFilter={props.props.weaponFilter}
          collectionFilter={props.props.collectionFilter}
          rarityOptions={props.props.rarityOptions}
          weaponOptions={props.props.weaponOptions}
          collectionOptions={props.props.collectionOptions}
          onKindFilterChange={props.props.setKindFilter}
          onRarityFilterChange={props.props.setRarityFilter}
          onWeaponFilterChange={props.props.setWeaponFilter}
          onCollectionFilterChange={props.props.setCollectionFilter}
        />
      </section>
      <section class="border-t border-slate-800 pt-4">
        <label class="block text-xs font-semibold uppercase tracking-[0.14em] text-slate-400">
          Sort
          <Select
            class="mt-2 h-10 w-full"
            value={props.props.sort}
            onInput={setSort}
          >
            <For each={props.input.sortOptions}>
              {(option) => <SortOption option={option} />}
            </For>
          </Select>
        </label>
      </section>
    </>
  );
}

function EconomyInventorySection(props: { props: SidebarProps }) {
  if (!isEconomyInventoryScreen(props.props.view)) return null;
  const setEconomySort: JSX.EventHandler<HTMLSelectElement, InputEvent> = (
    event,
  ) => {
    const value = event.currentTarget.value;
    if (isOption(value, economySorts)) props.props.setEconomySort(value);
  };
  const setEconomyTag: JSX.EventHandler<HTMLSelectElement, InputEvent> = (
    event,
  ) => {
    props.props.setEconomyTagFilter(event.currentTarget.value);
  };
  return (
    <>
      <section class="border-t border-slate-800 pt-4">
        <label class="block text-xs font-semibold uppercase tracking-[0.14em] text-slate-400">
          Sort
          <Select
            class="mt-2 h-10 w-full"
            value={props.props.economySort}
            onInput={setEconomySort}
          >
            <option value="name">Name · A to Z</option>
            <option value="quality-high">Quality · High to low</option>
            <option value="quality-low">Quality · Low to high</option>
            <option value="price-high">Steam price · High to low</option>
            <option value="price-low">Steam price · Low to high</option>
            <option value="quantity-high">Quantity · High to low</option>
          </Select>
        </label>
      </section>
      <Show when={props.props.economyCategoryOptions.length > 0}>
        <section>
          <label class="block text-xs font-semibold uppercase tracking-[0.14em] text-slate-400">
            Category
            <Select
              class="mt-2 h-10 w-full"
              value={props.props.economyTagFilter}
              onInput={setEconomyTag}
            >
              <option value="">All item categories</option>
              <For each={props.props.economyCategoryOptions}>
                {([value, label]) => <option value={value}>{label}</option>}
              </For>
            </Select>
          </label>
        </section>
      </Show>
    </>
  );
}

function CommerceSection(props: { props: SidebarProps }) {
  if (!isCommerceScreen(props.props.view)) return null;
  return (
    <section class="space-y-4">
      <label class="block text-xs font-semibold uppercase tracking-[0.14em] text-slate-400">
        Category
        <Select
          class="mt-2 h-10 w-full"
          value={props.props.commerceCategoryFilter}
          onInput={(event) =>
            props.props.setCommerceCategoryFilter(event.currentTarget.value)
          }
        >
          <option value="">All categories</option>
          <For each={props.props.commerceCategoryOptions}>
            {(category) => <option value={category}>{category}</option>}
          </For>
        </Select>
      </label>
      <label class="block text-xs font-semibold uppercase tracking-[0.14em] text-slate-400">
        Sort
        <Select
          class="mt-2 h-10 w-full"
          value={props.props.commerceSort}
          onInput={(event) => {
            const value = event.currentTarget.value;
            if (isOption(value, commerceSorts))
              props.props.setCommerceSort(value);
          }}
        >
          <option value="name">Name</option>
          <option value="price-low">Price: low to high</option>
          <option value="price-high">Price: high to low</option>
        </Select>
      </label>
    </section>
  );
}

export function MobileNavOptions(input: MobileNavOptionsProps) {
  const props = input.props;
  return (
    <MobileSheet
      open={input.open}
      title="Inventory options"
      description={
        input.activeFilterCount > 0
          ? `${input.activeFilterCount} active filters`
          : "Filter, sort, and change the inventory view"
      }
      onClose={input.onClose}
    >
      <div class="space-y-5">
        <InventoryFilterSection input={input} props={props} />
        <EconomyInventorySection props={props} />
        <CommerceSection props={props} />

        <section class="space-y-2 border-t border-slate-800 pt-4">
          <Button
            class="w-full"
            variant="secondary"
            onClick={() => {
              props.onRefreshCurrentInventory();
              input.onClose();
            }}
          >
            Refresh current page
          </Button>
          <details class="group">
            <summary class="flex h-full cursor-pointer list-none items-center justify-center rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-sm font-medium text-slate-100 hover:bg-slate-700">
              Settings
            </summary>
            <div class="mt-3 rounded-2xl border border-slate-800 bg-slate-900 p-3">
              <SettingsView
                settings={props.settings}
                inventory={props.inventory}
                compactMode={props.compactMode}
                onCompactModeChange={props.setCompactMode}
                onRefresh={props.onRefreshInventory}
                onSave={props.onSaveSettings}
              />
            </div>
          </details>
        </section>
      </div>
    </MobileSheet>
  );
}
