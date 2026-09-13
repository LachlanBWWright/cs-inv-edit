import type { InventoryItemDto } from "@cs-inv-edit/contracts";
import {
  itemKindLabel,
  itemWeaponName,
  sortInventoryItems,
  type InventorySort,
} from "./inventory-view-utils.js";

export interface InventoryFilterInput {
  items: InventoryItemDto[];
  searchIndex?: ReadonlyMap<InventoryItemDto, InventorySearchEntry>;
  query: string;
  kind: "all" | InventoryItemDto["kind"];
  rarity: string;
  weapon: string;
  collection: string;
  sort: InventorySort;
  marketPrices: ReadonlyMap<string, number>;
}

export interface InventorySearchEntry {
  item: InventoryItemDto;
  searchable: string;
  weapon: string | undefined;
}

function createInventorySearchEntry(item: InventoryItemDto): InventorySearchEntry {
  return {
    item,
    searchable: [
      item.name,
      item.marketName,
      item.marketPrice,
      item.customName,
      item.kind,
      itemKindLabel(item.kind),
      item.collection,
      item.exterior,
      item.rarity,
      item.storageLocation,
      item.toolType,
      item.stickers?.length ? "sticker" : "",
    ]
      .filter(Boolean)
      .join(" ")
      .toLowerCase(),
    weapon: itemWeaponName(item),
  };
}

export function createInventorySearchIndex(items: InventoryItemDto[]) {
  return new Map(items.map((item) => [item, createInventorySearchEntry(item)]));
}

export function filterInventoryItems(input: InventoryFilterInput) {
  const query = input.query.toLowerCase();
  const matches = input.items.filter((item) => {
    const entry = input.searchIndex?.get(item);
    const searchable = entry?.searchable ?? createInventorySearchEntry(item).searchable;
    return (
      (!query || searchable.includes(query)) &&
      (input.kind === "all" || item.kind === input.kind) &&
      (input.rarity === "all" || item.rarity === input.rarity) &&
      (input.weapon === "all" ||
        (entry?.weapon ?? itemWeaponName(item)) === input.weapon) &&
      (input.collection === "all" || item.collection === input.collection)
    );
  });
  return sortInventoryItems(matches, input.sort, input.marketPrices);
}
