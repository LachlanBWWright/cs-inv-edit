import { createMemo, createSignal, For, Show, type Component } from "solid-js";
import type { InventoryItemDto, OperationReceipt, FeatureSettings } from "../lib/backend";
import { formatItemId } from "../lib/format";

interface TradeUpViewProps {
  inventory: InventoryItemDto[];
  settings: FeatureSettings;
  onSubmit(type: string, input?: unknown): Promise<OperationReceipt | null>;
}

export const TradeUpView: Component<TradeUpViewProps> = (props) => {
  const [selectedIds, setSelectedIds] = createSignal<string[]>([]);
  const [receipt, setReceipt] = createSignal<OperationReceipt | null>(null);
  const [message, setMessage] = createSignal<string>("");

  const selectedItems = createMemo(() => props.inventory.filter((item) => selectedIds().includes(item.id)));

  const toggle = (itemId: string) => {
    setSelectedIds((current) => {
      if (current.includes(itemId)) return current.filter((id) => id !== itemId);
      if (current.length >= 10) return current;
      return [...current, itemId];
    });
  };

  const submit = async () => {
    if (selectedIds().length !== 10) {
      setMessage("Select exactly 10 items for a trade-up preview.");
      return;
    }
    if (!props.settings.enableTradeups) {
      setMessage("Trade-up execution is disabled in development builds.");
      return;
    }
    const result = await props.onSubmit("tradeups.execute", { itemIds: selectedIds() });
    if (result) {
      setReceipt(result);
      setMessage(result.state === "blocked_by_feature_flag" ? "Execution is blocked by the current feature flags." : "Trade-up request queued.");
    }
  };

  return (
    <div class="space-y-5">
      <div class="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <div class="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <h2 class="text-2xl font-semibold text-slate-900">Trade-ups</h2>
            <p class="mt-1 text-sm text-slate-600">Pick 10 items, preview the recipe, and keep execution behind validation and feature flags.</p>
          </div>
          <button class="rounded-lg border border-rose-600 bg-rose-600 px-3 py-2 text-sm font-medium text-white disabled:cursor-not-allowed disabled:bg-slate-300" disabled={selectedIds().length !== 10 || !props.settings.enableTradeups} onClick={() => void submit()}>
            Execute trade-up
          </button>
        </div>
      </div>

      <div class="grid gap-5 xl:grid-cols-[1.15fr_0.85fr]">
        <div class="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <h3 class="text-lg font-semibold text-slate-900">Select 10 items</h3>
          <div class="mt-4 grid gap-3 md:grid-cols-2">
            <For each={props.inventory}>
              {(item) => (
                <button type="button" class={`rounded-xl border p-3 text-left ${selectedIds().includes(item.id) ? "border-cyan-500 bg-cyan-50" : "border-slate-200 bg-slate-50"}`} onClick={() => toggle(item.id)}>
                  <div class="font-semibold text-slate-900">{item.name}</div>
                  <div class="mt-1 text-xs font-mono text-slate-500">{formatItemId(item.id)}</div>
                </button>
              )}
            </For>
          </div>
        </div>

        <div class="space-y-4">
          <div class="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <h3 class="text-lg font-semibold text-slate-900">Preview</h3>
            <div class="mt-4 rounded-xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-700">
              <p class="font-medium">Recipe placeholder</p>
              <p class="mt-2">Selected {selectedIds().length} / 10 items. Validation placeholder will gate execution until live protocol checks pass.</p>
            </div>
            <Show when={message()}>
              <div class="mt-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">{message()}</div>
            </Show>
          </div>

          <Show when={receipt()}>
            {(receiptValue) => (
              <div class="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                <h3 class="text-lg font-semibold text-slate-900">Receipt</h3>
                <div class="mt-3 rounded-lg border border-slate-200 bg-slate-50 p-3 text-sm text-slate-700">
                  <div class="font-medium">{receiptValue().operationId}</div>
                  <div class="mt-1 text-xs">State: {receiptValue().state}</div>
                </div>
              </div>
            )}
          </Show>
        </div>
      </div>
    </div>
  );
};
