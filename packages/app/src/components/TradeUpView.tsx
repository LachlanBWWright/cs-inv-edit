import { createSignal, For, Show } from "solid-js";
import type { InventorySnapshot, OperationReceipt } from "@cs-inv-edit/contracts";
import { formatState } from "../lib/format.js";
import { rarityBorderClass } from "./inventory-view-utils.js";
import { appErrorMessage, fromAppPromise } from "../lib/result.js";

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
    await fromAppPromise(props.onSubmit("tradeups.preview", { recipe: recipe(), itemIds: selected() }), "Trade-up preview failed").match((receipt) => {
      setStatus(`Preview receipt: ${receipt.operationId} (${formatState(receipt.state)})`);
    }, (error) => setStatus(appErrorMessage(error, "Preview failed")));
  };

  const runExecute = async () => {
    await fromAppPromise(props.onSubmit("tradeups.execute", { recipe: recipe(), itemIds: selected() }), "Trade-up execution failed").match((receipt) => {
      setStatus(`Execution receipt: ${receipt.operationId} (${formatState(receipt.state)})`);
    }, (error) => setStatus(appErrorMessage(error, "Execution failed")));
  };

  return (
    <div class="space-y-5">
      <header>
        <h2 class="text-3xl font-semibold text-slate-100">Trade-ups</h2>
        <p class="mt-2 max-w-2xl text-sm text-slate-400">Select 10 items, preview a recipe placeholder, and require backend validation before execution.</p>
      </header>

      <div class="rounded-2xl border border-slate-800 bg-slate-900/80 p-4 shadow-sm">
        <div class="flex flex-wrap items-center gap-2">
          <input
            class="w-40 rounded-md border border-slate-700 bg-slate-950/70 px-3 py-2 text-sm text-slate-100 outline-none focus:border-cyan-400"
            type="number"
            min="0"
            value={recipe()}
            onInput={(event) => setRecipe(Number(event.currentTarget.value) || 0)}
          />
          <button class="rounded-md border border-slate-700 bg-slate-950/70 px-3 py-2 text-sm text-slate-200 transition hover:border-cyan-400/40" onClick={() => runPreview()}>Preview</button>
          <button class="rounded-md border border-cyan-500/40 bg-cyan-600/80 px-3 py-2 text-sm text-white transition hover:bg-cyan-500" disabled={selected().length !== 10} onClick={() => runExecute()}>
            Execute trade-up
          </button>
        </div>
        <p class="mt-3 text-sm text-slate-400">Selected: {selected().length}/10</p>
        <Show when={status()}>
          <div class="mt-3 rounded-lg border border-slate-700 bg-slate-950/70 p-3 text-sm text-slate-300">{status()}</div>
        </Show>
      </div>

      <div class="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
        <For each={props.inventory?.items ?? []}>
          {(item) => (
            <article class={`cursor-pointer rounded-2xl border-2 p-4 transition ${rarityBorderClass(item.rarity)} ${selected().includes(item.id) ? "bg-cyan-500/10 ring-1 ring-cyan-400/40" : "bg-slate-900/80 hover:bg-slate-800/90"}`} onClick={() => toggleSelection(item.id)}>
              <div class="flex items-start justify-between gap-3">
                <strong class="text-slate-100">{item.name}</strong>
                <span class="rounded-md bg-slate-800 px-2 py-1 text-xs text-slate-400">{item.kind}</span>
              </div>
              <p class="mt-3 text-sm text-slate-400">{selected().includes(item.id) ? "Selected" : "Click to add"}</p>
            </article>
          )}
        </For>
      </div>
    </div>
  );
}
