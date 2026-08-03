import { For, Show } from "solid-js";
import {
  ItemMarketBadges,
  marketPriceLabel,
  tradeStateDescription,
} from "./ItemMarketBadges.js";
import {
  ItemImage,
  marketURL,
  SteamItemDiagnostics,
  TF2ItemDiagnostics,
} from "./game-inventory-elements.js";
import { VendorPricePreview } from "../commerce/VendorPricePreview.js";
import { GameInventoryTF2Actions } from "./game-inventory-tf2-actions.js";
import type { GameInventoryViewProps } from "./GameInventoryView.js";
import type { createGameInventoryModel } from "./game-inventory-model.js";
import { GameInventoryCommerceActions } from "./GameInventoryCommerceActions.js";
import { TF2ClassIcons } from "../tf2/TF2ClassIcons.js";

export function GameInventoryDetails(input: {
  props: GameInventoryViewProps;
  model: ReturnType<typeof createGameInventoryModel>;
}) {
  const props = input.props;
  const {
    marketPrices,
    selectedPriceScan,
    selectedPriceScanLoading,
    selected,
    selectedTF2Details,
    selectedTF2Item,
    selectedSteamItem,
    selectedServiceDetails,
    selectedSaleURL,
    selectedInventoryURL,
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
          <div>
            <div class="relative overflow-hidden">
              <ItemMarketBadges
                item={item()}
                priceMinor={marketPrices().get(item().marketName ?? "")}
              />
              <ItemImage item={item()} large />
            </div>
            <h2 class="mt-3 text-xl font-semibold text-slate-50">
              {item().name}
            </h2>
            <Show when={item().details.customName}>
              <p class="mt-1 text-sm font-medium text-cyan-200">
                Name Tag: “{item().details.customName}”
              </p>
            </Show>
            <Show when={item().type}>
              <p class="mt-1 text-sm text-slate-400">{item().type}</p>
            </Show>
            <dl class="mt-4 grid grid-cols-[repeat(auto-fit,minmax(140px,1fr))] gap-3 rounded-2xl border border-slate-800/80 bg-slate-900 p-3 text-sm text-slate-300">
              <Show when={item().rarity}>
                <div>
                  <dt class="text-xs uppercase tracking-wide text-slate-500">
                    Rarity
                  </dt>
                  <dd class="mt-1 text-slate-200">{item().rarity}</dd>
                </div>
              </Show>
              <Show when={item().quality}>
                <div>
                  <dt class="text-xs uppercase tracking-wide text-slate-500">
                    Quality
                  </dt>
                  <dd class="mt-1 text-slate-200">{item().quality}</dd>
                </div>
              </Show>
              <Show
                when={marketPriceLabel(
                  item(),
                  marketPrices().get(item().marketName ?? ""),
                )}
              >
                {(price) => (
                  <div>
                    <dt class="text-xs uppercase tracking-wide text-slate-500">
                      Steam Market price
                    </dt>
                    <dd class="mt-1 font-medium">
                      <Show
                        when={item().marketName}
                        fallback={<span class="text-slate-100">{price()}</span>}
                      >
                        <a
                          class="text-sky-300 underline decoration-sky-500/50 underline-offset-4 hover:text-sky-200"
                          href={marketURL(item())}
                          target="_blank"
                          rel="noreferrer"
                        >
                          {price()}
                        </a>
                      </Show>
                    </dd>
                  </div>
                )}
              </Show>
              <div>
                <dt class="text-xs uppercase tracking-wide text-slate-500">
                  Trade state
                </dt>
                <dd class="mt-1 text-slate-200">
                  {tradeStateDescription(item())}
                </dd>
              </div>
              <div>
                <dt class="text-xs uppercase tracking-wide text-slate-500">
                  Asset identity
                </dt>
                <dd class="mt-1 break-all font-mono text-xs text-slate-300">
                  {item().assetId}
                </dd>
              </div>
              <div>
                <dt class="text-xs uppercase tracking-wide text-slate-500">
                  Level and style
                </dt>
                <dd class="mt-1 text-slate-200">
                  Level {item().details.level} · Style {item().details.style}
                </dd>
              </div>
              <Show
                when={
                  item().game === "tf2" &&
                  item().details.game === "tf2" &&
                  item().details.equipSlot
                }
              >
                <div>
                  <dt class="text-xs uppercase tracking-wide text-slate-500">
                    Equip slot
                  </dt>
                  <dd class="mt-1 text-slate-200">
                    {item().details.game === "tf2"
                      ? item().details.equipSlot
                      : ""}
                  </dd>
                </div>
              </Show>
              <Show
                when={
                  item().game === "tf2" &&
                  item().details.game === "tf2" &&
                  item().details.usableClasses?.length
                }
              >
                <div>
                  <dt class="text-xs uppercase tracking-wide text-slate-500">
                    Usable classes
                  </dt>
                  <dd>
                    <TF2ClassIcons
                      classes={
                        item().details.game === "tf2"
                          ? (item().details.usableClasses ?? [])
                          : []
                      }
                    />
                  </dd>
                </div>
              </Show>
              <Show when={selectedTF2Details()?.itemKind}>
                <div>
                  <dt class="text-xs uppercase tracking-wide text-slate-500">
                    TF2 item kind
                  </dt>
                  <dd class="mt-1 text-slate-200">
                    {selectedTF2Details()?.itemKind}
                  </dd>
                </div>
              </Show>
              <Show when={selectedTF2Details()?.collection}>
                <div>
                  <dt class="text-xs uppercase tracking-wide text-slate-500">
                    Collection
                  </dt>
                  <dd class="mt-1 text-slate-200">
                    {selectedTF2Details()?.collection}
                  </dd>
                </div>
              </Show>
              <Show when={selectedTF2Details()?.equipRegions?.length}>
                <div>
                  <dt class="text-xs uppercase tracking-wide text-slate-500">
                    Equip regions
                  </dt>
                  <dd class="mt-1 text-slate-200">
                    {selectedTF2Details()?.equipRegions?.join(", ")}
                  </dd>
                </div>
              </Show>
              <Show
                when={
                  item().game === "dota2" &&
                  item().details.game === "dota2" &&
                  item().details.hero
                }
              >
                <div>
                  <dt class="text-xs uppercase tracking-wide text-slate-500">
                    Hero
                  </dt>
                  <dd class="mt-1 text-slate-200">
                    {item().details.game === "dota2" ? item().details.hero : ""}
                  </dd>
                </div>
              </Show>
              <Show
                when={
                  item().game === "dota2" &&
                  item().details.game === "dota2" &&
                  item().details.slot
                }
              >
                <div>
                  <dt class="text-xs uppercase tracking-wide text-slate-500">
                    Slot
                  </dt>
                  <dd class="mt-1 text-slate-200">
                    {item().details.game === "dota2" ? item().details.slot : ""}
                  </dd>
                </div>
              </Show>
              <Show when={selectedServiceDetails()?.serviceDefinitionId}>
                <div>
                  <dt class="text-xs uppercase tracking-wide text-slate-500">
                    Definition ID
                  </dt>
                  <dd class="mt-1 break-all font-mono text-xs text-slate-200">
                    {selectedServiceDetails()?.serviceDefinitionId}
                  </dd>
                </div>
              </Show>
              <Show when={selectedServiceDetails()?.serviceState}>
                <div>
                  <dt class="text-xs uppercase tracking-wide text-slate-500">
                    Service state
                  </dt>
                  <dd class="mt-1 text-slate-200">
                    {selectedServiceDetails()?.serviceState}
                  </dd>
                </div>
              </Show>
              <Show when={selectedServiceDetails()?.serviceOrigin}>
                <div>
                  <dt class="text-xs uppercase tracking-wide text-slate-500">
                    Origin
                  </dt>
                  <dd class="mt-1 text-slate-200">
                    {selectedServiceDetails()?.serviceOrigin}
                  </dd>
                </div>
              </Show>
              <Show when={selectedServiceDetails()?.acquiredAt}>
                <div>
                  <dt class="text-xs uppercase tracking-wide text-slate-500">
                    Acquired
                  </dt>
                  <dd class="mt-1 text-slate-200">
                    {selectedServiceDetails()?.acquiredAt}
                  </dd>
                </div>
              </Show>
            </dl>
            <div class="mt-4">
              <VendorPricePreview
                appId={item().appId}
                marketName={item().marketName}
                marketable={item().marketable}
                result={selectedPriceScan()}
                loading={selectedPriceScanLoading()}
              />
            </div>
            <Show when={selectedTF2Market()}>
              {(market) => (
                <div class="mt-3 rounded-lg border border-slate-800 bg-slate-950 p-3">
                  <p class="text-xs font-semibold uppercase tracking-wide text-slate-500">
                    TF2 GC market summary
                  </p>
                  <p class="mt-1 text-sm text-slate-200">
                    {market().sellListings.toLocaleString()} sell listings ·{" "}
                    {selectedTF2MarketPrice()}
                  </p>
                  <p class="mt-1 text-xs text-slate-500">
                    Coordinator summary, not a live order book.
                  </p>
                </div>
              )}
            </Show>
            <Show when={item().details.equippedStates?.length}>
              <p class="mt-3 text-xs text-slate-400">
                Equipped states:{" "}
                {item()
                  .details.equippedStates?.map(
                    (state) => `class ${state.class}, slot ${state.slot}`,
                  )
                  .join(" · ")}
              </p>
            </Show>
            <Show when={item().details.interiorItemId}>
              <p class="mt-2 text-xs text-slate-400">
                Contained economy item:{" "}
                <span class="font-mono">{item().details.interiorItemId}</span>
              </p>
            </Show>
            <Show when={selectedTF2Details()?.description}>
              <p class="mt-3 text-sm text-slate-400">
                {selectedTF2Details()?.description}
              </p>
            </Show>
            <GameInventoryTF2Actions
              props={props}
              model={input.model}
              item={item}
            />
            <Show when={selectedTF2Item()}>
              {(tf2Item) => (
                <div class="mt-4">
                  <TF2ItemDiagnostics item={tf2Item()} />
                </div>
              )}
            </Show>
            <Show when={selectedSteamItem()}>
              {(steamItem) => (
                <div class="mt-4">
                  <SteamItemDiagnostics
                    item={steamItem()}
                    priceScan={selectedPriceScan()}
                    priceScanLoading={selectedPriceScanLoading()}
                  />
                </div>
              )}
            </Show>
            <Show
              when={
                selectedServiceDetails() &&
                Object.keys(selectedServiceDetails()?.dynamicProperties ?? {})
                  .length > 0
              }
            >
              <details class="mt-4 rounded-2xl border border-slate-800/80 p-3 text-sm text-slate-400">
                <summary class="cursor-pointer font-medium text-slate-200">
                  Dynamic properties
                </summary>
                <dl class="mt-3 space-y-2 font-mono text-xs">
                  <For
                    each={Object.entries(
                      selectedServiceDetails()?.dynamicProperties ?? {},
                    )}
                  >
                    {([key, value]) => (
                      <div class="grid grid-cols-[minmax(0,1fr)_minmax(0,2fr)] gap-3">
                        <dt class="break-all text-slate-500">{key}</dt>
                        <dd class="break-all text-right text-slate-200">
                          {value}
                        </dd>
                      </div>
                    )}
                  </For>
                </dl>
              </details>
            </Show>
            <GameInventoryCommerceActions
              inventoryUrl={selectedInventoryURL()}
              saleUrl={selectedSaleURL()}
              inspectUrl={item().inspectUrl}
            />
            <Show when={item().descriptions?.length}>
              <div class="mt-4 space-y-2 border-t border-slate-800 pt-4 text-sm text-slate-400">
                <For each={item().descriptions}>{(line) => <p>{line}</p>}</For>
              </div>
            </Show>
          </div>
        )}
      </Show>
    </aside>
  );
}
