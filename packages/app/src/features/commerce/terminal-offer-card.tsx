import { Show, type Accessor } from "solid-js";
import type { PurchaseSession } from "@cs-inv-edit/contracts";
import { Button } from "../../shared/ui/Button.js";
import { WearRangeBar } from "../../shared/ui/WearRangeBar.js";
import {
  rarityBorderClass,
  rarityDisplayLabel,
} from "../inventory/inventory-view-utils.js";
import { TerminalOfferStatus } from "./terminal-offer-status.js";

interface TerminalOfferLike {
  item: {
    rarity?: string | number;
    imageUrl?: string;
    marketName?: string;
    name: string;
    paintWear?: number;
    wearMin?: number;
    wearMax?: number;
    inspectUrl?: string;
  };
  purchasePrice?: number;
}

interface TerminalOfferLimitLike {
  state: "known";
  isLastOffer: boolean;
  additionalOffers: number;
}

interface TerminalOfferCardProps {
  offer: TerminalOfferLike;
  offerLimit: TerminalOfferLimitLike | undefined;
  loading: boolean;
  pending: boolean;
  confirmReject: boolean;
  confirmPurchase: boolean;
  purchaseMessage: Accessor<string>;
  containerStatusMessage?: string;
  session?: Accessor<PurchaseSession | undefined>;
  onReject: () => void;
  onPurchase: () => void;
  onCancel: () => void;
  onConfirmReject: () => void;
  onConfirmPurchase: () => void;
}

function OfferSummary(props: {
  offer: TerminalOfferLike;
  purchasePrice: string | undefined;
}) {
  const wear = () => props.offer.item.paintWear;
  return (
    <div class="min-w-0 flex-1">
      <p class="truncate font-semibold text-slate-100">
        {props.offer.item.marketName || props.offer.item.name}
      </p>
      <p class="mt-1 text-xs text-slate-400">
        <span class="font-medium text-slate-300">
          {rarityDisplayLabel(String(props.offer.item.rarity ?? "")) ||
            "Unknown rarity"}
        </span>
        <Show when={wear() !== undefined}>
          <span class="ml-1 text-slate-400">
            · Float:{" "}
            <span class="font-mono font-medium text-slate-200">
              {wear()!.toString()}
            </span>
          </span>
        </Show>
        <Show when={props.purchasePrice}>
          {(price) => ` · Price ${price()}`}
        </Show>
      </p>
    </div>
  );
}

function LastOfferMessage() {
  return (
    <>
      <p class="text-xs font-semibold text-rose-200">Final offer</p>
      <p class="mt-1 text-xs text-slate-300">
        This is the terminal&apos;s last offer. It cannot be rejected for
        another item.
      </p>
    </>
  );
}

function remainingOfferLabel(count: number) {
  return count === 1 ? "offer remains" : "offers remain";
}

function OfferLimitPanel(props: {
  offerLimit: TerminalOfferLimitLike | undefined;
}) {
  const knownOfferLimit = () => props.offerLimit;
  return (
    <div
      class={`mt-3 rounded-xl border px-3 py-2 ${
        knownOfferLimit()?.isLastOffer
          ? "border-rose-500/40 bg-rose-950"
          : "border-violet-500/30 bg-slate-950"
      }`}
    >
      <Show
        when={knownOfferLimit()}
        fallback={
          <>
            <p class="text-xs font-semibold text-amber-200">
              Offer limit unavailable
            </p>
            <p class="mt-1 text-xs text-slate-400">
              CS2 returned an invalid or unknown remaining-offer counter.
              Refresh the terminal before rejecting this offer.
            </p>
          </>
        }
      >
        {(limit) => (
          <Show when={!limit().isLastOffer} fallback={<LastOfferMessage />}>
            <p class="text-xs font-semibold text-violet-100">
              {limit().additionalOffers}{" "}
              {remainingOfferLabel(limit().additionalOffers)} after this one
            </p>
            <p class="mt-1 text-xs text-slate-400">
              Rejecting permanently discards this offer and leaves{" "}
              {limit().additionalOffers} more{" "}
              {limit().additionalOffers === 1 ? "offer" : "offers"} available.
            </p>
          </Show>
        )}
      </Show>
    </div>
  );
}

