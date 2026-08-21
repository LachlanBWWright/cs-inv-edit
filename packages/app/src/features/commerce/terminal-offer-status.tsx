import { Show, type Accessor } from "solid-js";
import type { PurchaseSession } from "@cs-inv-edit/contracts";

export function TerminalOfferStatus(props: {
  session: Accessor<PurchaseSession | undefined>;
  message: Accessor<string>;
  containerMessage?: string;
}) {
  return (
    <>
      <Show when={props.session()?.checkoutUrl}>
        {(checkoutUrl) => (
          <div class="mt-3 rounded-xl border border-emerald-500/40 bg-emerald-950 p-3">
            <p class="font-semibold text-xs text-emerald-200">
              Steam Microtransaction Link Ready
            </p>
            <p class="mt-1 text-xs text-slate-300">
              Click below to finalize and approve this purchase on Steam:
            </p>
            <a
              class="mt-2 inline-block rounded-lg bg-emerald-600 px-4 py-2 text-xs font-semibold text-white hover:bg-emerald-500"
              href={checkoutUrl()}
              target="_blank"
              rel="noopener noreferrer"
            >
              Open Steam Checkout ↗
            </a>
          </div>
        )}
      </Show>
      <Show when={props.message()}>
        <p class="mt-2 text-xs text-slate-300">{props.message()}</p>
      </Show>
      <Show when={props.containerMessage}>
        <p class="mt-2 text-xs text-slate-300">{props.containerMessage}</p>
      </Show>
    </>
  );
}
