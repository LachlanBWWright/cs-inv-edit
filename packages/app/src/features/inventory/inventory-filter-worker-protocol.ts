import type { InventoryItemDto } from "@cs-inv-edit/contracts";
import type { InventorySort } from "./inventory-view-utils.js";

export type InventoryFilterWorkerRequest =
  | { type: "set-items"; items: InventoryItemDto[] }
  | {
      type: "filter";
      requestId: number;
      query: string;
      kind: "all" | InventoryItemDto["kind"];
      rarity: string;
      weapon: string;
      collection: string;
      sort: InventorySort;
      marketPrices: Array<[string, number]>;
    };

export interface InventoryFilterWorkerResponse {
  requestId: number;
  itemIds: string[];
}
