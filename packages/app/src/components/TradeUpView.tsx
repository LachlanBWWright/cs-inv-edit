import { createSignal, For, Show } from "solid-js";
import type { InventorySnapshot, OperationReceipt } from "@cs-inv-edit/contracts";
import { formatState } from "../lib/format.js";

export interface TradeUpViewProps {
  inventory: InventorySnapshot | undefined;
  onSubmit: (type: string, input?: unknown) => Promise<OperationReceipt>;
}

export function TradeUpView(props: TradeUpViewProps) {
  const [selected, setSelected] = createSignal<string[]>([]);
  const [recipe, setRecipe] = createSignal<number>(0);
  const [status, setStatus] = createSignal<string>("");

  const toggleSelection = (itemId: string) => {
    setSelected((current) => {
      if (current.includes(itemId)) return current.filter((value) => value !== itemId);
      return current.length >= 10 ? current : [...current, itemId];
    });
  };

  const runPreview = async () => {
    try {
      const receipt = await props.onSubmit("tradeups.preview", { recipe: recipe(), itemIds: selected() });
      setStatus(`Preview receipt: ${receipt.operationId} (${formatState(receipt.state)})`);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Preview failed");
    }
  };

  const runExecute = async () => {
    try {
      const receipt = await props.onSubmit("tradeups.execute", { recipe: recipe(), itemIds: selected() });
      setStatus(`Execution receipt: ${receipt.operationId} (${formatState(receipt.state)})`);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Execution failed");
    }
  };

  return (
    <div class="space-y-5">
      <header>
        <h2 class="text-3xl font-semibold">Trade-ups</h2>
        <p class="mt-2 max-w-2xl text-sm text-slate-600">Select 10 items, preview a recipe placeholder, and require backend validation before execution.</p>
      </header>

      <div class="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
        <div class="flex flex-wrap items-center gap-2">
          <input
            class="w-40 rounded-md border border-slate-300 px-3 py-2 text-sm"
            type="number"
            min="0"
            value={recipe()}
            onInput={(event) => setRecipe(Number(event.currentTarget.value) || 0)}
          />
          <button class="rounded-md border border-slate-300 px-3 py-2 text-sm" onClick={() => runPreview()}>Preview</button>
          <button class="rounded-md border border-cyan-700 bg-cyan-700 px-3 py-2 text-sm text-white" disabled={selected().length !== 10} onClick={() => runExecute()}>
            Execute trade-up
          </button>
        </div>
        <p class="mt-3 text-sm text-slate-600">Selected: {selected().length}/10</p>
        <Show when={status()}>
          <div class="mt-3 rounded-lg border border-slate-200 bg-slate-50 p-3 text-sm text-slate-700">{status()}</div>
        </Show>
      </div>

      <div class="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
        <For each={props.inventory?.items ?? []}>
          {(item) => (
            <article class={`cursor-pointer rounded-lg border p-4 shadow-sm ${selected().includes(item.id) ? "border-cyan-600 bg-cyan-50" : "border-slate-200 bg-white"}`} onClick={() => toggleSelection(item.id)}>
              <div class="flex items-start justify-between gap-3">
                <strong>{item.name}</strong>
                <span class="rounded-md bg-slate-100 px-2 py-1 text-xs text-slate-600">{item.kind}</span>
              </div>
              <p class="mt-3 text-sm text-slate-600">{selected().includes(item.id) ? "Selected" : "Click to add"}</p>
            </article>
          )}
        </For>
      </div>
    </div>
  );
}
