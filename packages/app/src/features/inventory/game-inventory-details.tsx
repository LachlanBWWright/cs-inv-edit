import { For, Show, type JSX } from "solid-js";
import {
  ItemMarketBadges,
  marketPriceLabel,
  tradeStateDescription,
} from "./ItemMarketBadges.js";
import {
  ItemImage,
  marketUrl,
  SteamItemDiagnostics,
  TF2ItemDiagnostics,
} from "./game-inventory-elements.js";
import { VendorPricePreview } from "../commerce/VendorPricePreview.js";
import { GameInventoryTF2Actions } from "./game-inventory-tf2-actions.js";
import type { EconomyInventoryItemDto } from "@cs-inv-edit/contracts";
import type { GameInventoryViewProps } from "./GameInventoryView.js";
import type { createGameInventoryModel } from "./game-inventory-model.js";
import { GameInventoryCommerceActions } from "./GameInventoryCommerceActions.js";
import { TF2ClassIcons } from "../tf2/TF2ClassIcons.js";

function DetailField(props: {
  label: string;
  children: JSX.Element | string | number | null | undefined;
}) {
  return (
    <div>
      <dt class="text-xs uppercase tracking-wide text-slate-500">
        {props.label}
      </dt>
      <dd class="mt-1 text-slate-200">{props.children}</dd>
    </div>
  );
}

type InventoryDetailsItem = NonNullable<
  ReturnType<typeof createGameInventoryModel>["selected"] extends () => infer T
    ? T
    : never
>;

function InventoryDetailHeader(props: {
  item: InventoryDetailsItem;
  marketPrices: ReadonlyMap<string, number>;
}) {
  return (
    <div class="relative overflow-hidden">
      <ItemMarketBadges
        item={props.item}
        priceMinor={props.marketPrices.get(props.item.marketName ?? "")}
      />
      <ItemImage item={props.item} large />
    </div>
  );
}

function OptionalDetailField(props: {
  label: string;
  value: string | undefined;
}) {
  return (
    <Show when={props.value} keyed>
      {(value) => <DetailField label={props.label}>{value}</DetailField>}
    </Show>
  );
}

function MarketPriceField(props: {
  item: InventoryDetailsItem;
  price?: number;
}) {
  const label = () => marketPriceLabel(props.item, props.price);
  return (
    <Show when={label()} keyed>
      {(price) => (
        <DetailField label="Steam Market price">
          <Show
            when={props.item.marketName}
            fallback={<span class="text-slate-100">{price}</span>}
          >
            <a
              class="text-sky-300 underline decoration-sky-500/50 underline-offset-4 hover:text-sky-200"
              href={marketUrl(props.item)}
              target="_blank"
              rel="noreferrer"
            >
              {price}
            </a>
          </Show>
        </DetailField>
      )}
    </Show>
  );
}

function UsableClassesField(props: { classes: string[] }) {
  return (
    <Show when={props.classes.length > 0}>
      <DetailField label="Usable classes">
        <TF2ClassIcons classes={props.classes} />
      </DetailField>
    </Show>
  );
}

function TF2MarketSummary(props: {
  sellListings: number;
  price: string | undefined;
}) {
  return (
    <div class="py-4">
      <p class="text-xs font-semibold uppercase tracking-wide text-slate-500">
        TF2 GC market summary
      </p>
      <p class="mt-1 text-sm text-slate-200">
        {props.sellListings.toLocaleString()} sell listings · {props.price}
      </p>
      <p class="mt-1 text-xs text-slate-500">
        Coordinator summary, not a live order book.
      </p>
    </div>
  );
}

function DynamicPropertyRows(props: { properties: Record<string, string> }) {
  return (
    <For each={Object.entries(props.properties)}>
      {([key, value]) => (
        <div class="grid grid-cols-[minmax(0,1fr)_minmax(0,2fr)] gap-3">
          <dt class="break-all text-slate-500">{key}</dt>
          <dd class="break-all text-right text-slate-200">{value}</dd>
        </div>
      )}
    </For>
  );
}

