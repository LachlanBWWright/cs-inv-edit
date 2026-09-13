import { For, Show, type JSX } from "solid-js";
import { Input } from "../../shared/ui/Input.js";
import { Select } from "../../shared/ui/Select.js";
import { IconButton } from "../../shared/ui/IconButton.js";
import {
  isCommerceScreen,
  isEconomyInventoryScreen,
  isInventoryScreen,
} from "./view.js";
import type { NavbarProps } from "./navbar-props.js";
import type { TF2ActivityFilter } from "../tf2/tf2-activity-utils.js";
import type { CS2ActivityFilter } from "../cs2/CS2FeaturesPanel.js";
import { economySorts, commerceSorts } from "./navbar-options.js";
import type { InventorySort } from "../inventory/inventory-view-utils.js";
import { isOption } from "../../shared/lib/options.js";

const inventorySortOptions: [InventorySort, string][] = [
  ["name", "Name: A to Z"],
  ["float-low", "Float: low to high"],
  ["float-high", "Float: high to low"],
  ["rarity-high", "Rarity: high to low"],
  ["rarity-low", "Rarity: low to high"],
  ["price-high", "Price: high to low"],
  ["price-low", "Price: low to high"],
];
const inventoryKinds = [
  "all",
  "weapon_skin",
  "sticker_item",
  "container",
  "storage_unit",
  "tool_item",
  "cs2_econ_item",
  "unknown",
] as const satisfies readonly NavbarProps["kindFilter"][];
const inventorySorts = inventorySortOptions.map(([value]) => value);
const tf2ActivityFilters = [
  "all",
  "contracts",
  "updates",
] as const satisfies readonly TF2ActivityFilter[];
const cs2ActivityFilters = [
  "all",
  "matches",
  "items",
  "missions",
] as const satisfies readonly CS2ActivityFilter[];

import { priceFeaturesEnabled } from "../../shared/lib/feature-flags.js";

function OwnedGameOption(props: { game: { appId: number; name: string } }) {
  return (
    <option value={props.game.appId}>
      {props.game.name} — AppID {props.game.appId}
    </option>
  );
}

