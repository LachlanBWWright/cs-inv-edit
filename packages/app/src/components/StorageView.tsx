import { createSignal, For, Show } from "solid-js";
import type { InventoryItemDto, InventorySnapshot, OperationReceipt } from "@cs-inv-edit/contracts";
import { formatState, formatTimestamp } from "../lib/format.js";
import { appErrorMessage, fromAppPromise } from "../lib/result.js";

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
    await fromAppPromise(props.onSubmit(type, input), "Storage request failed").match((receipt) => {
      setPendingOp(receipt);
      setStatus(`Queued ${receipt.type}`);
    }, (error) => setStatus(appErrorMessage(error, "Request failed")));
  };

  return (
    <div class="space-y-5">
      <header class="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h2 class="text-3xl font-semibold text-slate-100">Storage</h2>
          <p class="mt-2 max-w-2xl text-sm text-slate-400">Inspect storage units and queue move actions with receipt-based state tracking.</p>
        </div>
        <button class="rounded-md border border-slate-700 bg-slate-900/80 px-3 py-2 text-sm text-slate-200 transition hover:border-cyan-400/40 hover:bg-slate-800" onClick={() => props.onRefresh()}>
          Reload snapshot
        </button>
      </header>

      <Show when={status()}>
        <div class="rounded-lg border border-slate-700 bg-slate-900/80 p-3 text-sm text-slate-200">{status()}</div>
      </Show>

      <div class="grid grid-cols-1 gap-4 xl:grid-cols-[1.1fr_0.9fr]">
        <div class="space-y-3">
          <For each={storageUnits()}>
            {(unit) => (
              <article class={`rounded-2xl border p-4 shadow-sm ${selectedItem()?.id === unit.id ? "border-cyan-500/50 bg-cyan-500/10" : "border-slate-800 bg-slate-900/80"}`}>
                <div class="flex items-start justify-between gap-3">
                  <div>
                    <h3 class="font-semibold text-slate-100">{unit.name}</h3>
                    <p class="mt-1 text-sm text-slate-400">Count: {unit.storageCount ?? 0}</p>
                  </div>
                  <button class="rounded-md border border-slate-700 bg-slate-950/70 px-3 py-1 text-sm text-slate-200 transition hover:border-cyan-400/40" onClick={() => setSelectedItem(unit)}>
                    Select
                  </button>
                </div>
                <div class="mt-4 flex flex-wrap gap-2">
                  <button class="rounded-md border border-slate-700 bg-slate-950/70 px-3 py-2 text-sm text-slate-200 transition hover:border-cyan-400/40" onClick={() => runOperation("storage.load", { casketId: unit.id })}>
                    Load contents
                  </button>
                  <button class="rounded-md border border-cyan-500/40 bg-cyan-600/80 px-3 py-2 text-sm text-white transition hover:bg-cyan-500" onClick={() => runOperation("storage.move-in", { casketId: unit.id, itemId: selectedItem()?.id ?? "" })}>
                    Move item in
                  </button>
                  <button class="rounded-md border border-rose-500/40 bg-rose-600/80 px-3 py-2 text-sm text-white transition hover:bg-rose-500" onClick={() => runOperation("storage.move-out", { casketId: unit.id, itemId: selectedItem()?.id ?? "" })}>
                    Move item out
                  </button>
                </div>
              </article>
            )}
          </For>
        </div>

        <div class="rounded-2xl border border-slate-800 bg-slate-900/80 p-4 shadow-sm">
          <h3 class="text-lg font-semibold text-slate-100">Receipt state</h3>
          <Show when={pendingOp()} fallback={<p class="mt-3 text-sm text-slate-400">No pending receipt yet.</p>}>
            {(receipt) => (
              <div class="mt-4 space-y-3 rounded-xl border border-slate-800 bg-slate-950/70 p-3 text-sm text-slate-300">
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
