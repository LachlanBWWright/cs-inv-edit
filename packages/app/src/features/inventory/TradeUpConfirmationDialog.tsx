import { createEffect, createSignal, For, Show } from "solid-js";
import type { InventoryItemDto, OperationReceipt } from "@cs-inv-edit/contracts";
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
import { SelectedTradeUpItemCard } from "../tools/trade-up-selected-item-card.js";
import type { TradeUpOutcome } from "../tools/trade-up-utils.js";

const confirmationPhrase = "TRADE UP";

export function TradeUpConfirmationDialog(props: {
  open: boolean;
  items: InventoryItemDto[];
  outcomes: TradeUpOutcome[];
  executionEnabled: boolean;
  connected: boolean;
  requiredCount: number;
  marketPrices: ReadonlyMap<string, number>;
  scanPrices: Parameters<typeof scanPriceMap>[1];
  onOpenChange: (open: boolean) => void;
  onRemove: (item: InventoryItemDto) => void;
  onExecute: (itemIds: string[]) => Promise<OperationReceipt>;
  onAccepted: () => void;
}) {
  const [acknowledged, setAcknowledged] = createSignal(false);
  const [phrase, setPhrase] = createSignal("");
  const [pending, setPending] = createSignal(false);
  const [message, setMessage] = createSignal("");
  const [estimate, setEstimate] = createSignal<ReturnEstimate>();
  const [pricesLoading, setPricesLoading] = createSignal(false);
  createEffect(() => {
    if (!props.open) return;
    setAcknowledged(false);
    setPhrase("");
    setMessage("");
    setEstimate(undefined);
    setPricesLoading(true);
    const names = [
      ...props.items.map((item) => item.marketName ?? ""),
      ...props.outcomes.map((item) => item.marketName ?? ""),
    ];
    void fromAppPromise(
      scanPriceMap(names, props.scanPrices),
      "Trade-up price scan failed",
    ).match(
      (scanned) => {
        const prices = new Map(props.marketPrices);
        for (const [name, value] of scanned) prices.set(name, value);
        const cost = props.items.reduce(
          (sum, item) => sum + (prices.get(item.marketName ?? "") ?? 0),
          0,
        );
        setEstimate(expectedReturn(props.outcomes, prices, cost || undefined));
        setPricesLoading(false);
      },
      () => setPricesLoading(false),
    );
  });
  const unavailableReason = () => {
    if (!props.executionEnabled)
      return "Trade-up execution is disabled by the enableTradeups feature flag.";
    if (!props.connected)
      return "Connect to Steam before submitting a trade-up.";
    return "";
  };
  const canExecute = () =>
    props.executionEnabled &&
    props.connected &&
    props.items.length === props.requiredCount &&
    acknowledged() &&
    phrase() === confirmationPhrase &&
    !pending();
  const execute = () => {
    if (!canExecute()) return;
    setPending(true);
    setMessage("");
    void fromAppPromise(
      props.onExecute(props.items.map((item) => item.id)),
      "Trade-up submission failed",
    ).match(
      (receipt) => {
        setPending(false);
        if (
          receipt.state === "awaiting_gc_confirmation" ||
          receipt.state === "completed"
        ) {
          props.onAccepted();
          return;
        }
        setMessage(receipt.message ?? "CS2 rejected the trade-up request.");
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
      title="Permanently submit this trade-up?"
      description="Every selected skin will be consumed. CS2 chooses one random result. This cannot be undone."
      onOpenChange={props.onOpenChange}
    >
      <div class="grid gap-5 xl:grid-cols-2">
        <section>
          <h3 class="mb-2 text-sm font-semibold text-slate-200">
            Inputs that will be destroyed
          </h3>
          <div class="grid gap-2 sm:grid-cols-2">
            <For each={props.items}>
              {(item, index) => (
                <SelectedTradeUpItemCard
                  item={item}
                  index={index()}
                  onRemove={() => props.onRemove(item)}
                />
              )}
            </For>
          </div>
        </section>
        <section class="space-y-4">
          <div>
            <h3 class="mb-2 text-sm font-semibold text-slate-200">
              Possible results
            </h3>
            <div class="grid max-h-80 gap-2 overflow-y-auto sm:grid-cols-2">
              <For each={props.outcomes}>
                {(outcome) => (
                  <RelatedItemPreview
                    item={{ ...outcome, paintWear: outcome.predictedWear }}
                    context="trade-up"
                    probability={outcome.probability}
                  />
                )}
              </For>
            </div>
          </div>
          <ReturnEstimateCard
            estimate={estimate()}
            loading={pricesLoading()}
            costLabel="Selected input value"
            note="Estimates use available Steam prices, ignore fees and liquidity, and do not guarantee a return."
          />
          <Show when={unavailableReason()}>
            <Alert variant="warning">{unavailableReason()}</Alert>
          </Show>
          <Show when={message()}>
            <Alert variant="danger">{message()}</Alert>
          </Show>
          <label class="flex items-start gap-3 rounded-lg border border-rose-500/40 p-3 text-sm text-slate-200">
            <input
              type="checkbox"
              checked={acknowledged()}
              onChange={(event) => setAcknowledged(event.currentTarget.checked)}
            />
            I understand that all selected inputs are permanently consumed and
            the output is random.
          </label>
          <label class="block text-sm text-slate-300">
            Type <strong>{confirmationPhrase}</strong> to enable submission.
            <Input
              value={phrase()}
              onInput={(event) => setPhrase(event.currentTarget.value)}
            />
          </label>
          <div class="flex justify-end gap-2">
            <Button
              variant="ghost"
              disabled={pending()}
              onClick={() => props.onOpenChange(false)}
            >
              Go back
            </Button>
            <Button variant="danger" disabled={!canExecute()} onClick={execute}>
              {pending() ? "Submitting…" : "Permanently submit trade-up"}
            </Button>
          </div>
        </section>
      </div>
    </Dialog>
  );
}