export function NavbarContextControls(props: NavbarProps) {
  const inventoryContext = () =>
    isInventoryScreen(props.view) ||
    isEconomyInventoryScreen(props.view) ||
    isCommerceScreen(props.view);
  const setSteamServiceGame: JSX.EventHandler<HTMLSelectElement, InputEvent> = (
    event,
  ) => {
    const value = event.currentTarget.value;
    props.setSteamServiceAppId(value ? Number(value) : undefined);
  };
  const ownedGamePlaceholder = () =>
    props.steamServiceGamesLoading ? "Finding owned games…" : "Choose a game";
  const setTF2Activity: JSX.EventHandler<HTMLSelectElement, InputEvent> = (
    event,
  ) => {
    const value = event.currentTarget.value;
    if (isOption(value, tf2ActivityFilters)) props.setTF2ActivityFilter(value);
  };
  return (
    <>
      <Show when={inventoryContext()}>
        <Show when={props.view === "steam-service-inventory"}>
          <Select
            class="h-full min-w-0 flex-none max-w-64 rounded-none"
            aria-label="Owned game"
            disabled={!props.steamServiceGames?.games.length}
            value={props.steamServiceAppId?.toString() ?? ""}
            onInput={setSteamServiceGame}
          >
            <option value="" disabled>
              {ownedGamePlaceholder()}
            </option>
            <For each={props.steamServiceGames?.games ?? []}>
              {(game) => <OwnedGameOption game={game} />}
            </For>
          </Select>
        </Show>
        <div class="relative min-w-0 flex-1 sm:min-w-[220px]">
          <Input
            class="h-full w-full min-w-0 rounded-none px-2.5 sm:px-3"
            placeholder="Search"
            value={props.query}
            onInput={(event) => props.setQuery(event.currentTarget.value)}
          />
        </div>
        <Show when={isInventoryScreen(props.view)}>
          <Select
            class="hidden h-full min-w-0 flex-none max-w-44 rounded-none sm:block"
            aria-label="Item type"
            value={props.kindFilter}
            onInput={(event) => {
              const value = event.currentTarget.value;
              if (isOption(value, inventoryKinds)) props.setKindFilter(value);
            }}
          >
            <option value="all">All item types</option>
            <option value="weapon_skin">Weapon skins</option>
            <option value="sticker_item">Stickers</option>
            <option value="container">Containers</option>
            <option value="storage_unit">Storage units</option>
            <option value="tool_item">Tools</option>
            <option value="cs2_econ_item">Economy items</option>
            <option value="unknown">Unknown</option>
          </Select>
          <Select
            class="hidden h-full min-w-0 flex-none max-w-48 rounded-none sm:block"
            aria-label="Sort inventory"
            value={props.sort}
            onInput={(event) => {
              const value = event.currentTarget.value;
              if (isOption(value, inventorySorts)) props.setSort(value);
            }}
          >
            <For each={inventorySortOptions}>
              {([value, label]) => (
                <Show
                  when={
                    priceFeaturesEnabled(props.settings) || !value.startsWith("price-")
                  }
                >
                  <option value={value}>{label}</option>
                </Show>
              )}
            </For>
          </Select>
        </Show>
        <Show
          when={
            isEconomyInventoryScreen(props.view) &&
            props.economyCategoryOptions.length > 0
          }
        >
          <Select
            class="hidden h-full min-w-0 flex-none max-w-64 rounded-none sm:block"
            aria-label="Inventory item category"
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
        </Show>
        <Show when={isEconomyInventoryScreen(props.view)}>
          <Select
            class="hidden h-full min-w-0 flex-none rounded-none sm:block"
            aria-label="Sort inventory"
            value={props.economySort}
            onInput={(event) => {
              const value = event.currentTarget.value;
              if (isOption(value, economySorts)) props.setEconomySort(value);
            }}
          >
            <option value="name">Name: A to Z</option>
            <option value="quality-high">Quality: high to low</option>
            <option value="quality-low">Quality: low to high</option>
            <Show when={priceFeaturesEnabled(props.settings)}>
              <option value="price-high">Price: high to low</option>
              <option value="price-low">Price: low to high</option>
            </Show>
            <option value="quantity-high">Quantity: high to low</option>
          </Select>
        </Show>
        <Show when={isCommerceScreen(props.view)}>
          <Select
            class="hidden h-full min-w-0 flex-none max-w-52 rounded-none sm:block"
            aria-label="Offer category"
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
          <Select
            class="hidden h-full min-w-0 flex-none rounded-none sm:block"
            aria-label="Sort offers"
            value={props.commerceSort}
            onInput={(event) => {
              const value = event.currentTarget.value;
              if (isOption(value, commerceSorts)) props.setCommerceSort(value);
            }}
          >
            <option value="name">Name</option>
            <Show when={priceFeaturesEnabled(props.settings)}>
              <option value="price-low">Price: low to high</option>
              <option value="price-high">Price: high to low</option>
            </Show>
          </Select>
        </Show>
      </Show>
      <Show
        when={props.view === "tf2-matches" || props.view === "tf2-campaigns"}
      >
        <Show when={props.view === "tf2-matches"}>
          <Select
            class="h-full min-w-0 flex-none max-w-44 rounded-none"
            aria-label="Match type"
            value={String(props.tf2MatchGroup)}
            disabled={props.tf2ActivityLoading === "history"}
            onInput={(event) =>
              props.setTF2MatchGroup(Number(event.currentTarget.value))
            }
          >
            <option value="7">Casual 12v12</option>
            <option value="6">Casual 9v9</option>
            <option value="5">Casual 6v6</option>
            <option value="4">Competitive 12v12</option>
            <option value="3">Competitive 9v9</option>
            <option value="2">Competitive 6v6</option>
            <option value="1">Mann Up</option>
            <option value="0">MvM Practice</option>
          </Select>
        </Show>
        <Show when={props.view === "tf2-campaigns"}>
          <Select
            class="h-full min-w-0 flex-none max-w-36 rounded-none"
            aria-label="Activity filter"
            value={props.tf2ActivityFilter}
            onInput={setTF2Activity}
          >
            <option value="all">All campaign data</option>
            <option value="contracts">Contracts</option>
            <option value="updates">Reward history</option>
          </Select>
        </Show>
        <IconButton
          class="rounded-none"
          label="Refresh activity"
          disabled={!!props.tf2ActivityLoading}
          onClick={
            props.view === "tf2-matches"
              ? props.onTF2HistoryRefresh
              : props.onTF2CampaignRefresh
          }
        >
          ↻
        </IconButton>
      </Show>
      <Show when={props.view === "cs2-features"}>
        <Input
          class="h-full min-w-0 flex-1 rounded-none"
          placeholder="Search activity"
          value={props.query}
          onInput={(event) => props.setQuery(event.currentTarget.value)}
        />
        <Select
          class="h-full min-w-0 flex-none max-w-40 rounded-none"
          aria-label="Activity filter"
          value={props.cs2ActivityFilter}
          onInput={(event) => {
            const value = event.currentTarget.value;
            if (isOption(value, cs2ActivityFilters))
              props.setCS2ActivityFilter(value);
          }}
        >
          <option value="all">All activity</option>
          <option value="matches">Matches</option>
          <option value="items">Items</option>
          <option value="missions">Missions</option>
        </Select>
        <button
          class="h-full border border-slate-700 px-3 text-sm"
          disabled={props.cs2ActivityLoading}
          onClick={props.onCS2ActivityRefresh}
        >
          {props.cs2ActivityLoading ? "Refreshing…" : "Refresh"}
        </button>
      </Show>
    </>
  );
}
