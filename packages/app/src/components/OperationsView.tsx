import { For, Show } from "solid-js";
import type { OperationEvent, OperationReceipt } from "@cs-inv-edit/contracts";
import { formatState, formatTimestamp } from "../lib/format";

export interface OperationsViewProps {
  receipts: OperationReceipt[] | undefined;
  events: OperationEvent[] | undefined;
}

export function OperationsView(props: OperationsViewProps) {
  return (
    <div class="space-y-5">
      <header>
        <h2 class="text-3xl font-semibold">Operations</h2>
        <p class="mt-2 max-w-2xl text-sm text-slate-600">A compact operation log that tracks receipts, state progression, and emitted events.</p>
      </header>

      <div class="grid grid-cols-1 gap-4 xl:grid-cols-[1fr_1fr]">
        <div class="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <h3 class="text-lg font-semibold">Receipts</h3>
          <div class="mt-4 space-y-2">
            <For each={props.receipts ?? []}>
              {(receipt) => (
                <div class="rounded-lg border border-slate-200 p-3 text-sm text-slate-700">
                  <div class="flex items-center justify-between gap-3">
                    <span class="font-mono text-xs">{receipt.operationId}</span>
                    <span class="rounded-full bg-slate-100 px-2 py-1 text-xs">{formatState(receipt.state)}</span>
                  </div>
                  <p class="mt-2">{receipt.type}</p>
                  <p class="mt-1 text-xs text-slate-500">{formatTimestamp(receipt.createdAt)}</p>
                </div>
              )}
            </For>
          </div>
        </div>

        <div class="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <h3 class="text-lg font-semibold">Events</h3>
          <div class="mt-4 space-y-2">
            <For each={props.events ?? []}>
              {(event) => (
                <div class="rounded-lg border border-slate-200 p-3 text-sm text-slate-700">
                  <div class="flex items-center justify-between gap-3">
                    <span class="font-semibold">{event.type}</span>
                    <span class="rounded-full bg-slate-100 px-2 py-1 text-xs">{formatState(event.state)}</span>
                  </div>
                  <p class="mt-2">{event.message}</p>
                  <p class="mt-1 text-xs text-slate-500">{formatTimestamp(event.createdAt)}</p>
                </div>
              )}
            </For>
          </div>
        </div>
      </div>
    </div>
  );
}
