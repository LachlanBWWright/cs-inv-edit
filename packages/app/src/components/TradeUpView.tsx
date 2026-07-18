import { createMemo, createSignal, For, Show } from "solid-js";
import type { InventoryItemDto, InventorySnapshot, OperationReceipt, SettingsData } from "@cs-inv-edit/contracts";
import { rarityBorderClass } from "./inventory-view-utils.js";
import { calculateTradeUpOutcomes, compatibleTradeUpItem, effectiveFloat, resolveTradeUpLocally, tradeUpInputCount, type TradeUpResolver } from "./trade-up-utils.js";
import { TradeUpContractReveal } from "./ui/TradeUpContractReveal.js";
import { RevealAnimation, type RevealItem } from "./ui/RevealAnimation.js";
import { appErrorMessage, fromAppPromise } from "../lib/result.js";

export interface TradeUpViewProps {
  inventory: InventorySnapshot | undefined;
  onSubmit: (type: string, input?: unknown) => Promise<OperationReceipt>;
  settings: SettingsData | undefined;
  /** Injection point for a future GC-backed resolver. Omit to use the local preview simulator. */
  resolveTradeUp?: TradeUpResolver;
}

const formatFloat = (value: number) => value.toFixed(6);
const displayName = (item: { name: string; marketName?: string }) => item.marketName || item.name;

