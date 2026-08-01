import {
  Show,
  createMemo,
  createSignal,
} from "solid-js";
import type {
  ArmorySnapshot,
  InventoryItemDto,
  RelatedItemDto,
} from "@cs-inv-edit/contracts";
import { Button } from "./ui/Button.js";
import { Card } from "./ui/Card.js";
import {
  type RevealItem,
} from "./ui/RevealAnimation.js";
import {
  formatUSDMinor,
  type ReturnEstimate,
} from "./roi-utils.js";
import {
  rarityBorderClass,
  sortRelatedItemsByRarity,
} from "./inventory-view-utils.js";
import { type LoadingStage } from "./ui/LoadingProgress.js";

export const armoryLoadingStages: readonly LoadingStage[] = [
  {
    afterSeconds: 0,
    label: "Requesting Armory account state",
    detail:
      "Reading the star balance and account generation from the CS2 Game Coordinator.",
  },
  {
    afterSeconds: 8,
    label: "Waiting for the Game Coordinator",
    detail:
      "CS2 may need several hello retries before returning the current Armory state.",
  },
  {
    afterSeconds: 18,
    label: "Building the current offer catalogue",
    detail:
      "Parsing the live CS2 schema and matching the active universal Armory offers.",
  },
  {
    afterSeconds: 35,
    label: "Resolving offer contents and images",
    detail:
      "Loading collection contents, rarity information, and tracked preview images.",
  },
  {
    afterSeconds: 65,
    label: "Still working—external metadata is slow",
    detail:
      "The request remains active while bounded Steam metadata lookups finish or time out.",
  },
];

export const ARMORY_PURCHASE_TIMEOUT_MS = 40_000;
export const armoryPurchaseTimeoutMessage =
  "Armory confirmation timed out after 40 seconds. The purchase may still complete; refresh Armory and inventory before trying again.";
export const ARMORY_STAR_COST_MINOR = 40;

export function withArmoryPurchaseTimeout<T>(
  promise: PromiseLike<T>,
  timeoutMs = ARMORY_PURCHASE_TIMEOUT_MS,
): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = globalThis.setTimeout(
      () => reject(new Error(armoryPurchaseTimeoutMessage)),
      timeoutMs,
    );
    void Promise.resolve(promise).then(
      (value) => {
        globalThis.clearTimeout(timer);
        resolve(value);
      },
      (error: unknown) => {
        globalThis.clearTimeout(timer);
        reject(error);
      },
    );
  });
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
            <Show
              when={item().imageUrl}
              fallback={
                <div class="flex h-full items-center justify-center text-4xl font-semibold text-slate-700">
                  {(item().marketName || item().name).slice(0, 2).toUpperCase()}
                </div>
              }
            >
              <img
                class="h-full w-full object-contain p-4 transition duration-200 group-hover:scale-105"
                src={item().imageUrl}
                alt={item().marketName || item().name}
                loading="lazy"
              />
            </Show>
            <div class="absolute inset-x-0 bottom-0 border-t border-slate-800 bg-slate-950 px-4 py-3">
              <p class="truncate text-sm font-semibold text-slate-100">
                {item().marketName || item().name}
              </p>
              <Show when={item().rarity}>
                <p class="mt-0.5 text-xs text-slate-400">{item().rarity}</p>
              </Show>
            </div>
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

export type ArmoryRevealVariant = "regular" | "stattrak" | "souvenir";

export function armoryRevealCandidates(
  items: RelatedItemDto[],
  variant: ArmoryRevealVariant,
): RevealItem[] {
  return items.map((candidate) => ({
    name: candidate.marketName || candidate.name,
    marketName: candidate.marketName,
    price: candidate.price,
    imageUrl: candidate.imageUrl,
    rarity: candidate.rarity,
    kind: candidate.kind,
    wear: candidate.paintWear,
    wearMin: candidate.wearMin,
    wearMax: candidate.wearMax,
    supportsStatTrak:
      variant === "stattrak" && candidate.kind === "weapon_skin",
    supportsSouvenir:
      variant === "souvenir" && candidate.kind === "weapon_skin",
  }));
}

