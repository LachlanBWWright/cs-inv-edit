import { createSignal, Show } from "solid-js";
import type { DeleteItemRequest, GiftItemRequest, OperationReceipt, UseItemRequest, UseMultipleItemsRequest } from "@cs-inv-edit/contracts";
import { formatState } from "../lib/format.js";
import { appErrorMessage, fromAppPromise } from "../lib/result.js";

export interface ItemManagementViewProps {
  onDeleteItem: (input: DeleteItemRequest) => Promise<OperationReceipt>;
  onUseItem: (input: UseItemRequest) => Promise<OperationReceipt>;
  onUseMultipleItems: (input: UseMultipleItemsRequest) => Promise<OperationReceipt>;
  onGiftItem: (input: GiftItemRequest) => Promise<OperationReceipt>;
}

export function ItemManagementView(props: ItemManagementViewProps) {
  const [deleteInput, setDeleteInput] = createSignal<DeleteItemRequest>({ itemId: "" });
  const [useItemInput, setUseItemInput] = createSignal<UseItemRequest>({ itemId: "", targetSteamId: "" });
  const [multiUseRaw, setMultiUseRaw] = createSignal("");
  const [giftInput, setGiftInput] = createSignal<GiftItemRequest>({ itemId: "", receiverAccountId: 0, giftMessage: "" });
  const [status, setStatus] = createSignal("");
  const [pending, setPending] = createSignal(false);

  const run = async (execute: () => Promise<OperationReceipt>) => {
    setPending(true);
    await fromAppPromise(execute(), "Item request failed").match((receipt) => {
      setStatus(`${receipt.type}: ${formatState(receipt.state)}`);
    }, (error) => setStatus(appErrorMessage(error, "Request failed")));
    setPending(false);
  };

  const parseMultipleIDs = (): string[] =>
    multiUseRaw()
      .split(",")
      .map((value) => value.trim())
      .filter(Boolean);

  return (
    <div class="space-y-5">
      <header>
        <h2 class="text-3xl font-semibold text-slate-100">Item management</h2>
        <p class="mt-2 max-w-2xl text-sm text-slate-400">Delete, use, use in batches, and gift items through explicit operation forms.</p>
      </header>

      <Show when={status()}>
        <div class="rounded-lg border border-slate-700 bg-slate-900/80 p-3 text-sm text-slate-200">{status()}</div>
      </Show>

      <div class="grid grid-cols-1 gap-4 xl:grid-cols-2">
        <section class="rounded-2xl border border-slate-800 bg-slate-900/80 p-4 shadow-sm">
          <h3 class="text-lg font-semibold text-slate-100">Delete item</h3>
          <div class="mt-4 space-y-3 text-sm">
            <input class="w-full rounded-md border border-slate-700 bg-slate-950/70 px-3 py-2 text-slate-100 outline-none focus:border-cyan-400" placeholder="Item ID" value={deleteInput().itemId} onInput={(event) => setDeleteInput({ itemId: event.currentTarget.value.trim() })} />
            <button class="rounded-md border border-rose-500/40 bg-rose-600/80 px-3 py-2 text-white disabled:opacity-60" disabled={pending()} onClick={() => run(() => props.onDeleteItem(deleteInput()))}>
              Delete item
            </button>
          </div>
        </section>

        <section class="rounded-2xl border border-slate-800 bg-slate-900/80 p-4 shadow-sm">
          <h3 class="text-lg font-semibold text-slate-100">Use item</h3>
          <div class="mt-4 space-y-3 text-sm">
            <input class="w-full rounded-md border border-slate-700 bg-slate-950/70 px-3 py-2 text-slate-100 outline-none focus:border-cyan-400" placeholder="Item ID" value={useItemInput().itemId} onInput={(event) => setUseItemInput((current) => ({ ...current, itemId: event.currentTarget.value.trim() }))} />
            <input class="w-full rounded-md border border-slate-700 bg-slate-950/70 px-3 py-2 text-slate-100 outline-none focus:border-cyan-400" placeholder="Target Steam ID (optional)" value={useItemInput().targetSteamId ?? ""} onInput={(event) => setUseItemInput((current) => ({ ...current, targetSteamId: event.currentTarget.value.trim() }))} />
            <button class="rounded-md border border-cyan-500/40 bg-cyan-600/80 px-3 py-2 text-white disabled:opacity-60" disabled={pending()} onClick={() => run(() => props.onUseItem(useItemInput()))}>
              Use item
            </button>
          </div>
        </section>

        <section class="rounded-2xl border border-slate-800 bg-slate-900/80 p-4 shadow-sm">
          <h3 class="text-lg font-semibold text-slate-100">Use multiple items</h3>
          <div class="mt-4 space-y-3 text-sm">
            <input class="w-full rounded-md border border-slate-700 bg-slate-950/70 px-3 py-2 text-slate-100 outline-none focus:border-cyan-400" placeholder="Comma-separated item IDs" value={multiUseRaw()} onInput={(event) => setMultiUseRaw(event.currentTarget.value)} />
            <button
              class="rounded-md border border-cyan-500/40 bg-cyan-600/80 px-3 py-2 text-white disabled:opacity-60"
              disabled={pending()}
              onClick={() =>
                run(() =>
                  props.onUseMultipleItems({
                    itemIds: parseMultipleIDs(),
                  }),
                )
              }
            >
              Use multiple
            </button>
          </div>
        </section>

        <section class="rounded-2xl border border-slate-800 bg-slate-900/80 p-4 shadow-sm">
          <h3 class="text-lg font-semibold text-slate-100">Gift item</h3>
          <div class="mt-4 space-y-3 text-sm">
            <input class="w-full rounded-md border border-slate-700 bg-slate-950/70 px-3 py-2 text-slate-100 outline-none focus:border-cyan-400" placeholder="Item ID" value={giftInput().itemId} onInput={(event) => setGiftInput((current) => ({ ...current, itemId: event.currentTarget.value.trim() }))} />
            <input
              class="w-full rounded-md border border-slate-700 bg-slate-950/70 px-3 py-2 text-slate-100 outline-none focus:border-cyan-400"
              placeholder="Receiver account ID"
              type="number"
              value={giftInput().receiverAccountId}
              onInput={(event) => setGiftInput((current) => ({ ...current, receiverAccountId: Number(event.currentTarget.value) || 0 }))}
            />
            <input class="w-full rounded-md border border-slate-700 bg-slate-950/70 px-3 py-2 text-slate-100 outline-none focus:border-cyan-400" placeholder="Gift message (optional)" value={giftInput().giftMessage ?? ""} onInput={(event) => setGiftInput((current) => ({ ...current, giftMessage: event.currentTarget.value }))} />
            <button class="rounded-md border border-cyan-500/40 bg-cyan-600/80 px-3 py-2 text-white disabled:opacity-60" disabled={pending()} onClick={() => run(() => props.onGiftItem(giftInput()))}>
              Send gift
            </button>
          </div>
        </section>
      </div>
    </div>
  );
}
