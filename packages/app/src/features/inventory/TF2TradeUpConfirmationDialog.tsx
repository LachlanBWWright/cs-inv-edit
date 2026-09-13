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
import type {
  TF2TradeUpCollectionBreakdown,
  TF2TradeUpOutcome,
} from "./tf2-trade-up.js";
import {
  mergeMarketPrices,
  tradeUpConfirmationPhrase,
  tradeUpInputCost,
  tradeUpReceiptAccepted,
} from "./trade-up-confirmation.js";

type TF2Item = Extract<EconomyInventoryItemDto, { game: "tf2" }>;

export function TF2TradeUpConfirmationDialog(props: {
  open: boolean;
  items: TF2Item[];
  outcomes: TF2TradeUpOutcome[];
  collectionBreakdown?: TF2TradeUpCollectionBreakdown[];
  title?: string;
  description?: string;
  eligibility?: string;
  deterministic?: boolean;
  outputDescription?: string;
  requiredCount?: number;
  protocolWarning?: string;
  connected: boolean;
  enabled: boolean;
  priceAnalysisEnabled?: boolean;
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
        const prices = mergeMarketPrices(props.marketPrices, scanned);
        const cost = tradeUpInputCost(props.items, prices);
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
    typed() === tradeUpConfirmationPhrase &&
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
          tradeUpReceiptAccepted(receipt)
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
                <div class="border-b border-slate-800 py-2">
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
                </div>
              )}
            </For>
          </div>
        </section>
        <section class="space-y-4">
          <Show when={props.eligibility || props.outputDescription}>
            <div class="border-b border-slate-800 pb-3 text-xs text-slate-400">
              <h3 class="text-sm font-semibold text-slate-200">
                How this works
              </h3>
              <Show when={props.outputDescription}>
                <p class="mt-1">Output: {props.outputDescription}</p>
              </Show>
              <Show when={props.eligibility}>
                <p class="mt-1">Eligibility: {props.eligibility}</p>
              </Show>
              <Show when={props.deterministic !== undefined}>
                <p class="mt-1">
                  Result:{" "}
                  {props.deterministic
                    ? "deterministic"
                    : "random from the eligible output pool"}
                </p>
              </Show>
            </div>
          </Show>
          <Show when={props.collectionBreakdown?.length}>
            <div class="border-b border-slate-800 pb-3">
              <h3 class="text-sm font-semibold text-slate-200">
                Collection and rarity odds
              </h3>
              <div class="mt-2 grid gap-2 sm:grid-cols-2">
                <For each={props.collectionBreakdown}>
                  {(entry) => (
                    <div class="text-xs text-slate-400">
                      <div class="flex justify-between gap-2">
                        <span class="truncate">{entry.collection}</span>
                        <strong class="text-cyan-200">
                          {Math.round(entry.probability * 100)}%
                        </strong>
                      </div>
                      <p class="mt-1">
                        Next rarity: {entry.rarity ?? "unknown"} ·{" "}
                        {entry.outcomeCount} possible outputs
                      </p>
                    </div>
                  )}
                </For>
              </div>
            </div>
          </Show>
          <div class="max-h-80 overflow-y-auto">
            <For each={props.outcomes}>
              {(outcome) => (
                <div class="border-b border-slate-800 py-2">
                  <div class="flex items-baseline justify-between gap-3">
                    <p class="truncate text-sm font-medium text-slate-100">
                      {outcome.name}
                    </p>
                    <strong class="shrink-0 text-sm text-cyan-200">
                      {Math.round(outcome.probability * 100)}%
                    </strong>
                  </div>
                  <p class="mt-1 text-xs text-slate-500">
                    {outcome.collection ?? "Unknown collection"} ·{" "}
                    {outcome.rarity ?? "Unknown rarity"}
                  </p>
                </div>
              )}
            </For>
          </div>
          <ReturnEstimateCard
            enabled={props.priceAnalysisEnabled === true}
            estimate={estimate()}
            costLabel="Selected input value"
            note="TF2 output prices use schema names where exact market names are unavailable; missing price coverage makes ROI incomplete."
          />
          <Show when={!props.enabled}>
            <Alert variant="warning">
              This TF2 operation is disabled by its feature flag.
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
              onChange={(event) => setAcknowledged(event.currentTarget.checked)}
            />
            I understand every selected input is permanently consumed and the
            craft cannot be undone.
          </label>
          <label class="block text-sm">
            Type <strong>{tradeUpConfirmationPhrase}</strong> to confirm.
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
