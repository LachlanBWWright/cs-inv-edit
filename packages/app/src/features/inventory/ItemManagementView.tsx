import { createSignal, Show, type JSX } from "solid-js";
import type {
  DeleteItemRequest,
  GiftItemRequest,
  OperationReceipt,
  UseItemRequest,
  UseMultipleItemsRequest,
} from "@cs-inv-edit/contracts";
import { formatState } from "../../shared/lib/format.js";
import { appErrorMessage, fromAppPromise } from "../../shared/lib/result.js";
import { Button, type ButtonProps } from "../../shared/ui/Button.js";

export interface ItemManagementViewProps {
  onDeleteItem: (input: DeleteItemRequest) => Promise<OperationReceipt>;
  onUseItem: (input: UseItemRequest) => Promise<OperationReceipt>;
  onUseMultipleItems: (
    input: UseMultipleItemsRequest,
  ) => Promise<OperationReceipt>;
  onGiftItem: (input: GiftItemRequest) => Promise<OperationReceipt>;
}

export function ItemManagementView(props: ItemManagementViewProps) {
  const [deleteInput, setDeleteInput] = createSignal<DeleteItemRequest>({
    itemId: "",
  });
  const [useItemInput, setUseItemInput] = createSignal<UseItemRequest>({
    itemId: "",
    targetSteamId: "",
  });
  const [multiUseRaw, setMultiUseRaw] = createSignal("");
  const [giftInput, setGiftInput] = createSignal<GiftItemRequest>({
    itemId: "",
    receiverAccountId: 0,
    giftMessage: "",
  });
  const [status, setStatus] = createSignal("");
  const [pending, setPending] = createSignal(false);

  const run = async (execute: () => Promise<OperationReceipt>) => {
    setPending(true);
    await fromAppPromise(execute(), "Item request failed").match(
      (receipt) => {
        setStatus(`${receipt.type}: ${formatState(receipt.state)}`);
      },
      (error) => setStatus(appErrorMessage(error, "Request failed")),
    );
    setPending(false);
  };

  const parseMultipleIds = (): string[] =>
    multiUseRaw()
      .split(",")
      .map((value) => value.trim())
      .filter(Boolean);
  const updateUseItemId: JSX.EventHandler<HTMLInputElement, InputEvent> = (
    event,
  ) => {
    setUseItemInput((current) => ({
      ...current,
      itemId: event.currentTarget.value.trim(),
    }));
  };
  const updateTargetSteamId: JSX.EventHandler<HTMLInputElement, InputEvent> = (
    event,
  ) => {
    setUseItemInput((current) => ({
      ...current,
      targetSteamId: event.currentTarget.value.trim(),
    }));
  };
  const updateGiftItemId: JSX.EventHandler<HTMLInputElement, InputEvent> = (
    event,
  ) => {
    setGiftInput((current) => ({
      ...current,
      itemId: event.currentTarget.value.trim(),
    }));
  };
  const updateGiftReceiver: JSX.EventHandler<HTMLInputElement, InputEvent> = (
    event,
  ) => {
    setGiftInput((current) => ({
      ...current,
      receiverAccountId: Number(event.currentTarget.value) || 0,
    }));
  };
  const updateGiftMessage: JSX.EventHandler<HTMLInputElement, InputEvent> = (
    event,
  ) => {
    setGiftInput((current) => ({
      ...current,
      giftMessage: event.currentTarget.value,
    }));
  };

  return (
    <div class="space-y-5">
      <header>
        <h2 class="text-3xl font-semibold text-slate-100">Item management</h2>
        <p class="mt-2 max-w-2xl text-sm text-slate-400">
          Delete, use, use in batches, and gift items through explicit operation
          forms.
        </p>
      </header>

      <Show when={status()}>
        <div class="rounded-lg border border-slate-700 bg-slate-900 p-3 text-sm text-slate-200">
          {status()}
        </div>
      </Show>

      <div class="grid grid-cols-1 gap-4 xl:grid-cols-2">
        <OperationFormCard
          title="Delete item"
          actionLabel="Delete item"
          actionVariant="danger"
          pending={pending()}
          onExecute={() => run(() => props.onDeleteItem(deleteInput()))}
        >
          <input
            class="w-full rounded-md border border-slate-700 bg-slate-950 px-3 py-2 text-slate-100 outline-none focus:border-cyan-400"
            placeholder="Item ID"
            value={deleteInput().itemId}
            onInput={(event) =>
              setDeleteInput({ itemId: event.currentTarget.value.trim() })
            }
          />
        </OperationFormCard>

        <OperationFormCard
          title="Use item"
          actionLabel="Use item"
          pending={pending()}
          onExecute={() => run(() => props.onUseItem(useItemInput()))}
        >
          <input
            class="w-full rounded-md border border-slate-700 bg-slate-950 px-3 py-2 text-slate-100 outline-none focus:border-cyan-400"
            placeholder="Item ID"
            value={useItemInput().itemId}
            onInput={updateUseItemId}
          />
          <input
            class="w-full rounded-md border border-slate-700 bg-slate-950 px-3 py-2 text-slate-100 outline-none focus:border-cyan-400"
            placeholder="Target Steam ID (optional)"
            value={useItemInput().targetSteamId ?? ""}
            onInput={updateTargetSteamId}
          />
        </OperationFormCard>

        <OperationFormCard
          title="Use multiple items"
          actionLabel="Use multiple"
          pending={pending()}
          onExecute={() =>
            run(() => props.onUseMultipleItems({ itemIds: parseMultipleIds() }))
          }
        >
          <input
            class="w-full rounded-md border border-slate-700 bg-slate-950 px-3 py-2 text-slate-100 outline-none focus:border-cyan-400"
            placeholder="Comma-separated item IDs"
            value={multiUseRaw()}
            onInput={(event) => setMultiUseRaw(event.currentTarget.value)}
          />
        </OperationFormCard>

        <OperationFormCard
          title="Gift item"
          actionLabel="Send gift"
          pending={pending()}
          onExecute={() => run(() => props.onGiftItem(giftInput()))}
        >
          <input
            class="w-full rounded-md border border-slate-700 bg-slate-950 px-3 py-2 text-slate-100 outline-none focus:border-cyan-400"
            placeholder="Item ID"
            value={giftInput().itemId}
            onInput={updateGiftItemId}
          />
          <input
            class="w-full rounded-md border border-slate-700 bg-slate-950 px-3 py-2 text-slate-100 outline-none focus:border-cyan-400"
            placeholder="Receiver account ID"
            type="number"
            value={giftInput().receiverAccountId}
            onInput={updateGiftReceiver}
          />
          <input
            class="w-full rounded-md border border-slate-700 bg-slate-950 px-3 py-2 text-slate-100 outline-none focus:border-cyan-400"
            placeholder="Gift message (optional)"
            value={giftInput().giftMessage ?? ""}
            onInput={updateGiftMessage}
          />
        </OperationFormCard>
      </div>
    </div>
  );
}

function OperationFormCard(props: {
  title: string;
  actionLabel: string;
  actionVariant?: ButtonProps["variant"];
  pending: boolean;
  onExecute: () => void;
  children: JSX.Element | string | number | null | undefined;
}) {
  return (
    <section class="rounded-2xl border border-slate-800 bg-slate-900 p-4 shadow-sm">
      <h3 class="text-lg font-semibold text-slate-100">{props.title}</h3>
      <div class="mt-4 space-y-3 text-sm">
        {props.children}
        <Button
          variant={props.actionVariant}
          disabled={props.pending}
          onClick={() => props.onExecute()}
        >
          {props.actionLabel}
        </Button>
      </div>
    </section>
  );
}
