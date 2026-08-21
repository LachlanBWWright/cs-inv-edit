import { For, Show } from "solid-js";
import type { PurchaseSession, StoreSnapshot } from "@cs-inv-edit/contracts";

type StoreOffer = StoreSnapshot["offers"][number];

export function PurchaseFailureCode(props: { session: PurchaseSession }) {
  return (
    <p class="mb-1 font-semibold">
      {props.session.errorCode}{" "}
      <Show when={props.session.errorResult !== undefined}>
        (GC purchase result {props.session.errorResult})
      </Show>
    </p>
  );
}

export function CheckoutLink(props: { url: string }) {
  return (
    <a
      class="mt-3 inline-flex rounded-lg bg-cyan-400 px-4 py-2 font-semibold text-slate-950 hover:bg-cyan-300"
      href={props.url}
      target="_blank"
      rel="noopener noreferrer"
    >
      Review and authorize on Steam
    </a>
  );
}

export function PurchaseRequestSummary(props: {
  selected?: StoreOffer;
  quantity: (offerId: string) => number;
}) {
  const quantity = () =>
    props.selected ? props.quantity(props.selected.id) : 1;
  const total = () => {
    if (!props.selected) return "";
    const unitPrice =
      props.selected.saleAmountMinor ?? props.selected.amountMinor ?? 0;
    return `${props.selected.currency} ${((unitPrice * quantity()) / 100).toFixed(2)}`;
  };
  return (
    <p>
      ✓ Sent a request to purchase <strong>{props.selected?.name}</strong> ×{" "}
      {quantity()} for <strong>{total()}</strong>.
    </p>
  );
}

export function ProtocolTraceLines(props: { lines: string[] }) {
  return <For each={props.lines}>{(line) => <div>{line}</div>}</For>;
}

export function SteamTransactionLine(props: { transactionId: string }) {
  return (
    <p>
      Steam transaction: <span class="font-mono">{props.transactionId}</span>
    </p>
  );
}

export function PurchaseActivityLine(props: {
  kind: "waiting" | "accepted" | "authorization-failed" | "authorized";
  gameName: string;
}) {
  if (props.kind === "waiting")
    return (
      <p class="text-cyan-300">
        … Waiting for the {props.gameName} Game Coordinator.
      </p>
    );
  if (props.kind === "accepted")
    return (
      <p class="text-emerald-300">
        ✓ The {props.gameName} Game Coordinator accepted the purchase request
        and created an order.
      </p>
    );
  if (props.kind === "authorization-failed")
    return (
      <p class="text-red-300">
        ✕ Steam did not send the authorization message needed to create the
        confirmation link.
      </p>
    );
  return (
    <p class="text-emerald-300">
      ✓ Steam returned the authorization transaction.
    </p>
  );
}
