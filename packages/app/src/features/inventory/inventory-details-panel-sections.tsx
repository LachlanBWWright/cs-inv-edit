import { For, Show, type JSX } from "solid-js";
import {
  itemDisplayName,
  itemInitials,
  itemSubtitle,
} from "./inventory-view-utils.js";
import { ItemInstanceDecorations } from "./ItemInstanceDecorations.js";
import type { RelatedItemPreviewContext } from "./RelatedItemPreview.js";
import { ItemPreviewMedia } from "./ItemPreviewMedia.js";
import type { ReturnEstimate } from "../commerce/roi-utils.js";

function steamMarketUrl(marketName: string) {
  return `https://steamcommunity.com/market/listings/730/${encodeURIComponent(marketName)}`;
}

export interface ItemHeaderProps {
  selected: import("@cs-inv-edit/contracts").InventoryItemDto;
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
      <ItemInstanceDecorations item={props.selected} />
    </div>
  );
}

export function ItemIcon(props: {
  item: import("@cs-inv-edit/contracts").InventoryItemDto;
  large?: boolean;
}) {
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
  selected: import("@cs-inv-edit/contracts").InventoryItemDto;
  selectedMarketPreview:
    import("@cs-inv-edit/contracts").RelatedItemDto | undefined;
  selectedMarketLoading: boolean;
  onOpenCollection: (
    collection: string,
    items: import("@cs-inv-edit/contracts").RelatedItemDto[],
    context: RelatedItemPreviewContext,
  ) => void;
  appearance?: "card" | "plain";
  showMarket?: boolean;
  showWear?: boolean;
}

export function PropertyField(props: {
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

function appliedItemInitial(kind: string) {
  if (kind === "charm") return "C";
  if (kind === "patch") return "P";
  return "S";
}

function AppliedItemCard(props: {
  item: NonNullable<
    import("@cs-inv-edit/contracts").InventoryItemDto["appliedItems"]
  >[number];
}) {
  const scraped = () =>
    props.item.kind === "sticker" ? scrapePercent(props.item.wear) : undefined;

  return (
    <div class="w-24 rounded-lg border border-slate-700/80 bg-slate-950 p-2">
      <div class="flex h-16 w-full items-center justify-center overflow-hidden rounded bg-slate-900">
        <Show
          when={props.item.imageUrl}
          fallback={
            <span class="text-xl font-bold text-slate-600">
              {appliedItemInitial(props.item.kind)}
            </span>
          }
        >
          <img
            class="h-full w-full object-contain"
            src={props.item.imageUrl}
            alt={props.item.name}
            loading="lazy"
          />
        </Show>
      </div>
      <p
        class="mt-1 line-clamp-2 text-[11px] font-medium leading-tight text-slate-200"
        title={props.item.name}
      >
        {props.item.name}
      </p>
      <p class="mt-1 text-[10px] capitalize text-slate-500">
        {props.item.kind}
        {props.item.slot === undefined ? "" : ` · slot ${props.item.slot + 1}`}
      </p>
      <Show when={scraped() !== undefined}>
        <div class="mt-1" title={`Sticker scrape level: ${scraped()}%`}>
          <div class="h-1 overflow-hidden rounded bg-slate-700">
            <div
              class="h-full bg-amber-400"
              style={{ width: `${scraped()}%` }}
            />
          </div>
          <p class="mt-0.5 text-[10px] text-amber-200">{scraped()}% scraped</p>
        </div>
      </Show>
    </div>
  );
}

export function AppliedItemGallery(props: {
  items: NonNullable<
    import("@cs-inv-edit/contracts").InventoryItemDto["appliedItems"]
  >;
}) {
  return (
    <div class="sm:col-span-2">
      <p class="text-xs uppercase tracking-wide text-slate-500">
        Applied items
      </p>
      <div class="mt-2 flex flex-wrap gap-3">
        <For each={props.items}>
          {(applied) => <AppliedItemCard item={applied} />}
        </For>
      </div>
    </div>
  );
}

export function MarketField(props: {
  selected: import("@cs-inv-edit/contracts").InventoryItemDto;
  selectedMarketPreview:
    import("@cs-inv-edit/contracts").RelatedItemDto | undefined;
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
          href={steamMarketUrl(props.selected.marketName!)}
          target="_blank"
          rel="noreferrer"
        >
          {marketValue}
        </a>
      </Show>
    </PropertyField>
  );
}

export { PropertyGrid } from "./inventory-property-grid.js";

export interface TradeUpOutcomesProps {
  selected: import("@cs-inv-edit/contracts").InventoryItemDto;
  onPreview?: (item: import("@cs-inv-edit/contracts").InventoryItemDto) => void;
  returnEstimate?: ReturnEstimate;
  returnEstimateLoading?: boolean;
}
export * from "./inventory-details-panel-actions.js";
export * from "./inventory-details-panel-editors.js";
export * from "./inventory-details-panel-diagnostics.js";
