import { For, Show, createMemo, createSignal } from "solid-js";
import type { ArmoryRedeemRequest, ArmorySnapshot, OperationReceipt, RelatedItemDto, SettingsData } from "@cs-inv-edit/contracts";
import { Alert } from "./ui/Alert.js";
import { Button } from "./ui/Button.js";
import { Card } from "./ui/Card.js";
import { fromAppPromise } from "../lib/result.js";
import { RevealAnimation, generateRevealMiss, randomRevealCandidate, type RevealItem } from "./ui/RevealAnimation.js";
import { Dialog } from "./ui/Dialog.js";
import { rarityBorderClass, sortRelatedItemsByRarity } from "./inventory-view-utils.js";
import { RelatedItemPreview } from "./RelatedItemPreview.js";
import { LoadingProgress, type LoadingStage } from "./ui/LoadingProgress.js";

const armoryLoadingStages: readonly LoadingStage[] = [
  { afterSeconds: 0, label: "Requesting Armory account state", detail: "Reading the star balance and account generation from the CS2 Game Coordinator." },
  { afterSeconds: 8, label: "Waiting for the Game Coordinator", detail: "CS2 may need several hello retries before returning the current Armory state." },
  { afterSeconds: 18, label: "Building the current offer catalogue", detail: "Parsing the live CS2 schema and matching the active universal Armory offers." },
  { afterSeconds: 35, label: "Resolving offer contents and images", detail: "Loading collection contents, rarity information, and tracked preview images." },
  { afterSeconds: 65, label: "Still working—external metadata is slow", detail: "The request remains active while bounded Steam metadata lookups finish or time out." },
];

function ArmoryOfferPreview(props: { items?: RelatedItemDto[]; offerName: string; onOpen: () => void }) {
  const [activeIndex, setActiveIndex] = createSignal(0);
  const items = createMemo(() => sortRelatedItemsByRarity(props.items ?? []));
  const activeItem = () => items()[activeIndex() % Math.max(items().length, 1)];
  const move = (direction: -1 | 1) => {
    const length = items().length;
    if (length > 0) setActiveIndex((current) => (current + direction + length) % length);
  };

  return <Show when={activeItem()} fallback={
    <button type="button" class="mt-4 flex h-40 w-full items-center justify-center rounded-xl border border-dashed border-slate-700 bg-slate-950/50 text-sm text-slate-500 hover:border-slate-600 hover:text-slate-400" onClick={props.onOpen}>
      Item preview unavailable
    </button>
  }>{(item) =>
    <div class={`relative mt-4 overflow-hidden rounded-xl border-2 bg-slate-950/80 ${rarityBorderClass(item().rarity)}`}>
      <button type="button" class="group block aspect-[3/2] w-full text-left" aria-label={`View possible items in ${props.offerName}`} onClick={props.onOpen}>
        <Show when={item().imageUrl} fallback={<div class="flex h-full items-center justify-center text-4xl font-semibold text-slate-700">{(item().marketName || item().name).slice(0, 2).toUpperCase()}</div>}>
          <img class="h-full w-full object-contain p-4 transition duration-200 group-hover:scale-105" src={item().imageUrl} alt={item().marketName || item().name} loading="lazy" />
        </Show>
        <div class="absolute inset-x-0 bottom-0 bg-gradient-to-t from-slate-950 via-slate-950/90 to-transparent px-4 pb-3 pt-10">
          <p class="truncate text-sm font-semibold text-slate-100">{item().marketName || item().name}</p>
          <Show when={item().rarity}><p class="mt-0.5 text-xs text-slate-400">{item().rarity}</p></Show>
        </div>
      </button>
      <Show when={items().length > 1}>
        <button type="button" class="absolute left-2 top-1/2 flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-full border border-slate-600 bg-slate-950/85 text-lg text-slate-200 hover:bg-slate-800" aria-label="Previous possible item" onClick={() => move(-1)}>‹</button>
        <button type="button" class="absolute right-2 top-1/2 flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-full border border-slate-600 bg-slate-950/85 text-lg text-slate-200 hover:bg-slate-800" aria-label="Next possible item" onClick={() => move(1)}>›</button>
        <div class="absolute right-3 top-3 rounded-full bg-slate-950/80 px-2 py-1 text-xs font-medium text-slate-300">{activeIndex() + 1} / {items().length}</div>
      </Show>
      <div class="h-1 w-full bg-[rgb(var(--rarity-color)/0.9)]" />
    </div>
  }</Show>;
}

