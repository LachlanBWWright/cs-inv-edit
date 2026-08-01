import { Show } from "solid-js";
import type { StoreSnapshot } from "@cs-inv-edit/contracts";
import { Button } from "./ui/Button.js";
import { Card } from "./ui/Card.js";

type StoreOffer = StoreSnapshot["offers"][number];

export function StoreOfferCard(props: {
  offer: StoreOffer;
  quantity: number;
  onOpenContents: () => void;
  onSetQuantity: (value: number) => void;
  onBuy: () => void;
  browseOnly?: boolean;
}) {
  const amount = () =>
    (props.offer.saleAmountMinor ?? props.offer.amountMinor) * props.quantity;

  return (
    <Card class="flex min-w-0 flex-col p-5">
      <button
        type="button"
        class="text-left text-xl font-semibold text-cyan-300 underline decoration-cyan-500/50 underline-offset-4 hover:text-cyan-200"
        onClick={props.onOpenContents}
      >
        {props.offer.name}
      </button>
      <button
        type="button"
        class="group relative mt-4 block aspect-[3/2] w-full overflow-hidden rounded-xl border-2 border-slate-700 bg-slate-950 text-left hover:border-cyan-500"
        aria-label={`View ${props.offer.name}`}
        onClick={props.onOpenContents}
      >
        <Show
          when={props.offer.imageUrl}
          fallback={
            <div class="flex h-full items-center justify-center text-4xl font-semibold text-slate-700">
              {props.offer.name.slice(0, 2).toUpperCase()}
            </div>
          }
        >
          <img
            class="h-full w-full object-contain p-4 transition duration-200 group-hover:scale-105"
            src={props.offer.imageUrl}
            alt={props.offer.name}
            loading="lazy"
          />
        </Show>
        <div class="absolute inset-x-0 bottom-0 border-t border-slate-800 bg-slate-950 px-4 py-3">
          <p class="truncate text-sm font-semibold text-slate-100">
            {props.offer.name}
          </p>
          <p class="mt-0.5 text-xs text-slate-400">{props.offer.category}</p>
        </div>
        <div class="absolute inset-x-0 bottom-0 h-1 bg-cyan-400" />
      </button>
      <div class="mt-auto flex flex-wrap items-end justify-between gap-3 pt-5">
        <div>
          <Show when={props.offer.saleAmountMinor !== undefined}>
            <p class="text-sm text-slate-500 line-through">
              {props.offer.formattedPrice}
            </p>
          </Show>
          <p class="text-lg font-semibold text-cyan-300">
            {props.offer.formattedSalePrice || props.offer.formattedPrice}
          </p>
          <Show when={props.quantity > 1}>
            <p class="mt-1 text-xs text-slate-400">
              Total: {props.offer.currency} {(amount() / 100).toFixed(2)}
            </p>
          </Show>
        </div>
        <Show when={!props.browseOnly}>
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
              disabled={props.quantity >= 20}
              onClick={() => props.onSetQuantity(props.quantity + 1)}
            >
              +
            </Button>
            <Button disabled={!props.offer.purchasable} onClick={props.onBuy}>
              Buy
            </Button>
          </div>
        </Show>
      </div>
      <Show when={!props.offer.purchasable && !props.browseOnly}>
        <p class="mt-3 text-xs text-amber-300">
          {props.offer.unsupportedReason}
        </p>
      </Show>
    </Card>
  );
}