export function armoryRevealResult(item: InventoryItemDto): RevealItem {
  return {
    name: item.marketName || item.customName || item.name,
    imageUrl: item.imageUrl,
    rarity: item.rarity,
    kind: item.kind,
    wear: item.paintWear,
    wearMin: item.paintWearMin,
    wearMax: item.paintWearMax,
    isStatTrak: item.isStatTrak,
    isSouvenir: item.isSouvenir,
  };
}

export function isContainerOffer(offer: ArmorySnapshot["offers"][number]) {
  return /(?:case|container|capsule|package)/i.test(
    `${offer.name ?? ""} ${offer.itemName ?? ""} ${offer.category ?? ""}`,
  );
}

export function isWeaponCaseOffer(offer: ArmorySnapshot["offers"][number]) {
  const label = `${offer.name ?? ""} ${offer.itemName ?? ""} ${offer.category ?? ""}`;
  const hasWeaponSkins = (offer.items ?? []).some(
    (item) => item.kind === "weapon_skin",
  );
  return (
    /weapon_case|crate/i.test(label) ||
    (hasWeaponSkins && /\bcase\b/i.test(label))
  );
}

export function armoryPurchaseUsesReveal(
  offer: ArmorySnapshot["offers"][number],
) {
  return !isWeaponCaseOffer(offer);
}

export function armoryRevealVariant(
  offer: ArmorySnapshot["offers"][number],
): ArmoryRevealVariant {
  const label = `${offer.name ?? ""} ${offer.itemName ?? ""} ${offer.category ?? ""}`;
  if (
    (offer.items ?? []).some((item) => item.kind === "weapon_skin") &&
    /souvenir.*package|package.*souvenir/i.test(label)
  )
    return "souvenir";
  return isWeaponCaseOffer(offer) ? "stattrak" : "regular";
}

export function armoryPurchaseRequiresConfirmation(
  quantity: number,
  costPerItem: number,
) {
  return quantity > 1 || quantity * costPerItem > 10;
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
        <div>
          <span class="text-lg font-semibold text-amber-300">
            {props.offer.expectedCost * props.quantity} stars
          </span>
          <span class="ml-2 text-xs text-slate-400">
            (
            {formatUSDMinor(
              props.offer.expectedCost *
                props.quantity *
                ARMORY_STAR_COST_MINOR,
            )}
            )
          </span>
          <Show
            when={props.estimateLoading}
            fallback={
              <Show when={props.estimate}>
                {(estimate) => (
                  <p class="mt-1 text-xs">
                    <span class="text-slate-400">
                      EV{" "}
                      {formatUSDMinor(
                        estimate().expectedValueMinor * props.quantity,
                      )}
                    </span>
                    <span
                      class={`ml-2 font-semibold ${estimate().roiPercent! >= 0 ? "text-emerald-300" : "text-rose-300"}`}
                    >
                      ROI {estimate().roiPercent! >= 0 ? "+" : ""}
                      {estimate().roiPercent!.toFixed(1)}%
                    </span>
                    <span class="ml-2 text-slate-500">
                      {estimate().pricedOutcomes}/{estimate().totalOutcomes}{" "}
                      priced
                    </span>
                  </p>
                )}
              </Show>
            }
          >
            <p class="mt-1 animate-pulse text-xs text-sky-300">
              Calculating expected return…
            </p>
          </Show>
        </div>
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
              props.quantity >=
              Math.floor(props.balance / props.offer.expectedCost)
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
      </div>
      <Show when={props.offer.expectedCost > props.balance}>
        <p class="mt-2 text-xs text-slate-500">
          Requires {props.offer.expectedCost - props.balance} more stars.
        </p>
      </Show>
      <Show when={props.confirming}>
        <div
          class={`mt-4 rounded-xl border p-4 ${props.quantity > 1 ? "border-red-400/40 bg-red-950" : "border-amber-400/30 bg-amber-950"}`}
        >
          <Show when={props.quantity > 1}>
            <p class="mb-2 font-semibold text-red-200">Bulk purchase warning</p>
          </Show>
          <p class="text-sm text-slate-200">
            Buy {props.quantity} for {props.offer.expectedCost * props.quantity}{" "}
            stars?
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
      </Show>
    </Card>
  );
}
