import type { InventoryItemDto } from "@cs-inv-edit/contracts";
import { itemDisplayName } from "./inventory-view-utils.js";
import { For, Show } from "solid-js";
import { Alert } from "../../shared/ui/Alert.js";
import type { StorageMutationFailure } from "./inventory-action-handlers.js";

export function InventoryStorageMoveToolbar(props: {
  unit: InventoryItemDto;
  selectedCount: number;
  pending: boolean;
  enabled: boolean;
  unavailableReason?: string;
  failures: StorageMutationFailure[];
  onCancel: () => void;
  onConfirm: () => Promise<void> | void;
}) {
  const storedCount = () => props.unit.storageCount ?? 0;
  const remaining = () =>
    Math.max(0, 1000 - storedCount() - props.selectedCount);
  return (
    <div class="grid shrink-0 gap-3" role="status">
      <div class="flex flex-wrap items-center gap-3 rounded-xl border-2 border-cyan-500 bg-cyan-950 px-4 py-3 shadow-lg shadow-cyan-950/40">
      <button
        type="button"
        class="rounded-lg border border-slate-700 px-3 py-2 text-sm font-medium text-slate-200"
        disabled={props.pending}
        onClick={props.onCancel}
      >
        Cancel
      </button>
      <div class="min-w-0 flex-1">
        <strong class="block text-sm text-cyan-50">
          Move items into unit mode is active
        </strong>
        <span class="mt-0.5 block truncate text-xs text-cyan-100/70">
          {itemDisplayName(props.unit)} · {storedCount()} stored · {remaining()}{" "}
          slots remaining after selection
        </span>
      </div>
      <button
        type="button"
        class="ml-auto rounded-lg bg-cyan-500 px-3 py-2 text-sm font-semibold text-slate-950 disabled:cursor-not-allowed disabled:opacity-40"
        disabled={props.selectedCount === 0 || props.pending || !props.enabled}
        onClick={() => void props.onConfirm()}
      >
        Confirm move ({props.selectedCount})
      </button>
      </div>
      <Show when={props.unavailableReason}>
        {(reason) => <Alert variant="warning">{reason()}</Alert>}
      </Show>
      <Show when={props.failures.length > 0}>
        <Alert variant="danger">
          <p class="font-semibold">Some items could not be stored.</p>
          <ul class="mt-2 list-disc space-y-1 pl-5">
            <For each={props.failures}>
              {(failure) => (
                <li>
                  <span class="font-mono">{failure.itemId}</span>: {failure.message}
                </li>
              )}
            </For>
          </ul>
          <p class="mt-2">Failed items remain selected for retry.</p>
        </Alert>
      </Show>
    </div>
  );
}
