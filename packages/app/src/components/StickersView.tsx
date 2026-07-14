import { createSignal, For, Show } from "solid-js";
import type { InventorySnapshot, OperationReceipt } from "@cs-inv-edit/contracts";
import { formatState } from "../lib/format.js";
import { appErrorMessage, fromAppPromise } from "../lib/result.js";

export interface StickersViewProps {
  inventory: InventorySnapshot | undefined;
  onSubmit: (type: string, input?: unknown) => Promise<OperationReceipt>;
}

export function StickersView(props: StickersViewProps) {
  const [status, setStatus] = createSignal<string>("");
  const stickerItems = () => (props.inventory?.items ?? []).filter((item) => item.kind === "sticker_item");

  const runOperation = async (type: string) => {
    await fromAppPromise(props.onSubmit(type, { itemId: stickerItems()[0]?.id }), "Sticker request failed").match((receipt) => {
      setStatus(`${receipt.type}: ${formatState(receipt.state)}`);
    }, (error) => setStatus(appErrorMessage(error, "Request failed")));
  };

  return (
    <div class="space-y-5">
      <header>
        <h2 class="text-3xl font-semibold text-slate-100">Stickers</h2>
        <p class="mt-2 max-w-2xl text-sm text-slate-400">Read-only sticker display with extraction gated behind live validation.</p>
      </header>

      <div class="rounded-2xl border border-amber-500/30 bg-amber-500/10 p-4 text-sm text-amber-100">
        <p class="font-semibold">Requires live validation</p>
        <p class="mt-1">Sticker extraction remains development-only and must not be treated as production-ready.</p>
      </div>

      <Show when={status()}>
        <div class="rounded-lg border border-slate-700 bg-slate-900/80 p-3 text-sm text-slate-200">{status()}</div>
      </Show>

      <div class="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
        <For each={stickerItems()}>
          {(item) => (
            <article class="rounded-2xl border border-slate-800 bg-slate-900/80 p-4 shadow-sm">
              <h3 class="font-semibold text-slate-100">{item.name}</h3>
              <p class="mt-2 text-sm text-slate-400">Read-only preview for sticker assets.</p>
              <div class="mt-4 flex flex-wrap gap-2">
                <button class="rounded-md border border-slate-700 bg-slate-950/70 px-3 py-2 text-sm text-slate-200 transition hover:border-cyan-400/40" onClick={() => runOperation("stickers.extract")}>Extract</button>
              </div>
            </article>
          )}
        </For>
      </div>
    </div>
  );
}
