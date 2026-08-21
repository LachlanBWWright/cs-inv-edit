import { Show } from "solid-js";
import type { GameInventoryViewProps } from "./GameInventoryView.js";
import type { createGameInventoryModel } from "./game-inventory-model.js";
import { InventoryDetailBody } from "./game-inventory-details.js";

export function GameInventoryDetails(input: {
  props: GameInventoryViewProps;
  model: ReturnType<typeof createGameInventoryModel>;
}) {
  const {
    marketPrices,
    selectedPriceScan,
    selectedPriceScanLoading,
    selected,
    selectedTF2Details,
    selectedTF2Item,
    selectedSteamItem,
    selectedServiceDetails,
    selectedSaleUrl,
    selectedInventoryUrl,
    selectedTF2Market,
    selectedTF2MarketPrice,
  } = input.model;
  return (
    <aside class="h-full min-h-0 overflow-y-auto rounded-2xl border border-slate-800 bg-slate-950 p-4">
      <Show
        when={selected()}
        fallback={
          <p class="text-sm text-slate-400">Select an item to inspect it.</p>
        }
      >
        {(item) => (
          <InventoryDetailBody
            item={item()}
            marketPrices={marketPrices()}
            selectedPriceScan={selectedPriceScan}
            selectedPriceScanLoading={selectedPriceScanLoading}
            selectedTF2Details={selectedTF2Details}
            selectedServiceDetails={selectedServiceDetails}
            selectedTF2Market={selectedTF2Market}
            selectedTF2MarketPrice={selectedTF2MarketPrice}
            selectedTF2Item={selectedTF2Item}
            selectedSteamItem={selectedSteamItem}
            selectedInventoryUrl={selectedInventoryUrl}
            selectedSaleUrl={selectedSaleUrl}
            viewProps={input.props}
            model={input.model}
          />
        )}
      </Show>
    </aside>
  );
}
