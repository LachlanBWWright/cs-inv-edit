import { For, Show } from "solid-js";
import type { SidebarProps } from "./Sidebar.js";
import type { InventorySort } from "../inventory/inventory-view-utils.js";
import type { EconomyInventorySort } from "../inventory/game-inventory-utils.js";
import { InventoryFilters } from "../inventory/inventory-view-content-sections.js";
import { SettingsView } from "../settings/SettingsView.js";
import { Button } from "../../shared/ui/Button.js";
import { MobileSheet } from "../../shared/ui/MobileSheet.js";
import { Select } from "../../shared/ui/Select.js";
import {
  isCommerceScreen,
  isEconomyInventoryScreen,
  isInventoryScreen,
} from "./view.js";

export interface MobileNavOptionsProps {
  open: boolean;
  onClose: () => void;
  activeFilterCount: number;
  sortOptions: { value: InventorySort; label: string; detail: string }[];
  props: SidebarProps;
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
        <Show when={isInventoryScreen(props.view)}>
          <section>
            <div class="mb-2 flex items-center justify-between">
              <h3 class="text-xs font-semibold uppercase tracking-[0.14em] text-slate-400">
                Filters
              </h3>
              <button
                type="button"
                class="rounded-lg px-2 py-1 text-xs font-medium text-cyan-300 hover:bg-cyan-950"
                onClick={() => {
                  props.setKindFilter("all");
                  props.setRarityFilter("all");
                  props.setWeaponFilter("all");
                  props.setCollectionFilter("all");
                }}
              >
                Reset
              </button>
            </div>
            <InventoryFilters
              class="grid gap-3"
              kindFilter={props.kindFilter}
              rarityFilter={props.rarityFilter}
              weaponFilter={props.weaponFilter}
              collectionFilter={props.collectionFilter}
              rarityOptions={props.rarityOptions}
              weaponOptions={props.weaponOptions}
              collectionOptions={props.collectionOptions}
              onKindFilterChange={props.setKindFilter}
              onRarityFilterChange={props.setRarityFilter}
              onWeaponFilterChange={props.setWeaponFilter}
              onCollectionFilterChange={props.setCollectionFilter}
            />
          </section>
          <section class="border-t border-slate-800 pt-4">
            <label class="block text-xs font-semibold uppercase tracking-[0.14em] text-slate-400">
              Sort
              <Select
                class="mt-2 h-10 w-full"
                value={props.sort}
                onInput={(event) =>
                  props.setSort(event.currentTarget.value as InventorySort)
                }
              >
                <For each={input.sortOptions}>
                  {(option) => (
                    <option value={option.value}>
                      {option.label} · {option.detail}
                    </option>
                  )}
                </For>
              </Select>
            </label>
          </section>
        </Show>

        <Show when={isEconomyInventoryScreen(props.view)}>
          <section class="border-t border-slate-800 pt-4">
            <label class="block text-xs font-semibold uppercase tracking-[0.14em] text-slate-400">
              Sort
              <Select
                class="mt-2 h-10 w-full"
                value={props.economySort}
                onInput={(event) =>
                  props.setEconomySort(
                    event.currentTarget.value as EconomyInventorySort,
                  )
                }
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
        </Show>

        <Show
          when={
            isEconomyInventoryScreen(props.view) &&
            props.economyCategoryOptions.length > 0
          }
        >
          <section>
            <label class="block text-xs font-semibold uppercase tracking-[0.14em] text-slate-400">
              Category
              <Select
                class="mt-2 h-10 w-full"
                value={props.economyTagFilter}
                onInput={(event) =>
                  props.setEconomyTagFilter(event.currentTarget.value)
                }
              >
                <option value="">All item categories</option>
                <For each={props.economyCategoryOptions}>
                  {([value, label]) => <option value={value}>{label}</option>}
                </For>
              </Select>
            </label>
          </section>
        </Show>

        <Show when={isCommerceScreen(props.view)}>
          <section class="space-y-4">
            <label class="block text-xs font-semibold uppercase tracking-[0.14em] text-slate-400">
              Category
              <Select
                class="mt-2 h-10 w-full"
                value={props.commerceCategoryFilter}
                onInput={(event) =>
                  props.setCommerceCategoryFilter(event.currentTarget.value)
                }
              >
                <option value="">All categories</option>
                <For each={props.commerceCategoryOptions}>
                  {(category) => <option value={category}>{category}</option>}
                </For>
              </Select>
            </label>
            <label class="block text-xs font-semibold uppercase tracking-[0.14em] text-slate-400">
              Sort
              <Select
                class="mt-2 h-10 w-full"
                value={props.commerceSort}
                onInput={(event) =>
                  props.setCommerceSort(
                    event.currentTarget.value as typeof props.commerceSort,
                  )
                }
              >
                <option value="name">Name</option>
                <option value="price-low">Price: low to high</option>
                <option value="price-high">Price: high to low</option>
              </Select>
            </label>
          </section>
        </Show>

        <Show
          when={
            isInventoryScreen(props.view) ||
            isEconomyInventoryScreen(props.view)
          }
        >
          <section class="border-t border-slate-800 pt-4">
            <h3 class="text-xs font-semibold uppercase tracking-[0.14em] text-slate-400">
              Display density
            </h3>
            <div class="mt-2 grid grid-cols-3 gap-2">
              <For each={["icons", "concise", "detailed"] as const}>
                {(mode) => (
                  <button
                    type="button"
                    class={`rounded-lg border px-2 py-2 text-sm font-medium capitalize ${
                      props.compactMode === mode
                        ? "border-cyan-400/40 bg-cyan-950 text-cyan-100"
                        : "border-slate-700 bg-slate-900 text-slate-300"
                    }`}
                    aria-pressed={props.compactMode === mode}
                    onClick={() => props.setCompactMode(mode)}
                  >
                    {mode}
                  </button>
                )}
              </For>
            </div>
          </section>
        </Show>

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
