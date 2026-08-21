import { Show, createMemo, createSignal } from "solid-js";
import type { ArmorySnapshot, RelatedItemDto } from "@cs-inv-edit/contracts";
import { Button } from "../../shared/ui/Button.js";
import { Card } from "../../shared/ui/Card.js";
import { formatUSDMinor, type ReturnEstimate } from "../commerce/roi-utils.js";
import {
  rarityBorderClass,
  sortRelatedItemsByRarity,
} from "../inventory/inventory-view-utils.js";
import { ARMORY_STAR_COST_MINOR } from "./armory-purchase-policy.js";
export * from "./armory-purchase-policy.js";

function OfferPreviewImage(props: { item: RelatedItemDto }) {
  const name = () => props.item.marketName || props.item.name;
  return (
    <Show
      when={props.item.imageUrl}
      fallback={
        <div class="flex h-full items-center justify-center text-4xl font-semibold text-slate-700">
          {name().slice(0, 2).toUpperCase()}
        </div>
      }
    >
      <img
        class="h-full w-full object-contain p-4 transition duration-200 group-hover:scale-105"
        src={props.item.imageUrl}
        alt={name()}
        loading="lazy"
      />
    </Show>
  );
}

function OfferPreviewCaption(props: { item: RelatedItemDto }) {
  return (
    <div class="absolute inset-x-0 bottom-0 border-t border-slate-800 bg-slate-950 px-4 py-3">
      <p class="truncate text-sm font-semibold text-slate-100">
        {props.item.marketName || props.item.name}
      </p>
      <Show when={props.item.rarity} keyed>
        {(rarity) => <p class="mt-0.5 text-xs text-slate-400">{rarity}</p>}
      </Show>
    </div>
  );
}

function EstimateSummary(props: {
  estimate: ReturnEstimate;
  quantity: number;
}) {
  const roiPrefix = () => (props.estimate.roiPercent! >= 0 ? "+" : "");
  return (
    <p class="mt-1 text-xs">
      <span class="text-slate-400">
        EV {formatUSDMinor(props.estimate.expectedValueMinor * props.quantity)}
      </span>
      <span
        class={`ml-2 font-semibold ${props.estimate.roiPercent! >= 0 ? "text-emerald-300" : "text-rose-300"}`}
      >
        ROI {roiPrefix()}
        {props.estimate.roiPercent!.toFixed(1)}%
      </span>
      <span class="ml-2 text-slate-500">
        {props.estimate.pricedOutcomes}/{props.estimate.totalOutcomes} priced
      </span>
    </p>
  );
}

export function ArmoryOfferPreview(props: {
  items?: RelatedItemDto[];
  offerName: string;
  onOpen: () => void;
}) {
  const [activeIndex, setActiveIndex] = createSignal(0);
  const items = createMemo(() => sortRelatedItemsByRarity(props.items ?? []));
  const activeItem = () => items()[activeIndex() % Math.max(items().length, 1)];
  const move = (direction: -1 | 1) => {
    const length = items().length;
    if (length > 0)
      setActiveIndex((current) => (current + direction + length) % length);
  };

  return (
    <Show
      when={activeItem()}
      fallback={
        <button
          type="button"
          class="mt-4 flex h-40 w-full items-center justify-center rounded-xl border border-dashed border-slate-700 bg-slate-950 text-sm text-slate-500 hover:border-slate-600 hover:text-slate-400"
          onClick={props.onOpen}
        >
          Item preview unavailable
        </button>
      }
    >
      {(item) => (
        <div
          class={`relative mt-4 overflow-hidden rounded-xl border-2 bg-slate-950 ${rarityBorderClass(item().rarity)}`}
        >
          <button
            type="button"
            class="group block aspect-[3/2] w-full text-left"
            aria-label={`View possible items in ${props.offerName}`}
            onClick={props.onOpen}
          >
            <OfferPreviewImage item={item()} />
            <OfferPreviewCaption item={item()} />
          </button>
          <Show when={items().length > 1}>
            <button
              type="button"
              class="absolute left-2 top-1/2 flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-full border border-slate-600 bg-slate-950 text-lg text-slate-200 hover:bg-slate-800"
              aria-label="Previous possible item"
              onClick={() => move(-1)}
            >
              ‹
            </button>
            <button
              type="button"
              class="absolute right-2 top-1/2 flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-full border border-slate-600 bg-slate-950 text-lg text-slate-200 hover:bg-slate-800"
              aria-label="Next possible item"
              onClick={() => move(1)}
            >
              ›
            </button>
            <div class="absolute right-3 top-3 rounded-full bg-slate-950 px-2 py-1 text-xs font-medium text-slate-300">
              {activeIndex() + 1} / {items().length}
            </div>
          </Show>
          <div class="h-1 w-full bg-[rgb(var(--rarity-color))]" />
        </div>
      )}
    </Show>
  );
}

function OfferDetailsSummary(props: {
  offer: ArmorySnapshot["offers"][number];
  quantity: number;
  estimate?: ReturnEstimate;
  estimateLoading: boolean;
}) {
  return (
    <div>
      <span class="text-lg font-semibold text-amber-300">
        {props.offer.expectedCost * props.quantity} stars
      </span>
      <span class="ml-2 text-xs text-slate-400">
        (
        {formatUSDMinor(
          props.offer.expectedCost * props.quantity * ARMORY_STAR_COST_MINOR,
        )}
        )
      </span>
      <Show
        when={props.estimateLoading}
        fallback={
          <Show when={props.estimate}>
            {(estimate) => (
              <EstimateSummary
                estimate={estimate()}
                quantity={props.quantity}
              />
            )}
          </Show>
        }
      >
        <p class="mt-1 animate-pulse text-xs text-sky-300">
          Calculating expected return…
        </p>
      </Show>
    </div>
  );
}

