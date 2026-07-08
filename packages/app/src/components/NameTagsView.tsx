import { createSignal, For, Show } from "solid-js";
import type { InventorySnapshot, OperationReceipt, RemoveItemNameRequest, SetItemNameRequest } from "@cs-inv-edit/contracts";
import { formatState } from "../lib/format.js";

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
    try {
      const receipt = await execute();
      setStatus(`${receipt.type}: ${formatState(receipt.state)}`);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Request failed");
    } finally {
      setPending(false);
    }
  };

  const quickItems = () => props.inventory?.items ?? [];

  return (
    <div class="space-y-5">
      <header>
        <h2 class="text-3xl font-semibold">Name tags</h2>
        <p class="mt-2 max-w-2xl text-sm text-slate-600">Apply and remove item names using explicit message-backed forms.</p>
      </header>

      <Show when={status()}>
        <div class="rounded-lg border border-slate-200 bg-slate-50 p-3 text-sm text-slate-700">{status()}</div>
      </Show>

      <Show when={quickItems().length > 0}>
        <div class="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <p class="text-sm font-semibold text-slate-700">Inventory IDs</p>
          <div class="mt-3 flex flex-wrap gap-2">
            <For each={quickItems().slice(0, 6)}>
              {(item) => (
                <button class="rounded-md border border-slate-300 px-2 py-1 text-xs" onClick={() => setApplyInput((current) => ({ ...current, subjectItemId: item.id }))}>
                  {item.name}
                </button>
              )}
            </For>
          </div>
        </div>
      </Show>

      <div class="grid grid-cols-1 gap-4 xl:grid-cols-2">
        <section class="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <h3 class="text-lg font-semibold">Apply name tag</h3>
          <div class="mt-4 space-y-3 text-sm">
            <input class="w-full rounded-md border border-slate-300 px-3 py-2" placeholder="Subject item ID" value={applyInput().subjectItemId} onInput={(event) => setApplyInput((current) => ({ ...current, subjectItemId: event.currentTarget.value.trim() }))} />
            <input class="w-full rounded-md border border-slate-300 px-3 py-2" placeholder="Name tag item ID" value={applyInput().toolItemId} onInput={(event) => setApplyInput((current) => ({ ...current, toolItemId: event.currentTarget.value.trim() }))} />
            <input class="w-full rounded-md border border-slate-300 px-3 py-2" placeholder="New custom name" value={applyInput().name} onInput={(event) => setApplyInput((current) => ({ ...current, name: event.currentTarget.value }))} />
            <button class="rounded-md border border-cyan-700 bg-cyan-700 px-3 py-2 text-white disabled:opacity-60" disabled={pending()} onClick={() => run(() => props.onApply(applyInput()))}>
              Apply
            </button>
          </div>
        </section>

        <section class="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <h3 class="text-lg font-semibold">Remove item name</h3>
          <div class="mt-4 space-y-3 text-sm">
            <input class="w-full rounded-md border border-slate-300 px-3 py-2" placeholder="Item ID" value={removeInput().itemId} onInput={(event) => setRemoveInput({ itemId: event.currentTarget.value.trim() })} />
            <button class="rounded-md border border-rose-700 bg-rose-700 px-3 py-2 text-white disabled:opacity-60" disabled={pending()} onClick={() => run(() => props.onRemove(removeInput()))}>
              Remove name
            </button>
          </div>
        </section>
      </div>
    </div>
  );
}
