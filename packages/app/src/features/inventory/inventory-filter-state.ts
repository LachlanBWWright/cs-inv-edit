import { createEffect, createSignal, onCleanup, type Accessor } from "solid-js";
import { Result } from "neverthrow";
import type { InventoryItemDto } from "@cs-inv-edit/contracts";
import { filterInventoryItems } from "./inventory-filtering.js";
import type { InventoryFilterInput } from "./inventory-filtering.js";
import type {
  InventoryFilterWorkerRequest,
  InventoryFilterWorkerResponse,
} from "./inventory-filter-worker-protocol.js";

export function createInventoryFilterState(input: {
  items: Accessor<InventoryItemDto[]>;
  query: Accessor<string>;
  kind: Accessor<InventoryFilterInput["kind"]>;
  rarity: Accessor<string>;
  weapon: Accessor<string>;
  collection: Accessor<string>;
  sort: Accessor<InventoryFilterInput["sort"]>;
  marketPrices: Accessor<ReadonlyMap<string, number>>;
}) {
  const [filteredItems, setFilteredItems] = createSignal<InventoryItemDto[]>(
    [],
  );
  const createWorker = Result.fromThrowable(
    () =>
      new Worker(
        new URL("./inventory-filter.worker.ts", import.meta.url),
        { type: "module" },
      ),
    (cause) => cause,
  );
  const workerResult = createWorker();

  workerResult.match(
    (worker) => {
      const itemsById = () => new Map(input.items().map((item) => [item.id, item]));
      let requestId = 0;
      let latestRequestId = 0;

      worker.onmessage = (event: MessageEvent<InventoryFilterWorkerResponse>) => {
        if (event.data.requestId !== latestRequestId) return;
        const byId = itemsById();
        setFilteredItems(
          event.data.itemIds.flatMap((id) => {
            const item = byId.get(id);
            return item ? [item] : [];
          }),
        );
      };
      worker.onerror = () => setFilteredItems([]);

      createEffect(() => {
        const items = input.items();
        worker.postMessage({
          type: "set-items",
          items,
        } satisfies InventoryFilterWorkerRequest);
        const nextRequestId = ++requestId;
        latestRequestId = nextRequestId;
        const marketPrices = [...input.marketPrices().entries()];
        const timer = window.setTimeout(() => {
          worker.postMessage({
            type: "filter",
            requestId: nextRequestId,
            query: input.query().toLowerCase(),
            kind: input.kind(),
            rarity: input.rarity(),
            weapon: input.weapon(),
            collection: input.collection(),
            sort: input.sort(),
            marketPrices,
          } satisfies InventoryFilterWorkerRequest);
        }, 80);
        onCleanup(() => window.clearTimeout(timer));
      });
      onCleanup(() => worker.terminate());
    },
    () => {
      createEffect(() => {
        const timer = window.setTimeout(() => {
          setFilteredItems(
            filterInventoryItems({
              items: input.items(),
              query: input.query(),
              kind: input.kind(),
              rarity: input.rarity(),
              weapon: input.weapon(),
              collection: input.collection(),
              sort: input.sort(),
              marketPrices: input.marketPrices(),
            }),
          );
        }, 80);
        onCleanup(() => window.clearTimeout(timer));
      });
    },
  );

  return { filteredItems };
}
