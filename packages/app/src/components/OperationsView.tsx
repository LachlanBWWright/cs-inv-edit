import { For, Show, type Component } from "solid-js";
import type { BackendEvent, OperationReceipt } from "../lib/backend";
import { formatTimestamp } from "../lib/format";

interface OperationsViewProps {
  events: BackendEvent[];
  receipts: OperationReceipt[];
  loading: boolean;
  onRefresh(): void;
}

export const OperationsView: Component<OperationsViewProps> = (props) => {
  return (
    <div class="space-y-5">
      <div class="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <div class="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <h2 class="text-2xl font-semibold text-slate-900">Operations</h2>
            <p class="mt-1 text-sm text-slate-600">Track queue state, raw operation IDs, and backend events from the mock GC client.</p>
          </div>
          <button class="rounded-lg border border-slate-300 px-3 py-2 text-sm" onClick={() => props.onRefresh()}>{props.loading ? "Refreshing..." : "Refresh events"}</button>
        </div>
      </div>

      <div class="grid gap-5 xl:grid-cols-[0.95fr_1.05fr]">
        <div class="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <h3 class="text-lg font-semibold text-slate-900">Operation log</h3>
          <div class="mt-4 space-y-3">
            <For each={props.receipts}>
              {(receipt) => (
                <div class="rounded-xl border border-slate-200 bg-slate-50 p-3 text-sm text-slate-700">
                  <div class="flex items-center justify-between gap-2">
                    <span class="font-semibold text-slate-900">{receipt.type}</span>
                    <span class="rounded-full bg-white px-2.5 py-1 text-xs uppercase tracking-wide text-slate-600">{receipt.state}</span>
                  </div>
                  <div class="mt-2 font-mono text-xs">{receipt.operationId}</div>
                  <div class="mt-1 text-xs">{formatTimestamp(receipt.createdAt)}</div>
                </div>
              )}
            </For>
          </div>
        </div>

        <div class="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <h3 class="text-lg font-semibold text-slate-900">Backend events</h3>
          <div class="mt-4 space-y-3">
            <For each={props.events}>
              {(event) => (
                <div class="rounded-xl border border-slate-200 bg-slate-50 p-3 text-sm text-slate-700">
                  <div class="flex items-center justify-between gap-2">
                    <span class="font-semibold text-slate-900">{event.type}</span>
                    <span class="text-xs">{formatTimestamp(event.createdAt)}</span>
                  </div>
                  <pre class="mt-2 whitespace-pre-wrap text-xs text-slate-500">{JSON.stringify(event.payload, null, 2)}</pre>
                </div>
              )}
            </For>
          </div>
        </div>
      </div>
    </div>
  );
};
