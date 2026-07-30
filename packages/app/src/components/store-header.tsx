import { Show } from "solid-js";
import type { StoreSnapshot } from "@cs-inv-edit/contracts";
import { Alert } from "./ui/Alert.js";
import { Button } from "./ui/Button.js";
import { LoadingProgress } from "./ui/LoadingProgress.js";

export function StoreHeader(props: {
  store: StoreSnapshot | undefined;
  purchaseEnabled: boolean;
  onRefresh: () => Promise<unknown>;
}) {
  return (
    <>
      <div class="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p class="text-xs font-semibold uppercase tracking-[0.28em] text-cyan-300">
            CS2 Store
          </p>
          <h1 class="mt-1 text-3xl font-semibold">Cash store</h1>
          <p class="mt-2 text-sm text-slate-400">
            Offers and account-local prices come from the CS2 Game Coordinator.
            Payment is completed on Steam.
          </p>
        </div>
        <Button onClick={() => void props.onRefresh()}>Refresh Store</Button>
      </div>
      <Show when={!props.store || props.store.status === "loading"}>
        <LoadingProgress
          active
          title="Loading CS2 Store"
          stages={[
            {
              afterSeconds: 0,
              label: "Requesting the GC price sheet",
              detail: "Loading current offers and account-local currency.",
            },
            {
              afterSeconds: 10,
              label: "Parsing store data",
              detail: "Matching the price sheet with live CS2 metadata.",
            },
          ]}
          currentStage={props.store?.message}
        />
      </Show>
      <Show when={props.store?.status === "requires_connection"}>
        <Alert variant="warning">
          {props.store?.message || "Connect Steam to load the CS2 cash store."}
        </Alert>
      </Show>
      <Show when={props.store?.status === "error"}>
        <Alert variant="danger">{props.store?.message}</Alert>
      </Show>
      <Show when={props.store?.status === "ready" && !props.purchaseEnabled}>
        <Alert variant="warning">
          Browsing is enabled, but purchases are locked. Enable{" "}
          <code>enableStorePurchases</code> in Settings before confirming a
          real-money transaction.
        </Alert>
      </Show>
    </>
  );
}
