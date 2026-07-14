import { For, Show, createSignal } from "solid-js";
import type { ArmoryRedeemRequest, ArmorySnapshot, OperationReceipt } from "@cs-inv-edit/contracts";
import { Alert } from "./ui/Alert.js";
import { Button } from "./ui/Button.js";
import { Card } from "./ui/Card.js";
import { fromAppPromise } from "../lib/result.js";

export function ArmoryView(props: { armory?: ArmorySnapshot; onRefresh: () => Promise<unknown>; onRedeem: (input: ArmoryRedeemRequest) => Promise<OperationReceipt> }) {
  const [confirming, setConfirming] = createSignal<number>();
  const [busy, setBusy] = createSignal(false);
  const ready = () => props.armory?.status === "ready";

  const redeem = async (index: number) => {
    const state = props.armory;
    const offer = state?.offers[index];
    if (!state || !offer || state.status !== "ready") return;
    setBusy(true);
    await fromAppPromise(props.onRedeem({ campaignId: offer.campaignId, redeemId: offer.redeemId, expectedCost: offer.expectedCost, redeemableBalance: state.balance, generationTime: state.generationTime }), "Armory purchase failed").match(
      () => setConfirming(undefined),
      () => undefined,
    );
    setBusy(false);
  };

  return <div class="min-h-0 flex-1 overflow-y-auto">
    <div class="mx-auto flex max-w-6xl flex-col gap-5">
      <div class="flex flex-wrap items-center justify-between gap-3">
        <div><p class="text-xs font-semibold uppercase tracking-[0.28em] text-amber-300">CS2 Armory</p><h1 class="mt-1 text-3xl font-semibold">{ready() ? `${props.armory?.balance ?? 0} stars` : "Armory stars"}</h1><p class="mt-2 text-sm text-slate-400">Balance and offers come from the current Game Coordinator cache.</p></div>
        <Button onClick={() => void props.onRefresh()}>Refresh Armory</Button>
      </div>
      <Show when={props.armory?.status === "requires_connection"}><Alert variant="warning">Connect and refresh inventory before loading Armory state.</Alert></Show>
      <Show when={props.armory?.status === "error"}><Alert variant="danger">{props.armory?.message}</Alert></Show>
      <For each={props.armory?.diagnostics ?? []}>{(line) => <Alert variant="warning">{line}</Alert>}</For>
      <div class="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        <For each={props.armory?.offers ?? []}>{(offer, index) => <Card class="p-5">
          <p class="text-xs uppercase tracking-[0.22em] text-slate-500">GC offer {offer.campaignId}:{offer.redeemId}</p>
          <h2 class="mt-3 text-xl font-semibold">Armory offer</h2>
          <p class="mt-2 text-sm text-slate-400">Live item metadata was not available for this offer, so its raw GC identity is shown.</p>
          <div class="mt-5 flex items-center justify-between"><span class="text-lg font-semibold text-amber-300">{offer.expectedCost} stars</span><Button disabled={!ready() || offer.expectedCost > (props.armory?.balance ?? 0)} onClick={() => setConfirming(index())}>Buy</Button></div>
          <Show when={confirming() === index()}><div class="mt-4 rounded-xl border border-amber-400/30 bg-amber-400/5 p-4"><p class="text-sm text-slate-200">Spend {offer.expectedCost} stars? Your balance will change from {props.armory?.balance} to {(props.armory?.balance ?? 0) - offer.expectedCost}.</p><div class="mt-3 flex gap-2"><Button disabled={busy()} onClick={() => void redeem(index())}>{busy() ? "Sending…" : "Confirm purchase"}</Button><Button disabled={busy()} onClick={() => setConfirming(undefined)}>Cancel</Button></div></div></Show>
        </Card>}</For>
      </div>
      <Show when={ready() && (props.armory?.offers.length ?? 0) === 0}><Alert>No purchasable Armory bid objects are present in the current GC snapshot.</Alert></Show>
    </div>
  </div>;
}