function OfferQuantityControls(props: {
  quantity: number;
  balance: number;
  expectedCost: number;
  buyDisabledReason?: string;
  canBuy: boolean;
  onSetQuantity: (value: number) => void;
  onConfirm: () => void;
}) {
  return (
    <div class="flex items-center gap-2">
      <Button
        variant="secondary"
        disabled={props.quantity <= 1}
        onClick={() => props.onSetQuantity(props.quantity - 1)}
      >
        −
      </Button>
      <span class="min-w-8 text-center font-mono">{props.quantity}</span>
      <Button
        variant="secondary"
        disabled={
          props.quantity >= Math.floor(props.balance / props.expectedCost)
        }
        onClick={() => props.onSetQuantity(props.quantity + 1)}
      >
        +
      </Button>
      <div
        class="group relative"
        title={props.buyDisabledReason}
        tabindex={props.buyDisabledReason ? 0 : undefined}
      >
        <Button
          class={props.buyDisabledReason ? "grayscale" : ""}
          disabled={!props.canBuy}
          onClick={props.onConfirm}
        >
          Buy
        </Button>
        <Show when={props.buyDisabledReason}>
          {(reason) => (
            <div
              role="tooltip"
              class="pointer-events-none absolute bottom-full right-0 z-20 mb-2 w-64 rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-xs font-normal text-slate-200 opacity-0 shadow-xl transition-opacity group-hover:opacity-100 group-focus:opacity-100"
            >
              {reason()}
            </div>
          )}
        </Show>
      </div>
    </div>
  );
}

function OfferConfirmation(props: {
  quantity: number;
  busy: boolean;
  expectedCost: number;
  onRedeem: () => void;
  onCancel: () => void;
}) {
  return (
    <div
      class={`mt-4 rounded-xl border p-4 ${props.quantity > 1 ? "border-red-400/40 bg-red-950" : "border-amber-400/30 bg-amber-950"}`}
    >
      <Show when={props.quantity > 1}>
        <p class="mb-2 font-semibold text-red-200">Bulk purchase warning</p>
      </Show>
      <p class="text-sm text-slate-200">
        Buy {props.quantity} for {props.expectedCost * props.quantity} stars?
      </p>
      <div class="mt-3 flex gap-2">
        <Button disabled={props.busy} onClick={props.onRedeem}>
          {props.busy ? "Sending…" : "Confirm purchase"}
        </Button>
        <Button disabled={props.busy} onClick={props.onCancel}>
          Cancel
        </Button>
      </div>
    </div>
  );
}

export function OfferCard(props: {
  offer: ArmorySnapshot["offers"][number];
  quantity: number;
  estimate?: ReturnEstimate;
  estimateLoading: boolean;
  canBuy: boolean;
  buyDisabledReason?: string;
  busy: boolean;
  balance: number;
  onOpenContents: () => void;
  onPreviewOpen: () => void;
  onSetQuantity: (value: number) => void;
  onConfirm: () => void;
  onRedeem: () => void;
  onCancel: () => void;
  confirming: boolean;
}) {
  return (
    <Card class="flex min-w-0 flex-col p-5">
      <button
        type="button"
        class="text-left text-xl font-semibold text-cyan-300 underline decoration-cyan-500/50 underline-offset-4 hover:text-cyan-200"
        onClick={props.onOpenContents}
      >
        {props.offer.name || "Armory reward"}
      </button>
      <ArmoryOfferPreview
        items={props.offer.items}
        offerName={props.offer.name || "Armory reward"}
        onOpen={props.onOpenContents}
      />
      <Show when={(props.offer.items?.length ?? 0) > 0}>
        <Button
          class="mt-4 w-full"
          variant="secondary"
          onClick={props.onPreviewOpen}
        >
          Preview open
        </Button>
      </Show>
      <div class="mt-auto flex flex-wrap items-center justify-between gap-3 pt-5">
        <OfferDetailsSummary
          offer={props.offer}
          quantity={props.quantity}
          estimate={props.estimate}
          estimateLoading={props.estimateLoading}
        />
        <OfferQuantityControls
          quantity={props.quantity}
          balance={props.balance}
          expectedCost={props.offer.expectedCost}
          buyDisabledReason={props.buyDisabledReason}
          canBuy={props.canBuy}
          onSetQuantity={props.onSetQuantity}
          onConfirm={props.onConfirm}
        />
      </div>
      <Show when={props.offer.expectedCost > props.balance}>
        <p class="mt-2 text-xs text-slate-500">
          Requires {props.offer.expectedCost - props.balance} more stars.
        </p>
      </Show>
      <Show when={props.confirming}>
        <OfferConfirmation
          quantity={props.quantity}
          busy={props.busy}
          expectedCost={props.offer.expectedCost}
          onRedeem={props.onRedeem}
          onCancel={props.onCancel}
        />
      </Show>
    </Card>
  );
}
