import { For, Show, type JSX } from "solid-js";
import type { InventoryItemDto, RelatedItemDto } from "@cs-inv-edit/contracts";
import {
  itemDisplayName,
  itemInitials,
  itemKindLabel,
  itemSubtitle,
} from "./inventory-view-utils.js";
import { ItemInstanceDecorations } from "./ItemInstanceDecorations.js";
import { formatFloat } from "./item-instance-utils.js";
import { tradeStateDescription } from "./ItemMarketBadges.js";
import type { RelatedItemPreviewContext } from "./RelatedItemPreview.js";
import { ItemPreviewMedia } from "./ItemPreviewMedia.js";
import type { ReturnEstimate } from "./roi-utils.js";

function steamMarketURL(marketName: string) {
  return `https://steamcommunity.com/market/listings/730/${encodeURIComponent(marketName)}`;
}

export interface ItemHeaderProps {
  selected: InventoryItemDto;
}

export function ItemHeader(props: ItemHeaderProps) {
  return (
    <div>
      <ItemIcon item={props.selected} large />
      <h3 class="mt-3 text-xl font-semibold text-slate-50">
        {itemDisplayName(props.selected)}
      </h3>
      <Show when={itemSubtitle(props.selected)}>
        <p class="mt-1 text-sm text-slate-400">
          {itemSubtitle(props.selected)}
        </p>
      </Show>
      <ItemInstanceDecorations item={props.selected} showFloat />
    </div>
  );
}

export function ItemIcon(props: { item: InventoryItemDto; large?: boolean }) {
  if (props.large)
    return (
      <ItemPreviewMedia
        name={itemDisplayName(props.item)}
        imageUrl={props.item.imageUrl}
        variant="details"
      />
    );
  const boxClass = () =>
    "flex h-16 w-20 shrink-0 items-center justify-center rounded bg-slate-950 text-sm font-semibold text-slate-600";
  const imageClass = () =>
    "h-16 w-20 shrink-0 rounded bg-slate-950 object-contain";

  return (
    <Show
      when={props.item.imageUrl}
      fallback={<div class={boxClass()}>{itemInitials(props.item)}</div>}
    >
      <img
        class={imageClass()}
        src={props.item.imageUrl}
        alt={itemDisplayName(props.item)}
        loading="lazy"
      />
    </Show>
  );
}

export interface PropertyGridProps {
  selected: InventoryItemDto;
  selectedMarketPreview: RelatedItemDto | undefined;
  selectedMarketLoading: boolean;
  onOpenCollection: (
    collection: string,
    items: RelatedItemDto[],
    context: RelatedItemPreviewContext,
  ) => void;
}

function PropertyField(props: {
  label: string;
  children: JSX.Element | string | number | null | undefined;
}) {
  return (
    <div>
      <p class="text-xs uppercase tracking-wide text-slate-500">
        {props.label}
      </p>
      {props.children}
    </div>
  );
}

function scrapePercent(wear: number | undefined) {
  return wear === undefined
    ? undefined
    : Math.round(Math.max(0, Math.min(1, wear)) * 100);
}

function AppliedItemGallery(props: {
  items: NonNullable<InventoryItemDto["appliedItems"]>;
}) {
  return (
    <div class="sm:col-span-2">
      <p class="text-xs uppercase tracking-wide text-slate-500">
        Applied items
      </p>
      <div class="mt-2 flex flex-wrap gap-3">
        <For each={props.items}>
          {(applied) => {
            const scraped = () =>
              applied.kind === "sticker"
                ? scrapePercent(applied.wear)
                : undefined;
            return (
              <div class="w-24 rounded-lg border border-slate-700/80 bg-slate-950/70 p-2">
                <div class="flex h-16 w-full items-center justify-center overflow-hidden rounded bg-slate-900">
                  <Show
                    when={applied.imageUrl}
                    fallback={
                      <span class="text-xl font-bold text-slate-600">
                        {applied.kind === "charm"
                          ? "C"
                          : applied.kind === "patch"
                            ? "P"
                            : "S"}
                      </span>
                    }
                  >
                    <img
                      class="h-full w-full object-contain"
                      src={applied.imageUrl}
                      alt={applied.name}
                      loading="lazy"
                    />
                  </Show>
                </div>
                <p
                  class="mt-1 line-clamp-2 text-[11px] font-medium leading-tight text-slate-200"
                  title={applied.name}
                >
                  {applied.name}
                </p>
                <p class="mt-1 text-[10px] capitalize text-slate-500">
                  {applied.kind}
                  {applied.slot === undefined
                    ? ""
                    : ` · slot ${applied.slot + 1}`}
                </p>
                <Show when={scraped() !== undefined}>
                  <div
                    class="mt-1"
                    title={`Sticker scrape level: ${scraped()}%`}
                  >
                    <div class="h-1 overflow-hidden rounded bg-slate-700">
                      <div
                        class="h-full bg-amber-400"
                        style={{ width: `${scraped()}%` }}
                      />
                    </div>
                    <p class="mt-0.5 text-[10px] text-amber-200">
                      {scraped()}% scraped
                    </p>
                  </div>
                </Show>
              </div>
            );
          }}
        </For>
      </div>
    </div>
  );
}

