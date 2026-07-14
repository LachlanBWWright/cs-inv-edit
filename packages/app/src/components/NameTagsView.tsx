import { createSignal, For, Show } from "solid-js";
import type { InventorySnapshot, OperationReceipt, RemoveItemNameRequest, SetItemNameRequest } from "@cs-inv-edit/contracts";
import { formatState } from "../lib/format.js";
import { appErrorMessage, fromAppPromise } from "../lib/result.js";

export interface NameTagsViewProps {
  inventory: InventorySnapshot | undefined;
  onApply: (input: SetItemNameRequest) => Promise<OperationReceipt>;
  onRemove: (input: RemoveItemNameRequest) => Promise<OperationReceipt>;
}

export function NameTagsView(props: NameTagsViewProps) {
  const [applyInput, setApplyInput] = createSignal<SetItemNameRequest>({ subjectItemId: "", toolItemId: "", name: "" });
  const [removeInput, setRemoveInput] = createSignal<RemoveItemNameRequest>({ itemId: "" });
  const [status, setStatus] = createSignal("");
  const [pending, setPending] = createSignal(false);

  const run = async (execute: () => Promise<OperationReceipt>) => {
    setPending(true);
    await fromAppPromise(execute(), "Name-tag request failed").match((receipt) => {
      setStatus(`${receipt.type}: ${formatState(receipt.state)}`);
    }, (error) => setStatus(appErrorMessage(error, "Request failed")));
    setPending(false);
  };

  const quickItems = () => props.inventory?.items ?? [];

  return (
    <div class="space-y-5">
      <header>
        <h2 class="text-3xl font-semibold text-slate-100">Name tags</h2>
        <p class="mt-2 max-w-2xl text-sm text-slate-400">Apply and remove item names using explicit message-backed forms.</p>
      </header>

      <Show when={status()}>
        <div class="rounded-lg border border-slate-700 bg-slate-900/80 p-3 text-sm text-slate-200">{status()}</div>
      </Show>

      <Show when={quickItems().length > 0}>
        <div class="rounded-2xl border border-slate-800 bg-slate-900/80 p-4 shadow-sm">
          <p class="text-sm font-semibold text-slate-100">Inventory IDs</p>
          <div class="mt-3 flex flex-wrap gap-2">
            <For each={quickItems().slice(0, 6)}>
              {(item) => (
                <button class="rounded-md border border-slate-700 bg-slate-950/70 px-2 py-1 text-xs text-slate-200" onClick={() => setApplyInput((current) => ({ ...current, subjectItemId: item.id }))}>
                  {item.name}
                </button>
              )}
            </For>
          </div>
        </div>
      </Show>

      <div class="grid grid-cols-1 gap-4 xl:grid-cols-2">
        <section class="rounded-2xl border border-slate-800 bg-slate-900/80 p-4 shadow-sm">
          <h3 class="text-lg font-semibold text-slate-100">Apply name tag</h3>
          <div class="mt-4 space-y-3 text-sm">
            <input class="w-full rounded-md border border-slate-700 bg-slate-950/70 px-3 py-2 text-slate-100 outline-none focus:border-cyan-400" placeholder="Subject item ID" value={applyInput().subjectItemId} onInput={(event) => setApplyInput((current) => ({ ...current, subjectItemId: event.currentTarget.value.trim() }))} />
            <input class="w-full rounded-md border border-slate-700 bg-slate-950/70 px-3 py-2 text-slate-100 outline-none focus:border-cyan-400" placeholder="Name tag item ID" value={applyInput().toolItemId} onInput={(event) => setApplyInput((current) => ({ ...current, toolItemId: event.currentTarget.value.trim() }))} />
            <input class="w-full rounded-md border border-slate-700 bg-slate-950/70 px-3 py-2 text-slate-100 outline-none focus:border-cyan-400" placeholder="New custom name" value={applyInput().name} onInput={(event) => setApplyInput((current) => ({ ...current, name: event.currentTarget.value }))} />
            <button class="rounded-md border border-cyan-500/40 bg-cyan-600/80 px-3 py-2 text-white disabled:opacity-60" disabled={pending()} onClick={() => run(() => props.onApply(applyInput()))}>
              Apply
            </button>
          </div>
        </section>

        <section class="rounded-2xl border border-slate-800 bg-slate-900/80 p-4 shadow-sm">
          <h3 class="text-lg font-semibold text-slate-100">Remove item name</h3>
          <div class="mt-4 space-y-3 text-sm">
            <input class="w-full rounded-md border border-slate-700 bg-slate-950/70 px-3 py-2 text-slate-100 outline-none focus:border-cyan-400" placeholder="Item ID" value={removeInput().itemId} onInput={(event) => setRemoveInput({ itemId: event.currentTarget.value.trim() })} />
            <button class="rounded-md border border-rose-500/40 bg-rose-600/80 px-3 py-2 text-white disabled:opacity-60" disabled={pending()} onClick={() => run(() => props.onRemove(removeInput()))}>
              Remove name
            </button>
          </div>
        </section>
      </div>
    </div>
  );
}
