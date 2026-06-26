import { createMemo, createSignal, For, Show, type Component } from "solid-js";
import type { InventoryItemDto, InventorySnapshot, OperationReceipt } from "../lib/backend";
import { formatItemId } from "../lib/format";

interface StorageViewProps {
  inventory: InventorySnapshot | null;
  settings: { enableStorageMutations: boolean };
  loading: boolean;
  pending?: string | null;
  onSubmit(type: string, input?: unknown): Promise<OperationReceipt | null>;
  onClear(): void;
}

export const StorageView: Component<StorageViewProps> = (props) => {
  const [selectedItemId, setSelectedItemId] = createSignal<string | undefined>();
  const [message, setMessage] = createSignal<string>("");
  const [receipt, setReceipt] = createSignal<OperationReceipt | null>(null);

  const storageUnits = createMemo(() => (props.inventory?.items ?? []).filter((item) => item.kind === "storage_unit"));
  const candidates = createMemo(() => (props.inventory?.items ?? []).filter((item) => item.kind !== "storage_unit"));

  const submit = async (type: string, input: unknown) => {
    setMessage("");
    const result = await props.onSubmit(type, input);
    if (result) {
      setReceipt(result);
      setMessage(result.state === "blocked_by_feature_flag" ? "Operation blocked by feature flag." : `Queued ${result.type}`);
    }
  };

  return (
    <div class="space-y-5">
      <div class="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <div class="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <h2 class="text-2xl font-semibold text-slate-900">Storage</h2>
            <p class="mt-1 text-sm text-slate-600">List storage units, load contents, and move an item with receipts that reflect the backend queue.</p>
          </div>
          <div class="flex gap-2">
            <button class="rounded-lg border border-slate-300 px-3 py-2 text-sm" onClick={() => props.onClear()}>
              Clear status
            </button>
            <button class="rounded-lg border border-cyan-700 bg-cyan-700 px-3 py-2 text-sm font-medium text-white disabled:cursor-not-allowed disabled:bg-slate-300" disabled={!props.settings.enableStorageMutations || props.loading} onClick={() => submit("storage.load-contents", { unitId: storageUnits()[0]?.id ?? "" })}>
              Load contents
            </button>
          </div>
        </div>
      </div>

      <div class="grid gap-5 xl:grid-cols-[0.95fr_1.05fr]">
        <div class="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <h3 class="text-lg font-semibold text-slate-900">Storage units</h3>
          <div class="mt-4 space-y-3">
            <For each={storageUnits()}>
              {(unit) => (
                <div class="rounded-xl border border-slate-200 bg-slate-50 p-3">
                  <div class="flex items-center justify-between gap-2">
                    <div>
                      <p class="font-semibold text-slate-900">{unit.name}</p>
                      <p class="mt-1 text-xs font-mono text-slate-500">{formatItemId(unit.id)}</p>
                    </div>
                    <span class="rounded-full bg-white px-2.5 py-1 text-xs text-slate-600">{unit.storageCount ?? 0} items</span>
                  </div>
                </div>
              )}
            </For>
          </div>
        </div>

        <div class="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <h3 class="text-lg font-semibold text-slate-900">Move an item</h3>
          <div class="mt-4 space-y-4">
            <label class="block text-sm text-slate-600">
              <span class="mb-1 block font-medium">Candidate item</span>
              <select class="w-full rounded-lg border border-slate-300 px-3 py-2" value={selectedItemId() ?? ""} onChange={(event) => setSelectedItemId(event.currentTarget.value)}>
                <option value="">Select an item</option>
                <For each={candidates()}>{(item) => <option value={item.id}>{item.name}</option>}</For>
              </select>
            </label>
            <div class="flex flex-wrap gap-2">
              <button class="rounded-lg border border-slate-300 px-3 py-2 text-sm" disabled={!selectedItemId() || !props.settings.enableStorageMutations} onClick={() => submit("storage.move-in", { itemId: selectedItemId(), casketId: storageUnits()[0]?.id ?? "" })}>
                Move in
              </button>
              <button class="rounded-lg border border-slate-300 px-3 py-2 text-sm" disabled={!selectedItemId() || !props.settings.enableStorageMutations} onClick={() => submit("storage.move-out", { itemId: selectedItemId(), casketId: storageUnits()[0]?.id ?? "" })}>
                Move out
              </button>
            </div>
            <Show when={message()}>
              <div class="rounded-lg border border-cyan-200 bg-cyan-50 px-3 py-2 text-sm text-cyan-900">{message()}</div>
            </Show>
            <Show when={receipt()}>
              {(receiptValue) => (
                <div class="rounded-lg border border-slate-200 bg-slate-50 p-3 text-sm text-slate-700">
                  <div class="font-medium">Receipt {receiptValue().operationId}</div>
                  <div class="mt-1 text-xs">State: {receiptValue().state}</div>
                  <div class="mt-1 text-xs">Created: {receiptValue().createdAt}</div>
                </div>
              )}
            </Show>
          </div>
        </div>
      </div>
    </div>
  );
};
