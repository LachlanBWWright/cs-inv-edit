import { createSignal, For, Show, type JSX } from "solid-js";
import type {
  InventorySnapshot,
  OperationReceipt,
  RemoveItemNameRequest,
  SetItemNameRequest,
} from "@cs-inv-edit/contracts";
import { formatState } from "../lib/format.js";
import { appErrorMessage, fromAppPromise } from "../lib/result.js";
import { Button } from "./ui/Button.js";
import { Input } from "./ui/Input.js";
import { PageHeader } from "./ui/PageHeader.js";
import { Surface } from "./ui/Surface.js";

export interface NameTagsViewProps {
  inventory: InventorySnapshot | undefined;
  onApply: (input: SetItemNameRequest) => Promise<OperationReceipt>;
  onRemove: (input: RemoveItemNameRequest) => Promise<OperationReceipt>;
}

function QuickItemButton(props: {
  item: { id: string; name: string };
  onSelect: (itemId: string) => void;
}) {
  return (
    <Button
      variant="outline"
      size="sm"
      onClick={() => props.onSelect(props.item.id)}
    >
      {props.item.name}
    </Button>
  );
}

function QuickItemsPanel(props: {
  items: Array<{ id: string; name: string }>;
  onSelect: (itemId: string) => void;
}) {
  return (
    <Surface class="p-4">
      <p class="text-sm font-semibold text-slate-100">Inventory IDs</p>
      <div class="mt-3 flex flex-wrap gap-2">
        <For each={props.items}>
          {(item) => <QuickItemButton item={item} onSelect={props.onSelect} />}
        </For>
      </div>
    </Surface>
  );
}

function NameTagFormCard(props: {
  title: string;
  pending: boolean;
  actionLabel: string;
  variant?: "default" | "danger";
  onSubmit: () => void;
  children: JSX.Element | string | number | null | undefined;
}) {
  return (
    <Surface as="section" class="p-4">
      <h3 class="text-lg font-semibold text-slate-100">{props.title}</h3>
      <div class="mt-4 space-y-3 text-sm">
        {props.children}
        <Button
          variant={props.variant}
          disabled={props.pending}
          onClick={() => props.onSubmit()}
        >
          {props.actionLabel}
        </Button>
      </div>
    </Surface>
  );
}

export function NameTagsView(props: NameTagsViewProps) {
  const [applyInput, setApplyInput] = createSignal<SetItemNameRequest>({
    subjectItemId: "",
    toolItemId: "",
    name: "",
  });
  const [removeInput, setRemoveInput] = createSignal<RemoveItemNameRequest>({
    itemId: "",
  });
  const [status, setStatus] = createSignal("");
  const [pending, setPending] = createSignal(false);

  const run = async (execute: () => Promise<OperationReceipt>) => {
    setPending(true);
    await fromAppPromise(execute(), "Name-tag request failed").match(
      (receipt) => {
        setStatus(`${receipt.type}: ${formatState(receipt.state)}`);
      },
      (error) => setStatus(appErrorMessage(error, "Request failed")),
    );
    setPending(false);
  };

  const quickItems = () => props.inventory?.items ?? [];

  return (
    <div class="space-y-5">
      <PageHeader
        title="Name tags"
        description="Apply and remove item names using explicit message-backed forms."
      />
      <Show when={status()}>
        <div class="rounded-lg border border-slate-700 bg-slate-900/80 p-3 text-sm text-slate-200">
          {status()}
        </div>
      </Show>
      <Show when={quickItems().length > 0}>
        <QuickItemsPanel
          items={quickItems().slice(0, 6)}
          onSelect={(itemId) =>
            setApplyInput((current) => ({ ...current, subjectItemId: itemId }))
          }
        />
      </Show>
      <div class="grid grid-cols-1 gap-4 xl:grid-cols-2">
        <NameTagFormCard
          title="Apply name tag"
          pending={pending()}
          actionLabel="Apply"
          onSubmit={() => run(() => props.onApply(applyInput()))}
        >
          <Input
            placeholder="Subject item ID"
            value={applyInput().subjectItemId}
            onInput={(event) =>
              setApplyInput((current) => ({
                ...current,
                subjectItemId: event.currentTarget.value.trim(),
              }))
            }
          />
          <Input
            placeholder="Name tag item ID"
            value={applyInput().toolItemId}
            onInput={(event) =>
              setApplyInput((current) => ({
                ...current,
                toolItemId: event.currentTarget.value.trim(),
              }))
            }
          />
          <Input
            placeholder="New custom name"
            value={applyInput().name}
            onInput={(event) =>
              setApplyInput((current) => ({
                ...current,
                name: event.currentTarget.value,
              }))
            }
          />
        </NameTagFormCard>
        <NameTagFormCard
          title="Remove item name"
          pending={pending()}
          actionLabel="Remove name"
          variant="danger"
          onSubmit={() => run(() => props.onRemove(removeInput()))}
        >
          <Input
            placeholder="Item ID"
            value={removeInput().itemId}
            onInput={(event) =>
              setRemoveInput({ itemId: event.currentTarget.value.trim() })
            }
          />
        </NameTagFormCard>
      </div>
    </div>
  );
}
