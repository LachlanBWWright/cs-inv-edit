import { createSignal, Show } from "solid-js";
import type { DeleteItemRequest, GiftItemRequest, OperationReceipt, UseItemRequest, UseMultipleItemsRequest } from "@cs-inv-edit/contracts";
import { formatState } from "../lib/format.js";

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
    try {
      const receipt = await execute();
      setStatus(`${receipt.type}: ${formatState(receipt.state)}`);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Request failed");
    } finally {
      setPending(false);
    }
  };

  const parseMultipleIDs = (): string[] =>
    multiUseRaw()
      .split(",")
      .map((value) => value.trim())
      .filter(Boolean);

  return (
    <div class="space-y-5">
      <header>
        <h2 class="text-3xl font-semibold">Item management</h2>
        <p class="mt-2 max-w-2xl text-sm text-slate-600">Delete, use, use in batches, and gift items through explicit operation forms.</p>
      </header>

      <Show when={status()}>
        <div class="rounded-lg border border-slate-200 bg-slate-50 p-3 text-sm text-slate-700">{status()}</div>
      </Show>

      <div class="grid grid-cols-1 gap-4 xl:grid-cols-2">
        <section class="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <h3 class="text-lg font-semibold">Delete item</h3>
          <div class="mt-4 space-y-3 text-sm">
            <input class="w-full rounded-md border border-slate-300 px-3 py-2" placeholder="Item ID" value={deleteInput().itemId} onInput={(event) => setDeleteInput({ itemId: event.currentTarget.value.trim() })} />
            <button class="rounded-md border border-rose-700 bg-rose-700 px-3 py-2 text-white disabled:opacity-60" disabled={pending()} onClick={() => run(() => props.onDeleteItem(deleteInput()))}>
              Delete item
            </button>
          </div>
        </section>

        <section class="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <h3 class="text-lg font-semibold">Use item</h3>
          <div class="mt-4 space-y-3 text-sm">
            <input class="w-full rounded-md border border-slate-300 px-3 py-2" placeholder="Item ID" value={useItemInput().itemId} onInput={(event) => setUseItemInput((current) => ({ ...current, itemId: event.currentTarget.value.trim() }))} />
            <input class="w-full rounded-md border border-slate-300 px-3 py-2" placeholder="Target Steam ID (optional)" value={useItemInput().targetSteamId ?? ""} onInput={(event) => setUseItemInput((current) => ({ ...current, targetSteamId: event.currentTarget.value.trim() }))} />
            <button class="rounded-md border border-cyan-700 bg-cyan-700 px-3 py-2 text-white disabled:opacity-60" disabled={pending()} onClick={() => run(() => props.onUseItem(useItemInput()))}>
              Use item
            </button>
          </div>
        </section>

        <section class="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <h3 class="text-lg font-semibold">Use multiple items</h3>
          <div class="mt-4 space-y-3 text-sm">
            <input class="w-full rounded-md border border-slate-300 px-3 py-2" placeholder="Comma-separated item IDs" value={multiUseRaw()} onInput={(event) => setMultiUseRaw(event.currentTarget.value)} />
            <button
              class="rounded-md border border-cyan-700 bg-cyan-700 px-3 py-2 text-white disabled:opacity-60"
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

        <section class="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <h3 class="text-lg font-semibold">Gift item</h3>
          <div class="mt-4 space-y-3 text-sm">
            <input class="w-full rounded-md border border-slate-300 px-3 py-2" placeholder="Item ID" value={giftInput().itemId} onInput={(event) => setGiftInput((current) => ({ ...current, itemId: event.currentTarget.value.trim() }))} />
            <input
              class="w-full rounded-md border border-slate-300 px-3 py-2"
              placeholder="Receiver account ID"
              type="number"
              value={giftInput().receiverAccountId}
              onInput={(event) => setGiftInput((current) => ({ ...current, receiverAccountId: Number(event.currentTarget.value) || 0 }))}
            />
            <input class="w-full rounded-md border border-slate-300 px-3 py-2" placeholder="Gift message (optional)" value={giftInput().giftMessage ?? ""} onInput={(event) => setGiftInput((current) => ({ ...current, giftMessage: event.currentTarget.value }))} />
            <button class="rounded-md border border-cyan-700 bg-cyan-700 px-3 py-2 text-white disabled:opacity-60" disabled={pending()} onClick={() => run(() => props.onGiftItem(giftInput()))}>
              Send gift
            </button>
          </div>
        </section>
      </div>
    </div>
  );
}
