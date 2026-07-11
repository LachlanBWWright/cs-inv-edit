import { createSignal, For, Show } from "solid-js";
import type { InventorySnapshot, OperationReceipt } from "@cs-inv-edit/contracts";
import { formatState } from "../lib/format.js";

export interface StickersViewProps {
  inventory: InventorySnapshot | undefined;
  onSubmit: (type: string, input?: unknown) => Promise<OperationReceipt>;
}

export function StickersView(props: StickersViewProps) {
  const [status, setStatus] = createSignal<string>("");
  const stickerItems = () => (props.inventory?.items ?? []).filter((item) => item.kind === "sticker_item");

  const runOperation = async (type: string) => {
    try {
      const receipt = await props.onSubmit(type, { itemId: stickerItems()[0]?.id });
      setStatus(`${receipt.type}: ${formatState(receipt.state)}`);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Request failed");
    }
  };

  return (
    <div class="space-y-5">
      <header>
        <h2 class="text-3xl font-semibold">Stickers</h2>
        <p class="mt-2 max-w-2xl text-sm text-slate-600">Read-only sticker display with extraction gated behind live validation.</p>
      </header>

      <div class="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
        <p class="font-semibold">Requires live validation</p>
        <p class="mt-1">Sticker extraction remains development-only and must not be treated as production-ready.</p>
      </div>

      <Show when={status()}>
        <div class="rounded-lg border border-slate-200 bg-slate-50 p-3 text-sm text-slate-700">{status()}</div>
      </Show>

      <div class="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
        <For each={stickerItems()}>
          {(item) => (
            <article class="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
              <h3 class="font-semibold">{item.name}</h3>
              <p class="mt-2 text-sm text-slate-600">Read-only preview for sticker assets.</p>
              <div class="mt-4 flex flex-wrap gap-2">
                <button class="rounded-md border border-slate-300 px-3 py-2 text-sm" onClick={() => runOperation("stickers.extract")}>Extract</button>
              </div>
            </article>
          )}
        </For>
      </div>
    </div>
  );
}
