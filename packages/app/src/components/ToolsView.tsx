import { createSignal, Show } from "solid-js";
import type { ApplyStatTrakSwapRequest, ApplyStrangePartRequest, ApplyToolToBaseItemRequest, ApplyToolToItemRequest, OperationReceipt } from "@cs-inv-edit/contracts";
import { formatState } from "../lib/format.js";
import { appErrorMessage, fromAppPromise } from "../lib/result.js";

export interface ToolsViewProps {
  onApplyStatTrakSwap: (input: ApplyStatTrakSwapRequest) => Promise<OperationReceipt>;
  onApplyStrangePart: (input: ApplyStrangePartRequest) => Promise<OperationReceipt>;
  onApplyToolToItem: (input: ApplyToolToItemRequest) => Promise<OperationReceipt>;
  onApplyToolToBaseItem: (input: ApplyToolToBaseItemRequest) => Promise<OperationReceipt>;
}

export function ToolsView(props: ToolsViewProps) {
  const [statTrakInput, setStatTrakInput] = createSignal<ApplyStatTrakSwapRequest>({ toolItemId: "", item1ItemId: "", item2ItemId: "" });
  const [strangePartInput, setStrangePartInput] = createSignal<ApplyStrangePartRequest>({ strangePartItemId: "", itemItemId: "" });
  const [toolToItemInput, setToolToItemInput] = createSignal<ApplyToolToItemRequest>({ toolItemId: "", subjectItemId: "" });
  const [toolToBaseInput, setToolToBaseInput] = createSignal<ApplyToolToBaseItemRequest>({ toolItemId: "", baseitemDefIndex: 0 });
  const [status, setStatus] = createSignal("");
  const [pending, setPending] = createSignal(false);

  const run = async (execute: () => Promise<OperationReceipt>) => {
    setPending(true);
    await fromAppPromise(execute(), "Tool request failed").match((receipt) => {
      setStatus(`${receipt.type}: ${formatState(receipt.state)}`);
    }, (error) => setStatus(appErrorMessage(error, "Request failed")));
    setPending(false);
  };

  return (
    <div class="space-y-5">
      <header>
        <h2 class="text-3xl font-semibold text-slate-100">Tools</h2>
        <p class="mt-2 max-w-2xl text-sm text-slate-400">Run StatTrak, strange-part, and generic tool-to-item/base-item operations.</p>
      </header>

      <Show when={status()}>
        <div class="rounded-lg border border-slate-700 bg-slate-900/80 p-3 text-sm text-slate-200">{status()}</div>
      </Show>

      <div class="grid grid-cols-1 gap-4 xl:grid-cols-2">
        <section class="rounded-2xl border border-slate-800 bg-slate-900/80 p-4 shadow-sm">
          <h3 class="text-lg font-semibold text-slate-100">StatTrak swap</h3>
          <div class="mt-4 space-y-3 text-sm">
            <input class="w-full rounded-md border border-slate-700 bg-slate-950/70 px-3 py-2 text-slate-100 outline-none focus:border-cyan-400" placeholder="Tool item ID" value={statTrakInput().toolItemId} onInput={(event) => setStatTrakInput((current) => ({ ...current, toolItemId: event.currentTarget.value.trim() }))} />
            <input class="w-full rounded-md border border-slate-700 bg-slate-950/70 px-3 py-2 text-slate-100 outline-none focus:border-cyan-400" placeholder="Item 1 ID" value={statTrakInput().item1ItemId} onInput={(event) => setStatTrakInput((current) => ({ ...current, item1ItemId: event.currentTarget.value.trim() }))} />
            <input class="w-full rounded-md border border-slate-700 bg-slate-950/70 px-3 py-2 text-slate-100 outline-none focus:border-cyan-400" placeholder="Item 2 ID" value={statTrakInput().item2ItemId} onInput={(event) => setStatTrakInput((current) => ({ ...current, item2ItemId: event.currentTarget.value.trim() }))} />
            <button class="rounded-md border border-cyan-500/40 bg-cyan-600/80 px-3 py-2 text-white disabled:opacity-60" disabled={pending()} onClick={() => run(() => props.onApplyStatTrakSwap(statTrakInput()))}>
              Submit swap
            </button>
          </div>
        </section>

        <section class="rounded-2xl border border-slate-800 bg-slate-900/80 p-4 shadow-sm">
          <h3 class="text-lg font-semibold text-slate-100">Apply strange part</h3>
          <div class="mt-4 space-y-3 text-sm">
            <input class="w-full rounded-md border border-slate-700 bg-slate-950/70 px-3 py-2 text-slate-100 outline-none focus:border-cyan-400" placeholder="Strange part item ID" value={strangePartInput().strangePartItemId} onInput={(event) => setStrangePartInput((current) => ({ ...current, strangePartItemId: event.currentTarget.value.trim() }))} />
            <input class="w-full rounded-md border border-slate-700 bg-slate-950/70 px-3 py-2 text-slate-100 outline-none focus:border-cyan-400" placeholder="Target item ID" value={strangePartInput().itemItemId} onInput={(event) => setStrangePartInput((current) => ({ ...current, itemItemId: event.currentTarget.value.trim() }))} />
            <button class="rounded-md border border-cyan-500/40 bg-cyan-600/80 px-3 py-2 text-white disabled:opacity-60" disabled={pending()} onClick={() => run(() => props.onApplyStrangePart(strangePartInput()))}>
              Apply strange part
            </button>
          </div>
        </section>

        <section class="rounded-2xl border border-slate-800 bg-slate-900/80 p-4 shadow-sm">
          <h3 class="text-lg font-semibold text-slate-100">Apply tool to item</h3>
          <div class="mt-4 space-y-3 text-sm">
            <input class="w-full rounded-md border border-slate-700 bg-slate-950/70 px-3 py-2 text-slate-100 outline-none focus:border-cyan-400" placeholder="Tool item ID" value={toolToItemInput().toolItemId} onInput={(event) => setToolToItemInput((current) => ({ ...current, toolItemId: event.currentTarget.value.trim() }))} />
            <input class="w-full rounded-md border border-slate-700 bg-slate-950/70 px-3 py-2 text-slate-100 outline-none focus:border-cyan-400" placeholder="Subject item ID" value={toolToItemInput().subjectItemId} onInput={(event) => setToolToItemInput((current) => ({ ...current, subjectItemId: event.currentTarget.value.trim() }))} />
            <button class="rounded-md border border-cyan-500/40 bg-cyan-600/80 px-3 py-2 text-white disabled:opacity-60" disabled={pending()} onClick={() => run(() => props.onApplyToolToItem(toolToItemInput()))}>
              Apply to item
            </button>
          </div>
        </section>

        <section class="rounded-2xl border border-slate-800 bg-slate-900/80 p-4 shadow-sm">
          <h3 class="text-lg font-semibold text-slate-100">Apply tool to base item</h3>
          <div class="mt-4 space-y-3 text-sm">
            <input class="w-full rounded-md border border-slate-700 bg-slate-950/70 px-3 py-2 text-slate-100 outline-none focus:border-cyan-400" placeholder="Tool item ID" value={toolToBaseInput().toolItemId} onInput={(event) => setToolToBaseInput((current) => ({ ...current, toolItemId: event.currentTarget.value.trim() }))} />
            <input
              class="w-full rounded-md border border-slate-700 bg-slate-950/70 px-3 py-2 text-slate-100 outline-none focus:border-cyan-400"
              placeholder="Base item defindex"
              type="number"
              value={toolToBaseInput().baseitemDefIndex}
              onInput={(event) => setToolToBaseInput((current) => ({ ...current, baseitemDefIndex: Number(event.currentTarget.value) || 0 }))}
            />
            <button class="rounded-md border border-cyan-500/40 bg-cyan-600/80 px-3 py-2 text-white disabled:opacity-60" disabled={pending()} onClick={() => run(() => props.onApplyToolToBaseItem(toolToBaseInput()))}>
              Apply to base
            </button>
          </div>
        </section>
      </div>
    </div>
  );
}
