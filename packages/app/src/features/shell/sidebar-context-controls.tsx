import { For, Show, type JSX } from "solid-js";
import { Input } from "../../shared/ui/Input.js";
import { Select } from "../../shared/ui/Select.js";
import { IconButton } from "../../shared/ui/IconButton.js";
import {
  isCommerceScreen,
  isEconomyInventoryScreen,
  isInventoryScreen,
} from "./view.js";
import type { SidebarProps } from "./sidebar-props.js";
import type { TF2ActivityFilter } from "../tf2/tf2-activity-utils.js";
import type { CS2ActivityFilter } from "../cs2/CS2FeaturesPanel.js";
import type { EconomyInventorySort } from "../inventory/game-inventory-utils.js";
import type { CommerceSort } from "../commerce/commerce-view-utils.js";
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
] as const satisfies readonly SidebarProps["kindFilter"][];
const inventorySorts = inventorySortOptions.map(([value]) => value);
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

function OwnedGameOption(props: { game: { appId: number; name: string } }) {
  return (
    <option value={props.game.appId}>
      {props.game.name} — AppID {props.game.appId}
    </option>
  );
}

export function SidebarContextControls(props: SidebarProps) {
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
            class="h-10 max-w-64"
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
            class="h-10 w-full min-w-0 px-2.5 sm:h-auto sm:px-3"
            placeholder="Search"
            value={props.query}
            onInput={(event) => props.setQuery(event.currentTarget.value)}
          />
        </div>
        <Show when={isInventoryScreen(props.view)}>
          <Select
            class="hidden h-9 max-w-44 sm:block"
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
            class="hidden h-9 max-w-48 sm:block"
            aria-label="Sort inventory"
            value={props.sort}
            onInput={(event) => {
              const value = event.currentTarget.value;
              if (isOption(value, inventorySorts)) props.setSort(value);
            }}
          >
            <For each={inventorySortOptions}>
              {([value, label]) => <option value={value}>{label}</option>}
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
            class="hidden h-9 max-w-64 sm:block"
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
            class="hidden h-9 sm:block"
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
            <option value="price-high">Price: high to low</option>
            <option value="price-low">Price: low to high</option>
            <option value="quantity-high">Quantity: high to low</option>
          </Select>
        </Show>
        <Show when={isCommerceScreen(props.view)}>
          <Select
            class="hidden h-9 max-w-52 sm:block"
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
            class="hidden h-9 sm:block"
            aria-label="Sort offers"
            value={props.commerceSort}
            onInput={(event) => {
              const value = event.currentTarget.value;
              if (isOption(value, commerceSorts)) props.setCommerceSort(value);
            }}
          >
            <option value="name">Name</option>
            <option value="price-low">Price: low to high</option>
            <option value="price-high">Price: high to low</option>
          </Select>
        </Show>
      </Show>
      <Show
        when={props.view === "tf2-matches" || props.view === "tf2-campaigns"}
      >
        <Show when={props.view === "tf2-matches"}>
          <Select
            class="h-9 max-w-44"
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
            class="h-9 max-w-36"
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
          class="h-10 min-w-0 flex-1"
          placeholder="Search activity"
          value={props.query}
          onInput={(event) => props.setQuery(event.currentTarget.value)}
        />
        <Select
          class="h-9 max-w-40"
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
          class="h-9 rounded-lg border border-slate-700 px-3 text-sm"
          disabled={props.cs2ActivityLoading}
          onClick={props.onCS2ActivityRefresh}
        >
          {props.cs2ActivityLoading ? "Refreshing…" : "Refresh"}
        </button>
      </Show>
    </>
  );
}
