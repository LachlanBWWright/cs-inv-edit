import type { CommerceSort } from "../commerce/commerce-view-utils.js";
import type { EconomyInventorySort } from "../inventory/game-inventory-utils.js";

export const economySorts = [
  "name",
  "quality-high",
  "quality-low",
  "price-high",
  "price-low",
  "quantity-high",
] as const satisfies readonly EconomyInventorySort[];

export const commerceSorts = [
  "name",
  "price-low",
  "price-high",
] as const satisfies readonly CommerceSort[];
