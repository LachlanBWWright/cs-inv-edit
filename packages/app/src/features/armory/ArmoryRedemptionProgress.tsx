import { Show } from "solid-js";
import type { InventoryItemDto } from "@cs-inv-edit/contracts";

export type ArmoryRedemptionProgressState = {
  offerName: string;
  quantity: number;
  totalCost: number;
  state: "sending" | "awaiting_gc_confirmation" | "completed" | "failed";
  message?: string;
  receivedItem?: InventoryItemDto;
};

function stateCopy(state: ArmoryRedemptionProgressState["state"]) {
  if (state === "sending")
    return { label: "Sending to CS2", detail: "Submitting redemption request" };
  if (state === "awaiting_gc_confirmation")
    return {
      label: "Waiting for CS2",
      detail: "The Game Coordinator is confirming your reward",
    };
  if (state === "failed")
    return { label: "Redemption failed", detail: "No stars were deducted" };
  return {
    label: "Redemption complete",
    detail: "Reward confirmed in your inventory",
  };
}

function ReceivedItem(props: { item: InventoryItemDto }) {
  const name = () => props.item.marketName || props.item.name;
  return (
    <div class="armory-received-item">
      <div class="flex h-14 w-14 shrink-0 items-center justify-center rounded-lg bg-slate-950 p-1">
        <Show
          when={props.item.imageUrl}
          fallback={
            <span class="text-xs font-semibold text-slate-500">ITEM</span>
          }
        >
          <img
            class="h-full w-full object-contain"
            src={props.item.imageUrl}
            alt=""
          />
        </Show>
      </div>
      <div class="min-w-0">
        <p class="text-[10px] font-semibold uppercase tracking-[0.16em] text-emerald-300">
          Received
        </p>
        <p class="truncate text-sm font-semibold text-slate-100">{name()}</p>
        <Show when={props.item.rarity}>
          <p class="truncate text-xs text-slate-400">{props.item.rarity}</p>
        </Show>
      </div>
    </div>
  );
}

function RedemptionProgressContent(props: {
  redemption: ArmoryRedemptionProgressState;
}) {
  const copy = () => stateCopy(props.redemption.state);
  const complete = () => props.redemption.state === "completed";
  const failed = () => props.redemption.state === "failed";
  return (
    <section
      class={`armory-redemption-panel ${complete() ? "armory-redemption-panel--complete" : ""} ${failed() ? "armory-redemption-panel--failed" : ""}`}
      aria-live="polite"
      aria-label="Armory redemption progress"
    >
      <div class="flex flex-wrap items-start justify-between gap-4">
        <div class="flex min-w-0 items-start gap-3">
          <div class="armory-progress-mark" aria-hidden="true">
            <span>{complete() ? "✓" : failed() ? "!" : "↗"}</span>
          </div>
          <div class="min-w-0">
            <p class="text-xs font-semibold uppercase tracking-[0.16em] text-slate-400">
              Latest redemption
            </p>
            <h2 class="truncate text-lg font-semibold text-slate-100">
              {props.redemption.offerName}
            </h2>
            <p class="mt-1 text-sm text-slate-300">
              {props.redemption.quantity}{" "}
              {props.redemption.quantity === 1 ? "item" : "items"}
              <span class="mx-2 text-slate-600">·</span>
              {props.redemption.totalCost} stars
            </p>
          </div>
        </div>
        <div class="text-right">
          <p
            class={`font-semibold ${complete() ? "text-emerald-300" : failed() ? "text-rose-300" : "text-amber-300"}`}
          >
            {copy().label}
          </p>
          <p class="mt-1 text-xs text-slate-400">{copy().detail}</p>
        </div>
      </div>
      <div class="mt-4">
        <div class="mb-2 flex justify-between text-xs text-slate-400">
          <span>
            {complete() ? "Confirmed" : failed() ? "Stopped" : "In progress"}
          </span>
          <span>
            {complete()
              ? `${props.redemption.quantity} / ${props.redemption.quantity}`
              : `0 / ${props.redemption.quantity}`}
          </span>
        </div>
        <div
          class="h-2 overflow-hidden rounded-full bg-slate-950"
          role="progressbar"
          aria-valuemin="0"
          aria-valuemax={props.redemption.quantity}
          aria-valuenow={complete() ? props.redemption.quantity : 0}
        >
          <div
            class={`armory-progress-bar ${complete() ? "armory-progress-bar--complete" : failed() ? "armory-progress-bar--failed" : ""}`}
            style={{ width: complete() ? "100%" : "32%" }}
          />
        </div>
      </div>
      <Show when={props.redemption.receivedItem}>
        {(item) => <ReceivedItem item={item()} />}
      </Show>
      <Show when={props.redemption.message && !complete()}>
        <p class="mt-3 text-xs text-slate-400">{props.redemption.message}</p>
      </Show>
    </section>
  );
}

export function ArmoryRedemptionProgress(props: {
  redemption: ArmoryRedemptionProgressState | undefined;
}) {
  return (
    <Show when={props.redemption} keyed>
      {(redemption) => <RedemptionProgressContent redemption={redemption} />}
    </Show>
  );
}