function revealCandidates(items: RelatedItemDto[]): RevealItem[] {
  return items.map((candidate) => ({
    name: candidate.marketName || candidate.name,
    imageUrl: candidate.imageUrl,
    rarity: candidate.rarity,
    kind: candidate.kind,
    wear: candidate.paintWear,
    wearMin: candidate.wearMin,
    wearMax: candidate.wearMax,
    supportsStatTrak: candidate.kind === "weapon_skin",
  }));
}

function isContainerOffer(offer: ArmorySnapshot["offers"][number]) {
  return /(?:case|container|capsule|package)/i.test(`${offer.name ?? ""} ${offer.itemName ?? ""} ${offer.category ?? ""}`);
}

export function ArmoryView(props: { armory?: ArmorySnapshot; settings?: SettingsData; onRefresh: () => Promise<unknown>; onMarketPreview: (marketName: string) => Promise<RelatedItemDto | undefined>; onRedeem: (input: ArmoryRedeemRequest) => Promise<OperationReceipt> }) {
  const [confirming, setConfirming] = createSignal<number>();
  const [busy, setBusy] = createSignal(false);
  const [reveal, setReveal] = createSignal<{ result: RevealItem; candidates: RevealItem[]; complete: () => void; mode: NonNullable<SettingsData["animations"]>["armory"]; title: string; immediate?: boolean }>();
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
          const candidates = revealCandidates(offer.items ?? []);
          await new Promise<void>((resolve) => setReveal({ result: { name: receipt.message || offer.name || offer.itemName || `Armory reward ${offer.redeemId}` }, candidates, complete: resolve, mode: props.settings?.animations?.armory ?? "slot-machine", title: "Armory purchase" }));
        }
        setConfirming(undefined);
      },
      () => undefined,
    );
    setBusy(false);
  };

  const previewOpen = (offer: ArmorySnapshot["offers"][number]) => {
    const candidates = revealCandidates(offer.items ?? []);
    if (candidates.length === 0) return;
    const mode = isContainerOffer(offer) ? (props.settings?.animations?.container ?? "slot-machine") : (props.settings?.animations?.armory ?? "slot-machine");
    const fallback = candidates[0]!;
    const result = generateRevealMiss(randomRevealCandidate(candidates, fallback));
    setReveal({ result, candidates, complete: () => undefined, mode, immediate: mode === "none", title: `Preview opening · ${offer.name || offer.itemName || "Armory reward"}` });
  };

  return <div class="min-h-0 flex-1 overflow-y-auto">
    <RevealAnimation open={!!reveal()} mode={reveal()?.mode ?? "none"} immediate={reveal()?.immediate} title={reveal()?.title ?? "Armory preview"} candidates={reveal()?.candidates ?? []} result={reveal()?.result ?? { name: "Armory reward" }} onComplete={() => { const current = reveal(); setReveal(undefined); current?.complete(); }} />
    <div class="flex w-full flex-col gap-5">
      <div class="flex flex-wrap items-center justify-between gap-3">
        <div><p class="text-xs font-semibold uppercase tracking-[0.28em] text-amber-300">CS2 Armory</p><h1 class="mt-1 text-3xl font-semibold">{ready() ? `${props.armory?.balance ?? 0} stars` : "Armory stars"}</h1><p class="mt-2 text-sm text-slate-400">Star balance comes from the GC; offers come from the current live CS2 item schema.</p></div>
        <Button onClick={() => void props.onRefresh()}>Refresh Armory</Button>
      </div>
      <Show when={!props.armory || props.armory.status === "loading"}>
        <div class="flex justify-center rounded-2xl border border-slate-800/80 bg-slate-900/40 p-4">
          <LoadingProgress active={!props.armory || props.armory.status === "loading"} title="Loading CS2 Armory" stages={armoryLoadingStages} currentStage={props.armory?.message} />
        </div>
      </Show>
      <Show when={props.armory?.status === "requires_connection"}><Alert variant="warning">Connect and refresh inventory before loading Armory state.</Alert></Show>
      <Show when={props.armory?.status === "error"}><Alert variant="danger">{props.armory?.message}</Alert></Show>
      <For each={diagnostics()}>{(line) => <Alert variant="warning">{line}</Alert>}</For>
      <div class="grid w-full gap-4 md:grid-cols-2 2xl:grid-cols-3">
        <For each={offers()}>{(offer, index) => <Card class="flex min-w-0 flex-col p-5">
          <button type="button" class="text-left text-xl font-semibold text-cyan-300 underline decoration-cyan-500/50 underline-offset-4 hover:text-cyan-200" onClick={() => setContentsOffer(offer)}>{offer.name || "Armory reward"}</button>
          <ArmoryOfferPreview items={offer.items} offerName={offer.name || "Armory reward"} onOpen={() => setContentsOffer(offer)} />
          <Show when={(offer.items?.length ?? 0) > 0}>
            <Button class="mt-4 w-full" variant="secondary" onClick={() => previewOpen(offer)}>
              Preview open
            </Button>
          </Show>
          <div class="mt-auto flex flex-wrap items-center justify-between gap-3 pt-5"><span class="text-lg font-semibold text-amber-300">{offer.expectedCost * quantity(offer.redeemId)} stars</span><div class="flex items-center gap-2"><Button variant="secondary" disabled={quantity(offer.redeemId) <= 1} onClick={() => setQuantity(offer.redeemId, quantity(offer.redeemId) - 1, Math.floor((props.armory?.balance ?? 0) / offer.expectedCost))}>−</Button><span class="min-w-8 text-center font-mono">{quantity(offer.redeemId)}</span><Button variant="secondary" disabled={quantity(offer.redeemId) >= Math.floor((props.armory?.balance ?? 0) / offer.expectedCost)} onClick={() => setQuantity(offer.redeemId, quantity(offer.redeemId) + 1, Math.floor((props.armory?.balance ?? 0) / offer.expectedCost))}>+</Button><Button disabled={!ready() || offer.expectedCost * quantity(offer.redeemId) > (props.armory?.balance ?? 0)} onClick={() => setConfirming(index())}>Buy</Button></div></div>
          <Show when={ready() && offer.expectedCost > (props.armory?.balance ?? 0)}><p class="mt-2 text-xs text-slate-500">Requires {offer.expectedCost - (props.armory?.balance ?? 0)} more stars.</p></Show>
          <Show when={confirming() === index()}><div class={`mt-4 rounded-xl border p-4 ${quantity(offer.redeemId) > 1 ? "border-red-400/40 bg-red-400/10" : "border-amber-400/30 bg-amber-400/5"}`}><Show when={quantity(offer.redeemId) > 1}><p class="mb-2 font-semibold text-red-200">Bulk purchase warning</p></Show><p class="text-sm text-slate-200">Buy {quantity(offer.redeemId)} for {offer.expectedCost * quantity(offer.redeemId)} stars? Messages will be sent {props.settings?.armoryPurchasePacingSeconds ?? 5} seconds apart. Your balance will change from {props.armory?.balance} to {(props.armory?.balance ?? 0) - offer.expectedCost * quantity(offer.redeemId)}.</p><div class="mt-3 flex gap-2"><Button disabled={busy()} onClick={() => void redeem(index())}>{busy() ? "Sending…" : "Confirm purchase"}</Button><Button disabled={busy()} onClick={() => setConfirming(undefined)}>Cancel</Button></div></div></Show>
        </Card>}</For>
      </div>
      <Show when={ready() && offers().length === 0}><Alert>No universal Armory offers were found in the current live CS2 item schema.</Alert></Show>
    </div>
    <Dialog open={!!contentsOffer()} title={contentsOffer()?.name || "Armory collection"} description="Possible items available from this Armory offer" onOpenChange={(open) => { if (!open) setContentsOffer(undefined); }}>
      <Show when={(contentsOffer()?.items?.length ?? 0) > 0} fallback={<p class="rounded-xl border border-slate-800 bg-slate-900/70 p-4 text-sm text-slate-400">No item contents were found in the current CS2 schema.</p>}>
        <div class="grid gap-2 sm:grid-cols-2">
          <For each={sortRelatedItemsByRarity(contentsOffer()?.items ?? [])}>{(item) => <RelatedItemPreview item={item} context="collection" onRequestMarketPreview={props.onMarketPreview} />}</For>
        </div>
      </Show>
    </Dialog>
  </div>;
}