function OfferActionBar(props: {
  pending: boolean;
  loading: boolean;
  confirmReject: boolean;
  confirmPurchase: boolean;
  offerLimit: TerminalOfferLimitLike | undefined;
  purchasePrice: number | undefined;
  onReject: () => void;
  onPurchase: () => void;
  onCancel: () => void;
  onConfirmReject: () => void;
  onConfirmPurchase: () => void;
}) {
  return (
    <div class="mt-4 flex flex-wrap gap-2">
      <Show
        when={!props.confirmReject}
        fallback={
          <>
            <Button
              variant="danger"
              disabled={props.pending || props.loading}
              onClick={props.onReject}
            >
              Confirm rejection · Show next offer
            </Button>
            <Button variant="ghost" onClick={props.onCancel}>
              Keep this offer
            </Button>
          </>
        }
      >
        <Button
          variant="secondary"
          disabled={
            props.pending ||
            props.loading ||
            !props.offerLimit ||
            props.offerLimit.isLastOffer
          }
          onClick={props.onConfirmReject}
        >
          {props.offerLimit?.isLastOffer
            ? "Final offer"
            : "Reject · Next offer"}
        </Button>
      </Show>
      <Show
        when={!props.confirmPurchase}
        fallback={
          <>
            <Button
              disabled={props.pending || props.loading || !props.purchasePrice}
              onClick={props.onPurchase}
            >
              Confirm purchase from Steam Wallet
            </Button>
            <Button variant="ghost" onClick={props.onCancel}>
              Cancel
            </Button>
          </>
        }
      >
        <Button
          disabled={props.pending || props.loading}
          onClick={props.onConfirmPurchase}
        >
          Buy this offer
        </Button>
      </Show>
    </div>
  );
}

export function TerminalOfferCard(props: TerminalOfferCardProps) {
  const knownOfferLimit = () => props.offerLimit;
  const purchasePrice = () =>
    props.offer.purchasePrice
      ? (props.offer.purchasePrice / 100).toLocaleString("en-US", {
          style: "currency",
          currency: "USD",
        })
      : undefined;
  const wear = () => props.offer.item.paintWear;

  return (
    <>
      <div
        class={`mt-3 flex items-center gap-3 rounded-xl bg-slate-900 p-3 ${rarityBorderClass(String(props.offer.item.rarity ?? ""))}`}
      >
        <Show
          when={props.offer.item.imageUrl}
          fallback={
            <div class="grid h-20 w-24 place-items-center rounded-xl bg-slate-950 text-slate-600">
              ?
            </div>
          }
        >
          {(imageUrl) => (
            <img
              class="h-20 w-24 rounded-xl bg-slate-950 object-contain p-1"
              src={imageUrl()}
              alt=""
            />
          )}
        </Show>
        <OfferSummary offer={props.offer} purchasePrice={purchasePrice()} />
      </div>
      <Show when={wear() !== undefined}>
        <div class="mt-3">
          <WearRangeBar
            wear={wear()!}
            min={props.offer.item.wearMin}
            max={props.offer.item.wearMax}
          />
        </div>
      </Show>
      <Show when={props.offer.item.inspectUrl}>
        {(inspectUrl) => (
          <div class="mt-3">
            <a
              class="block w-full rounded-xl border border-cyan-500/40 bg-cyan-950 px-3 py-2 text-center text-xs font-semibold text-cyan-100 hover:bg-cyan-950"
              href={inspectUrl()}
              target="_blank"
              rel="noopener noreferrer"
            >
              Inspect offer in game ↗
            </a>
          </div>
        )}
      </Show>
      <OfferLimitPanel offerLimit={knownOfferLimit()} />
      <OfferActionBar
        pending={props.pending}
        loading={props.loading}
        confirmReject={props.confirmReject}
        confirmPurchase={props.confirmPurchase}
        offerLimit={knownOfferLimit()}
        purchasePrice={props.offer.purchasePrice}
        onReject={props.onReject}
        onPurchase={props.onPurchase}
        onCancel={props.onCancel}
        onConfirmReject={props.onConfirmReject}
        onConfirmPurchase={props.onConfirmPurchase}
      />
      <Show when={props.confirmReject}>
        <p class="mt-2 text-xs font-medium text-rose-200">
          This cannot be undone. The current item will no longer be available
          from this terminal.
        </p>
      </Show>
      <Show when={props.confirmPurchase}>
        <p class="mt-2 text-xs text-amber-200">
          This is a real purchase and will charge your Steam Wallet upon
          authorization on Steam. Like in CS2, accepting the offer opens Steam
          to complete the microtransaction.
        </p>
      </Show>
      <TerminalOfferStatus
        session={props.session ?? (() => undefined)}
        message={props.purchaseMessage}
        containerMessage={props.containerStatusMessage}
      />
    </>
  );
}