export function TradeUpView(props: TradeUpViewProps) {
  const [selectedIds, setSelectedIds] = createSignal<string[]>([]);
  const [preview, setPreview] = createSignal<{ result: RevealItem; candidates: RevealItem[] }>();
  const [previewStatus, setPreviewStatus] = createSignal("");
  const inventoryItems = createMemo(() => props.inventory?.items ?? []);
  const selectedItems = createMemo(() => selectedIds().flatMap((id) => {
    const match = inventoryItems().find((item) => item.id === id);
    return match ? [match] : [];
  }));
  const firstItem = createMemo(() => selectedItems()[0]);
  const requiredCount = createMemo(() => firstItem() ? tradeUpInputCount(firstItem()!) : 10);
  const eligibleItems = createMemo(() => inventoryItems().filter((item) =>
    item.kind === "weapon_skin" && item.paintWear !== undefined && (item.tradeUpItems?.length ?? 0) > 0));
  const averageFloat = createMemo(() => selectedItems().length
    ? selectedItems().reduce((sum, item) => sum + (item.paintWear ?? 0), 0) / selectedItems().length : 0);
  const averageEffective = createMemo(() => selectedItems().length
    ? selectedItems().reduce((sum, item) => sum + effectiveFloat(item), 0) / selectedItems().length : 0);
  const outcomes = createMemo(() => calculateTradeUpOutcomes(selectedItems()));
  const playPreview = async () => {
    const available = outcomes();
    if (available.length === 0) return;
    const request = { itemIds: selectedIds(), outcomes: available };
    const resolver: TradeUpResolver = props.resolveTradeUp
      ?? ((next) => Promise.resolve(resolveTradeUpLocally(next)!));
    setPreviewStatus("Resolving contract…");
    await fromAppPromise(resolver(request), "Trade-up resolution failed").match((picked) => {
      setPreviewStatus("");
      const mode = props.settings?.animations?.tradeUp ?? "slot-machine";
      if (mode === "none") return;
    const toRevealItem = (outcome: typeof picked): RevealItem => ({ name: displayName(outcome), imageUrl: outcome.imageUrl, rarity: outcome.rarity, kind: outcome.kind, wear: outcome.predictedWear, wearMin: outcome.wearMin, wearMax: outcome.wearMax });
    setPreview({ result: toRevealItem(picked), candidates: available.map(toRevealItem) });
    }, (error) => setPreviewStatus(appErrorMessage(error, "Trade-up resolution failed")));
  };

  const canSelect = (item: InventoryItemDto) => {
    const first = firstItem();
    return selectedIds().includes(item.id)
      || (!first || (compatibleTradeUpItem(first, item) && selectedIds().length < requiredCount()));
  };

  const toggleSelection = (item: InventoryItemDto) => {
    if (!canSelect(item)) return;
    setSelectedIds((current) => current.includes(item.id)
      ? current.filter((id) => id !== item.id)
      : [...current, item.id]);
  };

  return (
    <div class="space-y-5">
      <Show when={(props.settings?.animations?.tradeUp ?? "slot-machine").startsWith("contract-")} fallback={<RevealAnimation open={!!preview()} mode={(props.settings?.animations?.tradeUp ?? "slot-machine") as "none" | "countdown" | "slot-machine"} title="Trade-up preview" candidates={preview()?.candidates ?? []} result={preview()?.result ?? { name: "Trade-up result" }} onComplete={() => setPreview(undefined)} />}>
        <TradeUpContractReveal open={!!preview()} mode={props.settings?.animations?.tradeUp ?? "contract-slot-machine"} candidates={preview()?.candidates ?? []} result={preview()?.result ?? { name: "Trade-up result" }} onComplete={() => setPreview(undefined)} />
      </Show>
      <header>
        <h2 class="text-3xl font-semibold text-slate-100">Trade-up planner</h2>
        <p class="mt-2 max-w-3xl text-sm text-slate-400">Build a contract from your inventory and preview wear and odds locally. This planner does not contact the Game Coordinator or execute a trade-up.</p>
      </header>

      <section class="rounded-2xl border border-slate-800 bg-slate-900/80 p-4 shadow-sm">
        <div class="flex flex-wrap items-end justify-between gap-4">
          <div>
            <p class="text-xs font-medium uppercase tracking-wide text-slate-500">Contract progress</p>
            <p class="mt-1 text-xl font-semibold text-slate-100">{selectedItems().length} / {requiredCount()} items</p>
            <Show when={firstItem()}><p class="mt-1 text-xs text-slate-400">{firstItem()!.rarity} · {firstItem()!.isStatTrak ? "StatTrak™" : "Regular"}{requiredCount() === 5 ? " · knife/glove contract" : ""}</p></Show>
          </div>
          <Show when={selectedItems().length > 0}><button type="button" class="rounded-md border border-slate-700 px-3 py-2 text-sm text-slate-300 hover:border-cyan-400/40" onClick={() => setSelectedIds([])}>Clear contract</button></Show>
        </div>
        <div class="mt-4 grid gap-3 sm:grid-cols-2">
          <div class="rounded-xl border border-slate-800 bg-slate-950/70 p-3"><p class="text-xs uppercase tracking-wide text-slate-500">Average raw float</p><p class="mt-1 font-mono text-lg text-slate-100">{selectedItems().length ? formatFloat(averageFloat()) : "—"}</p></div>
          <div class="rounded-xl border border-slate-800 bg-slate-950/70 p-3"><p class="text-xs uppercase tracking-wide text-slate-500">Average effective float</p><p class="mt-1 font-mono text-lg text-cyan-300">{selectedItems().length ? formatFloat(averageEffective()) : "—"}</p><p class="mt-1 text-xs text-slate-500">Each float normalized within its finish’s wear caps.</p></div>
        </div>
      </section>

      <Show when={selectedItems().length > 0}>
        <section>
          <h3 class="text-lg font-semibold text-slate-100">Selected inputs</h3>
          <div class="mt-3 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            <For each={selectedItems()}>{(item, index) => <article class={`rounded-xl border-2 bg-slate-900/80 p-3 ${rarityBorderClass(item.rarity)}`}>
              <div class="flex items-start justify-between gap-2"><p class="min-w-0 truncate font-medium text-slate-100">{index() + 1}. {displayName(item)}</p><button type="button" class="text-xs text-slate-400 hover:text-rose-300" onClick={() => toggleSelection(item)}>Remove</button></div>
              <div class="mt-3 grid grid-cols-2 gap-2 text-xs"><div><p class="text-slate-500">Float</p><p class="font-mono text-slate-200">{formatFloat(item.paintWear!)}</p></div><div><p class="text-slate-500">Effective</p><p class="font-mono text-cyan-300">{formatFloat(effectiveFloat(item))}</p></div></div>
              <p class="mt-2 text-xs text-slate-500">Caps {formatFloat(item.paintWearMin ?? 0)}–{formatFloat(item.paintWearMax ?? 1)} · {item.collection ?? "Unknown collection"}</p>
            </article>}</For>
          </div>
        </section>
      </Show>

      <section>
        <h3 class="text-lg font-semibold text-slate-100">Eligible inventory</h3>
        <p class="mt-1 text-sm text-slate-400">Your first pick locks rarity and StatTrak™ type for the contract.</p>
        <Show when={eligibleItems().length > 0} fallback={<div class="mt-3 rounded-xl border border-dashed border-slate-700 p-6 text-sm text-slate-400">No trade-up eligible skins with float and outcome metadata were found.</div>}>
          <div class="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
            <For each={eligibleItems()}>{(item) => {
              const selected = () => selectedIds().includes(item.id);
              return <button type="button" disabled={!canSelect(item)} class={`text-left rounded-2xl border-2 p-4 transition ${rarityBorderClass(item.rarity)} ${selected() ? "bg-cyan-500/10 ring-1 ring-cyan-400/40" : "bg-slate-900/80 hover:bg-slate-800/90"} disabled:cursor-not-allowed disabled:opacity-35`} onClick={() => toggleSelection(item)}>
                <div class="flex items-start gap-3"><Show when={item.imageUrl}><img class="h-14 w-20 shrink-0 rounded bg-slate-950 object-contain" src={item.imageUrl} alt="" loading="lazy" /></Show><div class="min-w-0"><strong class="block truncate text-slate-100">{displayName(item)}</strong><p class="mt-1 text-xs text-slate-400">{item.rarity} · {item.collection ?? "Unknown collection"}</p></div></div>
                <div class="mt-3 flex justify-between text-xs"><span class="font-mono text-slate-300">Float {formatFloat(item.paintWear!)}</span><span class="font-mono text-cyan-300">Effective {formatFloat(effectiveFloat(item))}</span></div>
              </button>;
            }}</For>
          </div>
        </Show>
      </section>

      <Show when={selectedItems().length === requiredCount()}>
        <section class="rounded-2xl border border-cyan-500/25 bg-cyan-950/10 p-4">
          <h3 class="text-lg font-semibold text-slate-100">Possible outcomes</h3>
          <div class="flex flex-wrap items-start justify-between gap-3"><div><p class="mt-1 text-sm text-slate-400">Each collection receives odds in proportion to its input count; outcomes within that collection split its share evenly.</p><Show when={previewStatus()}><p class="mt-2 text-xs text-amber-300">{previewStatus()}</p></Show></div><button type="button" class="rounded-md border border-cyan-500/40 bg-cyan-600/80 px-3 py-2 text-sm font-medium text-white hover:bg-cyan-500" onClick={() => void playPreview()}>Preview contract animation</button></div>
          <div class="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            <For each={outcomes()}>{(outcome) => <article class={`rounded-xl border-2 bg-slate-950/70 p-3 ${rarityBorderClass(outcome.rarity)}`}>
              <div class="flex gap-3"><Show when={outcome.imageUrl}><img class="h-16 w-20 shrink-0 rounded bg-slate-900 object-contain" src={outcome.imageUrl} alt="" loading="lazy" /></Show><div class="min-w-0"><p class="font-medium text-slate-100">{displayName(outcome)}</p><p class="mt-1 text-xl font-semibold text-cyan-300">{(outcome.probability * 100).toFixed(2)}%</p></div></div>
              <div class="mt-3 grid grid-cols-2 gap-2 text-xs"><div><p class="text-slate-500">Predicted wear</p><p class="font-mono text-slate-200">{formatFloat(outcome.predictedWear)}</p></div><div><p class="text-slate-500">Output caps</p><p class="font-mono text-slate-200">{formatFloat(outcome.wearMin ?? 0)}–{formatFloat(outcome.wearMax ?? 1)}</p></div></div>
            </article>}</For>
          </div>
        </section>
      </Show>
    </div>
  );
}
