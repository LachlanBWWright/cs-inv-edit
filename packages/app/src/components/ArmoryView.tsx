import { For, Show, createSignal } from "solid-js";
import type { ArmoryRedeemRequest, ArmorySnapshot, OperationReceipt, SettingsData } from "@cs-inv-edit/contracts";
import { Alert } from "./ui/Alert.js";
import { Button } from "./ui/Button.js";
import { Card } from "./ui/Card.js";
import { fromAppPromise } from "../lib/result.js";
import { RevealAnimation, type RevealItem } from "./ui/RevealAnimation.js";
import { Dialog } from "./ui/Dialog.js";
import { rarityBorderClass } from "./inventory-view-utils.js";

export function ArmoryView(props: { armory?: ArmorySnapshot; settings?: SettingsData; onRefresh: () => Promise<unknown>; onRedeem: (input: ArmoryRedeemRequest) => Promise<OperationReceipt> }) {
  const [confirming, setConfirming] = createSignal<number>();
  const [busy, setBusy] = createSignal(false);
  const [reveal, setReveal] = createSignal<{ result: RevealItem; candidates: RevealItem[]; complete: () => void }>();
  const [contentsOffer, setContentsOffer] = createSignal<ArmorySnapshot["offers"][number]>();
  const ready = () => props.armory?.status === "ready";
  // Older/running backends can serialize an uninitialized slice as null even
  // though the frontend contract uses an array. Normalize that wire value once.
  const offers = () => props.armory?.offers ?? [];
  const diagnostics = () => (props.armory?.diagnostics ?? []).filter((line) => line !== "Armory balance loaded, but no purchasable bid objects were present in the GC cache");

  const redeem = async (index: number) => {
    const state = props.armory;
    const offer = state?.offers?.[index];
    if (!state || !offer || state.status !== "ready") return;
    setBusy(true);
    await fromAppPromise(props.onRedeem({ campaignId: offer.campaignId, redeemId: offer.redeemId, expectedCost: offer.expectedCost, redeemableBalance: state.balance, generationTime: state.generationTime }), "Armory purchase failed").match(
      async (receipt) => {
        if ((props.settings?.animations?.armory ?? "slot-machine") !== "none") {
          const candidates = offers().map((candidate) => ({ name: candidate.name || candidate.itemName || `Armory offer ${candidate.redeemId}` }));
          await new Promise<void>((resolve) => setReveal({ result: { name: receipt.message || offer.name || offer.itemName || `Armory reward ${offer.redeemId}` }, candidates, complete: resolve }));
        }
        setConfirming(undefined);
      },
      () => undefined,
    );
    setBusy(false);
  };

  return <div class="min-h-0 flex-1 overflow-y-auto">
    <RevealAnimation open={!!reveal()} mode={props.settings?.animations?.armory ?? "slot-machine"} title="Armory purchase" candidates={reveal()?.candidates ?? []} result={reveal()?.result ?? { name: "Armory reward" }} onComplete={() => { const current = reveal(); setReveal(undefined); current?.complete(); }} />
    <div class="mx-auto flex max-w-6xl flex-col gap-5">
      <div class="flex flex-wrap items-center justify-between gap-3">
        <div><p class="text-xs font-semibold uppercase tracking-[0.28em] text-amber-300">CS2 Armory</p><h1 class="mt-1 text-3xl font-semibold">{ready() ? `${props.armory?.balance ?? 0} stars` : "Armory stars"}</h1><p class="mt-2 text-sm text-slate-400">Star balance comes from the GC; offers come from the current live CS2 item schema.</p></div>
        <Button onClick={() => void props.onRefresh()}>Refresh Armory</Button>
      </div>
      <Show when={props.armory?.status === "requires_connection"}><Alert variant="warning">Connect and refresh inventory before loading Armory state.</Alert></Show>
      <Show when={props.armory?.status === "error"}><Alert variant="danger">{props.armory?.message}</Alert></Show>
      <For each={diagnostics()}>{(line) => <Alert variant="warning">{line}</Alert>}</For>
      <div class="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        <For each={offers()}>{(offer, index) => <Card class="p-5">
          <button type="button" class="text-left text-xl font-semibold text-cyan-300 underline decoration-cyan-500/50 underline-offset-4 hover:text-cyan-200" onClick={() => setContentsOffer(offer)}>{offer.name || "Armory reward"}</button>
          <div class="mt-5 flex items-center justify-between"><span class="text-lg font-semibold text-amber-300">{offer.expectedCost} stars</span><Button disabled={!ready() || offer.expectedCost > (props.armory?.balance ?? 0)} onClick={() => setConfirming(index())}>Buy</Button></div>
          <Show when={ready() && offer.expectedCost > (props.armory?.balance ?? 0)}><p class="mt-2 text-xs text-slate-500">Requires {offer.expectedCost - (props.armory?.balance ?? 0)} more stars.</p></Show>
          <Show when={confirming() === index()}><div class="mt-4 rounded-xl border border-amber-400/30 bg-amber-400/5 p-4"><p class="text-sm text-slate-200">Spend {offer.expectedCost} stars? Your balance will change from {props.armory?.balance} to {(props.armory?.balance ?? 0) - offer.expectedCost}.</p><div class="mt-3 flex gap-2"><Button disabled={busy()} onClick={() => void redeem(index())}>{busy() ? "Sending…" : "Confirm purchase"}</Button><Button disabled={busy()} onClick={() => setConfirming(undefined)}>Cancel</Button></div></div></Show>
        </Card>}</For>
      </div>
      <Show when={ready() && offers().length === 0}><Alert>No universal Armory offers were found in the current live CS2 item schema.</Alert></Show>
    </div>
    <Dialog open={!!contentsOffer()} title={contentsOffer()?.name || "Armory collection"} description="Possible items available from this Armory offer" onOpenChange={(open) => { if (!open) setContentsOffer(undefined); }}>
      <Show when={(contentsOffer()?.items?.length ?? 0) > 0} fallback={<p class="rounded-xl border border-slate-800 bg-slate-900/70 p-4 text-sm text-slate-400">No item contents were found in the current CS2 schema.</p>}>
        <div class="grid gap-2 sm:grid-cols-2">
          <For each={contentsOffer()?.items ?? []}>{(item) => <div class={`rounded-xl border-2 bg-slate-900/80 p-3 ${rarityBorderClass(item.rarity)}`}><p class="font-medium text-slate-100">{item.marketName || item.name}</p></div>}</For>
        </div>
      </Show>
    </Dialog>
  </div>;
}