export function InventoryDetailBody(props: {
  item: InventoryDetailsItem;
  marketPrices: ReadonlyMap<string, number>;
  selectedPriceScan: ReturnType<
    typeof createGameInventoryModel
  >["selectedPriceScan"];
  selectedPriceScanLoading: ReturnType<
    typeof createGameInventoryModel
  >["selectedPriceScanLoading"];
  selectedTF2Details: ReturnType<
    typeof createGameInventoryModel
  >["selectedTF2Details"];
  selectedServiceDetails: ReturnType<
    typeof createGameInventoryModel
  >["selectedServiceDetails"];
  selectedTF2Market: ReturnType<
    typeof createGameInventoryModel
  >["selectedTF2Market"];
  selectedTF2MarketPrice: ReturnType<
    typeof createGameInventoryModel
  >["selectedTF2MarketPrice"];
  selectedTF2Item: ReturnType<
    typeof createGameInventoryModel
  >["selectedTF2Item"];
  selectedSteamItem: ReturnType<
    typeof createGameInventoryModel
  >["selectedSteamItem"];
  selectedInventoryUrl: ReturnType<
    typeof createGameInventoryModel
  >["selectedInventoryUrl"];
  selectedSaleUrl: ReturnType<
    typeof createGameInventoryModel
  >["selectedSaleUrl"];
  viewProps: GameInventoryViewProps;
  model: ReturnType<typeof createGameInventoryModel>;
}) {
  const tf2Details = () => props.selectedTF2Details();
  const serviceDetails = () => props.selectedServiceDetails();
  const tf2Item = () => props.selectedTF2Item();
  const steamItem = () => props.selectedSteamItem();
  const dynamicProperties = () => serviceDetails()?.dynamicProperties ?? {};
  const hasDynamicProperties = () =>
    Object.keys(dynamicProperties()).length > 0;
  const usableTF2Classes = () =>
    props.item.details.game === "tf2"
      ? (props.item.details.usableClasses ?? [])
      : [];
  const dotaDetails = () =>
    props.item.details.game === "dota2" ? props.item.details : undefined;

  return (
    <div class="space-y-4">
      <InventoryDetailHeader
        item={props.item}
        marketPrices={props.marketPrices}
      />
      <div>
        <h2 class="text-xl font-semibold text-slate-50">{props.item.name}</h2>
        <Show when={props.item.details.customName}>
          <p class="mt-1 text-sm font-medium text-cyan-200">
            Name Tag: “{props.item.details.customName}”
          </p>
        </Show>
        <Show when={props.item.type}>
          <p class="mt-1 text-sm text-slate-400">{props.item.type}</p>
        </Show>
      </div>
      <section class="divide-y divide-slate-800 border-y border-slate-800/80">
        <dl class="grid grid-cols-[repeat(auto-fit,minmax(140px,1fr))] gap-3 py-4 text-sm text-slate-300">
          <Show when={props.item.rarity}>
            <DetailField label="Rarity">{props.item.rarity}</DetailField>
          </Show>
          <Show when={props.item.quality}>
            <DetailField label="Quality">{props.item.quality}</DetailField>
          </Show>
          <MarketPriceField
            item={props.item}
            price={props.marketPrices.get(props.item.marketName ?? "")}
          />
          <DetailField label="Trade state">
            {tradeStateDescription(props.item)}
          </DetailField>
          <DetailField label="Asset identity">
            <span class="mt-1 break-all font-mono text-xs text-slate-300">
              {props.item.assetId}
            </span>
          </DetailField>
          <DetailField label="Level and style">
            Level {props.item.details.level} · Style {props.item.details.style}
          </DetailField>
          <OptionalDetailField
            label="Equip slot"
            value={tf2Details()?.equipSlot}
          />
          <UsableClassesField classes={usableTF2Classes()} />
          <OptionalDetailField
            label="TF2 item kind"
            value={props.selectedTF2Details()?.itemKind}
          />
          <OptionalDetailField
            label="Collection"
            value={tf2Details()?.collection}
          />
          <OptionalDetailField
            label="Equip regions"
            value={tf2Details()?.equipRegions?.join(", ")}
          />
          <OptionalDetailField label="Hero" value={dotaDetails()?.hero} />
          <OptionalDetailField label="Slot" value={dotaDetails()?.slot} />
          <OptionalDetailField
            label="Definition ID"
            value={serviceDetails()?.serviceDefinitionId}
          />
          <OptionalDetailField
            label="Service state"
            value={serviceDetails()?.serviceState}
          />
          <OptionalDetailField
            label="Origin"
            value={serviceDetails()?.serviceOrigin}
          />
          <OptionalDetailField
            label="Acquired"
            value={serviceDetails()?.acquiredAt}
          />
        </dl>
        <VendorPricePreview
          appId={props.item.appId}
          marketName={props.item.marketName}
          marketable={props.item.marketable}
          result={props.selectedPriceScan()}
          loading={props.selectedPriceScanLoading()}
          appearance="plain"
        />
        <Show when={props.selectedTF2Market()}>
          {(market) => (
            <TF2MarketSummary
              sellListings={market().sellListings}
              price={props.selectedTF2MarketPrice()}
            />
          )}
        </Show>
      </section>
      <Show when={props.item.details.equippedStates?.length}>
        <p class="text-xs text-slate-400">
          Equipped states:{" "}
          {props.item.details.equippedStates
            ?.map((state) => `class ${state.class}, slot ${state.slot}`)
            .join(" · ")}
        </p>
      </Show>
      <Show when={props.item.details.interiorItemId}>
        <p class="text-xs text-slate-400">
          Contained economy item:{" "}
          <span class="font-mono">{props.item.details.interiorItemId}</span>
        </p>
      </Show>
      <Show when={props.selectedTF2Details()?.description}>
        <p class="text-sm text-slate-400">
          {props.selectedTF2Details()?.description}
        </p>
      </Show>
      <GameInventoryTF2Actions
        props={props.viewProps}
        model={props.model}
        item={() => props.item as EconomyInventoryItemDto}
      />
      <Show when={tf2Item()}>
        {(tf2Item) => (
          <div>
            <TF2ItemDiagnostics item={tf2Item()} />
          </div>
        )}
      </Show>
      <Show when={steamItem()}>
        {(steamItem) => (
          <div>
            <SteamItemDiagnostics
              item={steamItem()}
              priceScan={props.selectedPriceScan()}
              priceScanLoading={props.selectedPriceScanLoading()}
            />
          </div>
        )}
      </Show>
      <Show when={hasDynamicProperties()}>
        <details class="border-y border-slate-800/80 py-4 text-sm text-slate-400">
          <summary class="cursor-pointer font-medium text-slate-200">
            Dynamic properties
          </summary>
          <dl class="mt-3 space-y-2 font-mono text-xs">
            <DynamicPropertyRows properties={dynamicProperties()} />
          </dl>
        </details>
      </Show>
      <GameInventoryCommerceActions
        inventoryUrl={props.selectedInventoryUrl()}
        saleUrl={props.selectedSaleUrl()}
        inspectUrl={props.item.inspectUrl}
      />
      <Show when={props.item.descriptions?.length}>
        <div class="space-y-2 border-t border-slate-800 pt-4 text-sm text-slate-400">
          <For each={props.item.descriptions}>{(line) => <p>{line}</p>}</For>
        </div>
      </Show>
    </div>
  );
}
