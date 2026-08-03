import type { InventoryItemDto } from "@cs-inv-edit/contracts";
import {
  itemKindLabel,
  itemWeaponName,
  sortInventoryItems,
  type InventorySort,
} from "./inventory-view-utils.js";

export interface InventoryFilterInput {
  items: InventoryItemDto[];
  query: string;
  kind: "all" | InventoryItemDto["kind"];
  rarity: string;
  weapon: string;
  collection: string;
  sort: InventorySort;
  marketPrices: ReadonlyMap<string, number>;
}

export function filterInventoryItems(input: InventoryFilterInput) {
  const query = input.query.toLowerCase();
  const matches = input.items.filter((item) => {
    const searchable = [
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
      .toLowerCase();
    return (
      (!query || searchable.includes(query)) &&
      (input.kind === "all" || item.kind === input.kind) &&
      (input.rarity === "all" || item.rarity === input.rarity) &&
      (input.weapon === "all" || itemWeaponName(item) === input.weapon) &&
      (input.collection === "all" || item.collection === input.collection)
    );
  });
  return sortInventoryItems(matches, input.sort, input.marketPrices);
}
