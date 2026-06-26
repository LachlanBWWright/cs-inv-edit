import { createSignal, For, Show } from "solid-js";
import type { InventoryItemDto, InventorySnapshot, OperationReceipt } from "@cs-inv-edit/contracts";
import { formatState, formatTimestamp } from "../lib/format";

export interface StorageViewProps {
  inventory: InventorySnapshot | undefined;
  onSubmit: (type: string, input?: unknown) => Promise<OperationReceipt>;
  onRefresh: () => void;
}

export function StorageView(props: StorageViewProps) {
  const storageUnits = () => (props.inventory?.items ?? []).filter((item) => item.kind === "storage_unit");
  const [status, setStatus] = createSignal<string>("");
  const [selectedItem, setSelectedItem] = createSignal<InventoryItemDto | undefined>();
  const [pendingOp, setPendingOp] = createSignal<OperationReceipt | undefined>();

  const runOperation = async (type: string, input?: unknown) => {
    setStatus("Submitting…");
    setPendingOp(undefined);
    try {
      const receipt = await props.onSubmit(type, input);
      setPendingOp(receipt);
      setStatus(`Queued ${receipt.type}`);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Request failed");
    }
  };

  return (
    <div class="space-y-5">
      <header class="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h2 class="text-3xl font-semibold">Storage</h2>
          <p class="mt-2 max-w-2xl text-sm text-slate-600">Inspect storage units and queue move actions with receipt-based state tracking.</p>
        </div>
        <button class="rounded-md border border-slate-300 bg-white px-3 py-2 text-sm hover:border-slate-500" onClick={() => props.onRefresh()}>
          Reload snapshot
        </button>
      </header>

      <Show when={status()}>
        <div class="rounded-lg border border-slate-200 bg-slate-50 p-3 text-sm text-slate-700">{status()}</div>
      </Show>

      <div class="grid grid-cols-1 gap-4 xl:grid-cols-[1.1fr_0.9fr]">
        <div class="space-y-3">
          <For each={storageUnits()}>
            {(unit) => (
              <article class={`rounded-lg border p-4 shadow-sm ${selectedItem()?.id === unit.id ? "border-cyan-600 bg-cyan-50" : "border-slate-200 bg-white"}`}>
                <div class="flex items-start justify-between gap-3">
                  <div>
                    <h3 class="font-semibold">{unit.name}</h3>
                    <p class="mt-1 text-sm text-slate-600">Count: {unit.storageCount ?? 0}</p>
                  </div>
                  <button class="rounded-md border border-slate-300 px-3 py-1 text-sm" onClick={() => setSelectedItem(unit)}>
                    Select
                  </button>
                </div>
                <div class="mt-4 flex flex-wrap gap-2">
                  <button class="rounded-md border border-slate-300 px-3 py-2 text-sm" onClick={() => runOperation("storage.load", { casketId: unit.id })}>
                    Load contents
                  </button>
                  <button class="rounded-md border border-cyan-600 px-3 py-2 text-sm text-cyan-700" onClick={() => runOperation("storage.move-in", { casketId: unit.id, itemId: selectedItem()?.id ?? "" })}>
                    Move item in
                  </button>
                  <button class="rounded-md border border-rose-600 px-3 py-2 text-sm text-rose-700" onClick={() => runOperation("storage.move-out", { casketId: unit.id, itemId: selectedItem()?.id ?? "" })}>
                    Move item out
                  </button>
                </div>
              </article>
            )}
          </For>
        </div>

        <div class="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <h3 class="text-lg font-semibold">Receipt state</h3>
          <Show when={pendingOp()} fallback={<p class="mt-3 text-sm text-slate-500">No pending receipt yet.</p>}>
            {(receipt) => (
              <div class="mt-4 space-y-3 rounded-lg border border-slate-200 p-3 text-sm text-slate-700">
                <div class="flex justify-between gap-3">
                  <span>Operation ID</span>
                  <span class="font-mono">{receipt().operationId}</span>
                </div>
                <div class="flex justify-between gap-3">
                  <span>State</span>
                  <span>{formatState(receipt().state)}</span>
                </div>
                <div class="flex justify-between gap-3">
                  <span>Created</span>
                  <span>{formatTimestamp(receipt().createdAt)}</span>
                </div>
              </div>
            )}
          </Show>
        </div>
      </div>
    </div>
  );
}