function MarketField(props: {
  selected: InventoryItemDto;
  selectedMarketPreview: RelatedItemDto | undefined;
  selectedMarketLoading: boolean;
}) {
  const hasMarketValue =
    props.selected.marketPrice ||
    props.selectedMarketPreview?.price ||
    props.selectedMarketLoading;
  if (!hasMarketValue) return null;

  const marketValue = props.selected.marketName
    ? props.selected.marketPrice ||
      props.selectedMarketPreview?.price ||
      "Loading…"
    : props.selected.marketPrice;

  return (
    <PropertyField label="Market">
      <Show
        when={props.selected.marketName}
        fallback={<p class="mt-1 font-medium text-slate-100">{marketValue}</p>}
      >
        <a
          class="mt-1 inline-block font-medium text-sky-300 underline decoration-sky-500/50 underline-offset-4 hover:text-sky-200"
          href={steamMarketURL(props.selected.marketName!)}
          target="_blank"
          rel="noreferrer"
        >
          {marketValue}
        </a>
      </Show>
    </PropertyField>
  );
}

export function PropertyGrid(props: PropertyGridProps) {
  return (
    <div class="rounded-2xl border border-slate-800/80 bg-slate-900/70 p-3 text-sm text-slate-300">
      <div class="grid gap-3 sm:grid-cols-2">
        <Show when={props.selected.kind}>
          <PropertyField label="Type">
            <p class="mt-1 font-medium text-slate-100">
              {itemKindLabel(props.selected.kind)}
            </p>
          </PropertyField>
        </Show>
        <Show when={props.selected.collection}>
          <PropertyField label="Collection">
            <button
              type="button"
              class="mt-1 text-left font-medium text-cyan-300 underline decoration-cyan-500/50 underline-offset-4 hover:text-cyan-200"
              onClick={() =>
                props.onOpenCollection(
                  props.selected.collection!,
                  props.selected.collectionItems ?? [],
                  "collection",
                )
              }
            >
              {props.selected.collection}
            </button>
          </PropertyField>
        </Show>
        <Show when={props.selected.exterior}>
          <PropertyField label="Exterior">
            <p class="mt-1 font-medium text-slate-100">
              {props.selected.exterior}
            </p>
          </PropertyField>
        </Show>
        <Show when={props.selected.storageLocation}>
          <PropertyField label="Storage">
            <p class="mt-1 font-medium text-slate-100">
              {props.selected.storageLocation}
            </p>
          </PropertyField>
        </Show>
        <Show when={props.selected.paintWear !== undefined}>
          <PropertyField label="Wear">
            <p class="mt-1 font-mono font-medium text-slate-100">
              {formatFloat(props.selected.paintWear!)}
            </p>
          </PropertyField>
        </Show>
        <Show when={props.selected.graffitiCharges !== undefined}>
          <PropertyField label="Charges remaining">
            <p class="mt-1 font-mono font-medium text-slate-100">
              {props.selected.graffitiCharges}
            </p>
          </PropertyField>
        </Show>
        <MarketField
          selected={props.selected}
          selectedMarketPreview={props.selectedMarketPreview}
          selectedMarketLoading={props.selectedMarketLoading}
        />
        <PropertyField label="Trade state">
          <p class="mt-1 font-medium text-slate-100">
            {tradeStateDescription(props.selected)}
          </p>
        </PropertyField>
        <Show when={props.selected.marketSellListings}>
          <PropertyField label="Listings">
            <p class="mt-1 font-medium text-slate-100">
              {props.selected.marketSellListings}
            </p>
          </PropertyField>
        </Show>
        <Show
          when={props.selected.stickers && props.selected.stickers.length > 0}
        >
          <PropertyField label="Stickers">
            <p class="mt-1 font-medium text-slate-100">
              {props.selected.stickers?.length}
            </p>
          </PropertyField>
        </Show>
        <Show when={(props.selected.appliedItems?.length ?? 0) > 0}>
          <AppliedItemGallery items={props.selected.appliedItems!} />
        </Show>
        <Show when={props.selected.customName}>
          <PropertyField label="Name Tag">
            <p class="mt-1 font-medium text-cyan-200">
              {props.selected.customName}
            </p>
          </PropertyField>
        </Show>
      </div>
    </div>
  );
}

export interface TradeUpOutcomesProps {
  selected: InventoryItemDto;
  onPreview?: (item: InventoryItemDto) => void;
  returnEstimate?: ReturnEstimate;
  returnEstimateLoading?: boolean;
}
export * from "./inventory-details-panel-actions.js";
export * from "./inventory-details-panel-editors.js";
export * from "./inventory-details-panel-diagnostics.js";
