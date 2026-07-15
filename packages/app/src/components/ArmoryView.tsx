import { For, Show, createSignal } from "solid-js";
import type { ArmoryRedeemRequest, ArmorySnapshot, OperationReceipt, SettingsData } from "@cs-inv-edit/contracts";
import { Alert } from "./ui/Alert.js";
import { Button } from "./ui/Button.js";
import { Card } from "./ui/Card.js";
import { fromAppPromise } from "../lib/result.js";
import { RevealAnimation, type RevealItem } from "./ui/RevealAnimation.js";
import { Dialog } from "./ui/Dialog.js";
import { sortRelatedItemsByRarity } from "./inventory-view-utils.js";
import { RelatedItemPreview } from "./RelatedItemPreview.js";

export function ArmoryView(props: { armory?: ArmorySnapshot; settings?: SettingsData; onRefresh: () => Promise<unknown>; onRedeem: (input: ArmoryRedeemRequest) => Promise<OperationReceipt> }) {
  const [confirming, setConfirming] = createSignal<number>();
  const [busy, setBusy] = createSignal(false);
  const [reveal, setReveal] = createSignal<{ result: RevealItem; candidates: RevealItem[]; complete: () => void }>();
  const [contentsOffer, setContentsOffer] = createSignal<ArmorySnapshot["offers"][number]>();
  const [quantities, setQuantities] = createSignal<Record<number, number>>({});
  const ready = () => props.armory?.status === "ready";
  // Older/running backends can serialize an uninitialized slice as null even
  // though the frontend contract uses an array. Normalize that wire value once.
  const offers = () => props.armory?.offers ?? [];
  const diagnostics = () => (props.armory?.diagnostics ?? []).filter((line) => line !== "Armory balance loaded, but no purchasable bid objects were present in the GC cache");
  const quantity = (redeemId: number) => quantities()[redeemId] ?? 1;
  const setQuantity = (redeemId: number, value: number, maximum: number) => setQuantities((current) => ({ ...current, [redeemId]: Math.max(1, Math.min(maximum, value)) }));

  const redeem = async (index: number) => {
    const state = props.armory;
    const offer = state?.offers?.[index];
    if (!state || !offer || state.status !== "ready") return;
    setBusy(true);
    const purchaseQuantity = quantity(offer.redeemId);
    await fromAppPromise(props.onRedeem({ campaignId: offer.campaignId, redeemId: offer.redeemId, expectedCost: offer.expectedCost, redeemableBalance: state.balance, generationTime: state.generationTime, quantity: purchaseQuantity }), "Armory purchase failed").match(
      async (receipt) => {
        if (purchaseQuantity === 1 && (props.settings?.animations?.armory ?? "slot-machine") !== "none") {
          const candidates = (offer.items ?? []).map((candidate) => ({ name: candidate.marketName || candidate.name, imageUrl: candidate.imageUrl, rarity: candidate.rarity }));
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
          <div class="mt-5 flex items-center justify-between gap-3"><span class="text-lg font-semibold text-amber-300">{offer.expectedCost * quantity(offer.redeemId)} stars</span><div class="flex items-center gap-2"><Button variant="secondary" disabled={quantity(offer.redeemId) <= 1} onClick={() => setQuantity(offer.redeemId, quantity(offer.redeemId) - 1, Math.floor((props.armory?.balance ?? 0) / offer.expectedCost))}>−</Button><span class="min-w-8 text-center font-mono">{quantity(offer.redeemId)}</span><Button variant="secondary" disabled={quantity(offer.redeemId) >= Math.floor((props.armory?.balance ?? 0) / offer.expectedCost)} onClick={() => setQuantity(offer.redeemId, quantity(offer.redeemId) + 1, Math.floor((props.armory?.balance ?? 0) / offer.expectedCost))}>+</Button><Button disabled={!ready() || offer.expectedCost * quantity(offer.redeemId) > (props.armory?.balance ?? 0)} onClick={() => setConfirming(index())}>Buy</Button></div></div>
          <Show when={ready() && offer.expectedCost > (props.armory?.balance ?? 0)}><p class="mt-2 text-xs text-slate-500">Requires {offer.expectedCost - (props.armory?.balance ?? 0)} more stars.</p></Show>
          <Show when={confirming() === index()}><div class={`mt-4 rounded-xl border p-4 ${quantity(offer.redeemId) > 1 ? "border-red-400/40 bg-red-400/10" : "border-amber-400/30 bg-amber-400/5"}`}><Show when={quantity(offer.redeemId) > 1}><p class="mb-2 font-semibold text-red-200">Bulk purchase warning</p></Show><p class="text-sm text-slate-200">Buy {quantity(offer.redeemId)} for {offer.expectedCost * quantity(offer.redeemId)} stars? Messages will be sent {props.settings?.armoryPurchasePacingSeconds ?? 5} seconds apart. Your balance will change from {props.armory?.balance} to {(props.armory?.balance ?? 0) - offer.expectedCost * quantity(offer.redeemId)}.</p><div class="mt-3 flex gap-2"><Button disabled={busy()} onClick={() => void redeem(index())}>{busy() ? "Sending…" : "Confirm purchase"}</Button><Button disabled={busy()} onClick={() => setConfirming(undefined)}>Cancel</Button></div></div></Show>
        </Card>}</For>
      </div>
      <Show when={ready() && offers().length === 0}><Alert>No universal Armory offers were found in the current live CS2 item schema.</Alert></Show>
    </div>
    <Dialog open={!!contentsOffer()} title={contentsOffer()?.name || "Armory collection"} description="Possible items available from this Armory offer" onOpenChange={(open) => { if (!open) setContentsOffer(undefined); }}>
      <Show when={(contentsOffer()?.items?.length ?? 0) > 0} fallback={<p class="rounded-xl border border-slate-800 bg-slate-900/70 p-4 text-sm text-slate-400">No item contents were found in the current CS2 schema.</p>}>
        <div class="grid gap-2 sm:grid-cols-2">
          <For each={sortRelatedItemsByRarity(contentsOffer()?.items ?? [])}>{(item) => <RelatedItemPreview item={item} context="collection" />}</For>
        </div>
      </Show>
    </Dialog>
  </div>;
}
