import { createEffect, createSignal, For, Show } from "solid-js";
import type {
  EconomyInventoryItemDto,
  OperationReceipt,
} from "@cs-inv-edit/contracts";
import { Alert } from "../../shared/ui/Alert.js";
import { Button } from "../../shared/ui/Button.js";
import { Dialog } from "../../shared/ui/Dialog.js";
import { Input } from "../../shared/ui/Input.js";
import { fromAppPromise } from "../../shared/lib/result.js";
import { ReturnEstimateCard } from "../commerce/ReturnEstimateCard.js";
import {
  expectedReturn,
  scanPriceMap,
  type ReturnEstimate,
} from "../commerce/roi-utils.js";
import { RelatedItemPreview } from "./RelatedItemPreview.js";
import type { TF2TradeUpOutcome } from "./tf2-trade-up.js";

type TF2Item = Extract<EconomyInventoryItemDto, { game: "tf2" }>;
const phrase = "TRADE UP";

export function TF2TradeUpConfirmationDialog(props: {
  open: boolean;
  items: TF2Item[];
  outcomes: TF2TradeUpOutcome[];
  title?: string;
  description?: string;
  requiredCount?: number;
  protocolWarning?: string;
  connected: boolean;
  enabled: boolean;
  marketPrices: ReadonlyMap<string, number>;
  scanPrices: Parameters<typeof scanPriceMap>[1];
  onOpenChange: (open: boolean) => void;
  onRemove: (item: TF2Item) => void;
  onExecute: (itemIds: string[]) => Promise<OperationReceipt | undefined>;
  onAccepted: () => void;
}) {
  const [acknowledged, setAcknowledged] = createSignal(false);
  const [typed, setTyped] = createSignal("");
  const [pending, setPending] = createSignal(false);
  const [message, setMessage] = createSignal("");
  const [estimate, setEstimate] = createSignal<ReturnEstimate>();
  createEffect(() => {
    if (!props.open) return;
    setAcknowledged(false);
    setTyped("");
    setMessage("");
    const names = props.outcomes.map((outcome) => outcome.marketName ?? "");
    void fromAppPromise(
      scanPriceMap(names, props.scanPrices),
      "TF2 price scan failed",
    ).match(
      (scanned) => {
        const prices = new Map(props.marketPrices);
        for (const [name, value] of scanned) prices.set(name, value);
        const cost = props.items.reduce(
          (sum, item) => sum + (prices.get(item.marketName ?? "") ?? 0),
          0,
        );
        setEstimate(expectedReturn(props.outcomes, prices, cost || undefined));
      },
      () => setEstimate(undefined),
    );
  });
  const canExecute = () =>
    props.enabled &&
    props.connected &&
    props.items.length === (props.requiredCount ?? 10) &&
    acknowledged() &&
    typed() === phrase &&
    !pending();
  const execute = () => {
    if (!canExecute()) return;
    setPending(true);
    void fromAppPromise(
      props.onExecute(props.items.map((item) => item.assetId)),
      "TF2 trade-up submission failed",
    ).match(
      (receipt) => {
        setPending(false);
        if (
          receipt &&
          ["completed", "awaiting_gc_confirmation"].includes(receipt.state)
        ) {
          props.onAccepted();
          return;
        }
        setMessage(receipt?.message ?? "TF2 rejected the trade-up request.");
      },
      (error) => {
        setPending(false);
        setMessage(error.message);
      },
    );
  };
  return (
    <Dialog
      open={props.open}
      title={props.title ?? "Permanently submit this TF2 trade-up?"}
      description={
        props.description ??
        "All ten selected items will be consumed for one random item from the next collection grade."
      }
      onOpenChange={props.onOpenChange}
    >
      <div class="grid gap-5 xl:grid-cols-2">
        <section>
          <h3 class="mb-2 text-sm font-semibold">
            Inputs that will be destroyed
          </h3>
          <div class="grid gap-2 sm:grid-cols-2">
            <For each={props.items}>
              {(item, index) => (
                <article class="rounded-xl border border-slate-700 bg-slate-900 p-3">
                  <div class="flex justify-between gap-2">
                    <p class="truncate text-sm">
                      {index() + 1}. {item.name}
                    </p>
                    <button
                      class="text-xs text-slate-400"
                      onClick={() => props.onRemove(item)}
                    >
                      Remove
                    </button>
                  </div>
                  <p class="mt-1 text-xs text-slate-500">
                    {item.details.collection} · {item.details.rarity}
                  </p>
                </article>
              )}
            </For>
          </div>
        </section>
        <section class="space-y-4">
          <div class="grid max-h-80 gap-2 overflow-y-auto sm:grid-cols-2">
            <For each={props.outcomes}>
              {(outcome) => (
                <RelatedItemPreview
                  item={outcome}
                  probability={outcome.probability}
                />
              )}
            </For>
          </div>
          <ReturnEstimateCard
            estimate={estimate()}
            costLabel="Selected input value"
            note="TF2 output prices use schema names where exact market names are unavailable; missing price coverage makes ROI incomplete."
          />
          <Show when={!props.enabled}>
            <Alert variant="warning">
              TF2 crafting is disabled by the enableTf2Crafting feature flag.
            </Alert>
          </Show>
          <Show when={props.protocolWarning !== ""}>
            <Alert variant="warning">
              {props.protocolWarning ??
                "TF2 craft transmission also remains blocked until the request layout is verified against an authoritative capture."}
            </Alert>
          </Show>
          <Show when={message()}>
            <Alert variant="danger">{message()}</Alert>
          </Show>
          <label class="flex gap-3 rounded-lg border border-rose-500/40 p-3 text-sm">
            <input
              type="checkbox"
              checked={acknowledged()}
              onChange={(event) =>
                setAcknowledged(event.currentTarget.checked)
              }
            />
            I understand every selected input is permanently consumed and the
            craft cannot be undone.
          </label>
          <label class="block text-sm">
            Type <strong>{phrase}</strong> to confirm.
            <Input
              value={typed()}
              onInput={(event) => setTyped(event.currentTarget.value)}
            />
          </label>
          <div class="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => props.onOpenChange(false)}>
              Go back
            </Button>
            <Button variant="danger" disabled={!canExecute()} onClick={execute}>
              {pending() ? "Submitting…" : "Permanently submit TF2 trade-up"}
            </Button>
          </div>
        </section>
      </div>
    </Dialog>
  );
}
