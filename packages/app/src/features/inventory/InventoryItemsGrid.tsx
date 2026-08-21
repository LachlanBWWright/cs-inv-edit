import { For } from "solid-js";
import type { EconomyInventoryItemDto } from "@cs-inv-edit/contracts";
import type { CompactMode } from "../../shared/ui-types.js";
import { GameInventoryCard } from "./GameInventoryCard.js";

export interface InventoryItemsGridProps {
  items: EconomyInventoryItemDto[];
  selectedAssetId?: string;
  selectedAssetIds?: string[];
  compactMode: CompactMode;
  marketPrices: ReadonlyMap<string, number | undefined>;
  onSelectAsset: (assetId: string) => void;
}

export function InventoryItemsGrid(props: InventoryItemsGridProps) {
  return (
    <div
      class="grid gap-3"
      style={{
        "grid-template-columns": "repeat(auto-fill, minmax(190px, 1fr))",
      }}
    >
      <For each={props.items}>
        {(item) => (
          <GameInventoryCard
            item={item}
            selected={
              props.selectedAssetIds?.includes(item.assetId) ??
              props.selectedAssetId === item.assetId
            }
            compactMode={props.compactMode}
            priceMinor={props.marketPrices.get(item.marketName ?? "")}
            onSelect={() => props.onSelectAsset(item.assetId)}
          />
        )}
      </For>
    </div>
  );
}
