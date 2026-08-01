import type { InventoryItemDto } from "@cs-inv-edit/contracts";
import { itemDisplayName } from "./inventory-view-utils.js";

export function InventoryStorageMoveToolbar(props: {
  unit: InventoryItemDto;
  selectedCount: number;
  pending: boolean;
  onCancel: () => void;
  onConfirm: () => Promise<void> | void;
}) {
  const storedCount = () => props.unit.storageCount ?? 0;
  const remaining = () =>
    Math.max(0, 1000 - storedCount() - props.selectedCount);
  return (
    <div
      class="flex shrink-0 flex-wrap items-center gap-3 rounded-xl border-2 border-cyan-500 bg-cyan-950 px-4 py-3 shadow-lg shadow-cyan-950/40"
      role="status"
    >
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
        disabled={props.selectedCount === 0 || props.pending}
        onClick={() => void props.onConfirm()}
      >
        Confirm move ({props.selectedCount})
      </button>
    </div>
  );
}
