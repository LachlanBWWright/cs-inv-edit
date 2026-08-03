import { For } from "solid-js";
import type { OperationEvent, OperationReceipt } from "@cs-inv-edit/contracts";
import { Card, CardContent } from "../../shared/ui/Card.js";
import { formatState, formatTimestamp } from "../../shared/lib/format.js";

export interface OperationsViewProps {
  receipts: OperationReceipt[] | undefined;
  events: OperationEvent[] | undefined;
}

function ReceiptCard(props: { receipt: OperationReceipt }) {
  return (
    <div class="rounded-2xl border border-slate-800 bg-slate-950 p-3 text-sm text-slate-300">
      <div class="flex items-center justify-between gap-3">
        <span class="font-mono text-xs text-slate-400">
          {props.receipt.operationId}
        </span>
        <span class="rounded-full border border-slate-700 bg-slate-800 px-2 py-1 text-xs text-slate-200">
          {formatState(props.receipt.state)}
        </span>
      </div>
      <p class="mt-2">{props.receipt.type}</p>
      <p class="mt-1 text-xs text-slate-400">
        {formatTimestamp(props.receipt.createdAt)}
      </p>
    </div>
  );
}

function EventCard(props: { event: OperationEvent }) {
  return (
    <div class="rounded-2xl border border-slate-800 bg-slate-950 p-3 text-sm text-slate-300">
      <div class="flex items-center justify-between gap-3">
        <span class="font-semibold text-slate-100">{props.event.type}</span>
        <span class="rounded-full border border-slate-700 bg-slate-800 px-2 py-1 text-xs text-slate-200">
          {formatState(props.event.state)}
        </span>
      </div>
      <p class="mt-2">{props.event.message}</p>
      <p class="mt-1 text-xs text-slate-400">
        {formatTimestamp(props.event.createdAt)}
      </p>
    </div>
  );
}

export function OperationsView(props: OperationsViewProps) {
  return (
    <div class="space-y-5">
      <header>
        <h2 class="text-3xl font-semibold text-slate-50">Operations</h2>
        <p class="mt-2 max-w-2xl text-sm text-slate-400">
          A compact operation log that tracks receipts, state progression, and
          emitted events.
        </p>
      </header>
      <div class="grid grid-cols-1 gap-4 xl:grid-cols-[1fr_1fr]">
        <Card>
          <CardContent>
            <h3 class="text-lg font-semibold text-slate-50">Receipts</h3>
            <div class="mt-4 space-y-2">
              <For each={props.receipts ?? []}>
                {(receipt) => <ReceiptCard receipt={receipt} />}
              </For>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent>
            <h3 class="text-lg font-semibold text-slate-50">Events</h3>
            <div class="mt-4 space-y-2">
              <For each={props.events ?? []}>
                {(event) => <EventCard event={event} />}
              </For>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
