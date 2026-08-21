import { Show } from "solid-js";
import { itemKindLabel } from "./inventory-view-utils.js";
import { tradeStateDescription } from "./ItemMarketBadges.js";
import { formatFloat } from "./item-instance-utils.js";
import type { PropertyGridProps } from "./inventory-details-panel-sections.js";
import {
  PropertyField,
  AppliedItemGallery,
  MarketField,
} from "./inventory-details-panel-sections.js";

export function PropertyGrid(props: PropertyGridProps) {
  const openCollection = () =>
    props.onOpenCollection(
      props.selected.collection!,
      props.selected.collectionItems ?? [],
      "collection",
    );
  return (
    <div
      class={
        props.appearance === "plain"
          ? "text-sm text-slate-300"
          : "rounded-2xl border border-slate-800/80 bg-slate-900 p-3 text-sm text-slate-300"
      }
    >
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
              onClick={openCollection}
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
        <Show
          when={
            props.showWear !== false && props.selected.paintWear !== undefined
          }
        >
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
        <Show when={props.showMarket !== false}>
          <MarketField
            selected={props.selected}
            selectedMarketPreview={props.selectedMarketPreview}
            selectedMarketLoading={props.selectedMarketLoading}
          />
        </Show>
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
