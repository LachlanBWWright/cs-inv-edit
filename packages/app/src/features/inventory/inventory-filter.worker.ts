import {
  createInventorySearchIndex,
  filterInventoryItems,
} from "./inventory-filtering.js";
import type {
  InventoryFilterWorkerRequest,
  InventoryFilterWorkerResponse,
} from "./inventory-filter-worker-protocol.js";
import type { InventoryItemDto } from "@cs-inv-edit/contracts";

declare const self: {
  onmessage: (
    event: MessageEvent<InventoryFilterWorkerRequest>,
  ) => void;
  postMessage: (message: InventoryFilterWorkerResponse) => void;
};

let items: InventoryItemDto[] = [];
let searchIndex = createInventorySearchIndex(items);

self.onmessage = (event: MessageEvent<InventoryFilterWorkerRequest>) => {
  const request = event.data;
  if (request.type === "set-items") {
    items = request.items;
    searchIndex = createInventorySearchIndex(items);
    return;
  }

  const filtered = filterInventoryItems({
    items,
    query: request.query,
    kind: request.kind,
    rarity: request.rarity,
    weapon: request.weapon,
    collection: request.collection,
    sort: request.sort,
    marketPrices: new Map(request.marketPrices),
    searchIndex,
  });
  const response: InventoryFilterWorkerResponse = {
    requestId: request.requestId,
    itemIds: filtered.map((item) => item.id),
  };
  self.postMessage(response);
};
