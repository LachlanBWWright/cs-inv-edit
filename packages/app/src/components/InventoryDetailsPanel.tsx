import { For, Show, createEffect, createSignal } from "solid-js";
import type { InventoryItemDto, RelatedItemDto } from "@cs-inv-edit/contracts";
import { Button } from "./ui/Button.js";
import { Input } from "./ui/Input.js";
import { Select } from "./ui/Select.js";
import { Dialog } from "./ui/Dialog.js";
import { itemDisplayName, itemInitials, itemKindLabel, itemSubtitle, rarityBorderClass, sortRelatedItemsByRarity } from "./inventory-view-utils.js";
import { ItemInstanceDecorations } from "./ItemInstanceDecorations.js";
import { formatFloat } from "./item-instance-utils.js";
import { RelatedItemPreview, type RelatedItemPreviewContext } from "./RelatedItemPreview.js";
import { containerItemOdds } from "./related-item-preview-utils.js";

function ItemIcon(props: { item: InventoryItemDto; large?: boolean }) {
  const boxClass = () =>
    props.large
      ? "mt-3 flex h-32 w-full items-center justify-center rounded bg-slate-950 text-xl font-semibold text-slate-600"
      : "flex h-16 w-20 shrink-0 items-center justify-center rounded bg-slate-950 text-sm font-semibold text-slate-600";
  const imageClass = () =>
    props.large
      ? "mt-3 h-32 w-full rounded bg-slate-950 object-contain"
      : "h-16 w-20 shrink-0 rounded bg-slate-950 object-contain";

  return (
    <Show when={props.item.imageUrl} fallback={<div class={boxClass()}>{itemInitials(props.item)}</div>}>
      <img class={imageClass()} src={props.item.imageUrl} alt={itemDisplayName(props.item)} loading="lazy" />
    </Show>
  );
}

const wearRanges = [
  { name: "Factory New", short: "FN", min: 0, max: 0.07, color: "wear-color-factory-new" },
  { name: "Minimal Wear", short: "MW", min: 0.07, max: 0.15, color: "wear-color-minimal-wear" },
  { name: "Field-Tested", short: "FT", min: 0.15, max: 0.38, color: "wear-color-field-tested" },
  { name: "Well-Worn", short: "WW", min: 0.38, max: 0.45, color: "wear-color-well-worn" },
  { name: "Battle-Scarred", short: "BS", min: 0.45, max: 1, color: "wear-color-battle-scarred" },
] as const;

function WearRangeBar(props: { wear: number; min?: number; max?: number }) {
  const clamp = (value: number) => Math.max(0, Math.min(1, value));
  const wear = () => clamp(props.wear);
  const min = () => clamp(props.min ?? 0);
  const max = () => clamp(props.max ?? 1);

  return (
    <div class="rounded-2xl border border-slate-800/80 bg-slate-900/70 p-4">
      <div class="flex items-baseline justify-between gap-3">
        <p class="text-xs font-medium uppercase tracking-wide text-slate-400">Finish wear range</p>
        <p class="font-mono text-xs text-slate-300">{formatFloat(props.wear)}</p>
      </div>
      <div class="relative mt-7">
        <div class="absolute -top-5 -translate-x-1/2 text-cyan-200" style={{ left: `${wear() * 100}%` }} aria-label={`Current wear ${formatFloat(props.wear)}`}>
          <span class="block text-center text-sm leading-none">▼</span>
        </div>
        <div class="relative flex h-4 overflow-hidden rounded border border-slate-700">
          <For each={wearRanges}>{(range) => (
            <div class={`${range.color} border-r border-slate-950/40 last:border-r-0`} style={{ width: `${(range.max - range.min) * 100}%` }} title={`${range.name}: ${range.min.toFixed(2)}–${range.max.toFixed(2)}`} />
          )}</For>
          <Show when={min() > 0}><div class="wear-color-impossible absolute inset-y-0 left-0" style={{ width: `${min() * 100}%` }} title={`Impossible below ${min().toFixed(2)}`} /></Show>
          <Show when={max() < 1}><div class="wear-color-impossible absolute inset-y-0 right-0" style={{ width: `${(1 - max()) * 100}%` }} title={`Impossible above ${max().toFixed(2)}`} /></Show>
        </div>
        <div class="mt-2 flex text-[9px] font-medium text-slate-400">
          <For each={wearRanges}>{(range) => (
            <div class="text-center" style={{ width: `${(range.max - range.min) * 100}%` }} title={range.name}>{range.short}</div>
          )}</For>
        </div>
        <div class="mt-1 flex justify-between font-mono text-[9px] text-slate-500"><span>0.00</span><span>1.00</span></div>
        <Show when={min() > 0 || max() < 1}>
          <p class="mt-2 text-xs text-slate-500">This finish can only exist from {min().toFixed(2)} to {max().toFixed(2)}; grey regions are impossible.</p>
        </Show>
      </div>
    </div>
  );
}

function steamMarketURL(marketName: string) {
  return `https://steamcommunity.com/market/listings/730/${encodeURIComponent(marketName)}`;
}

function tradeUpInputCount(item: InventoryItemDto) {
  const covert = ["ancient", "covert", "extraordinary", "master"].includes((item.rarity ?? "").toLowerCase());
  return covert ? 5 : 10;
}

export interface InventoryDetailsPanelProps {
  selectedItem: InventoryItemDto | undefined;
  pending: boolean;
  renameOpen: boolean;
  draftName: string;
  selectedToolId: string;
  inventoryDebugEnabled: boolean;
  nameTagTools: InventoryItemDto[];
  canOpenContainer: boolean;
  canUseNameTagOn: boolean;
  containerStatusMessage: string;
  onOpenRenameEditor: (item: InventoryItemDto) => void;
  onRenameSubmit: () => Promise<void> | void;
  onRemoveName: () => Promise<void> | void;
  onOpenContainer: () => Promise<void> | void;
  onMarketPreview: (marketName: string) => Promise<RelatedItemDto | undefined>;
  onCloseRename: () => void;
  onDraftNameChange: (value: string) => void;
  onSelectedToolChange: (value: string) => void;
}

export function InventoryDetailsPanel(props: InventoryDetailsPanelProps) {
  const [contentsDialog, setContentsDialog] = createSignal<{ title: string; description: string; items: RelatedItemDto[]; context: RelatedItemPreviewContext }>();
  const [selectedMarketPreview, setSelectedMarketPreview] = createSignal<RelatedItemDto>();
  const [selectedMarketLoading, setSelectedMarketLoading] = createSignal(false);
  let requestedMarketName = "";
  createEffect(() => {
    const selected = props.selectedItem;
    const marketName = selected?.marketName ?? "";
    if (!marketName || selected?.marketPrice || requestedMarketName === marketName) return;
    requestedMarketName = marketName;
    setSelectedMarketPreview(undefined);
    setSelectedMarketLoading(true);
    void props.onMarketPreview(marketName).then((preview) => {
      if (requestedMarketName === marketName) {
        setSelectedMarketPreview(preview);
        setSelectedMarketLoading(false);
      }
    });
  });
  const contentsOdds = () => containerItemOdds(contentsDialog()?.items ?? []);

  return (
    <>
    <div class="flex h-full min-h-0 flex-col overflow-hidden rounded-2xl border border-slate-800/80 bg-slate-950/70 p-4">
      <div class="min-h-0 flex-1 overflow-y-auto">
        <Show keyed when={props.selectedItem} fallback={<p class="text-sm text-slate-400">No item selected.</p>}>
          {(selected) => (
            <div class="space-y-4">
              <div>
                <ItemIcon item={selected} large />
                <h3 class="mt-3 text-xl font-semibold text-slate-50">{itemDisplayName(selected)}</h3>
                <Show when={itemSubtitle(selected)}>
                  <p class="mt-1 text-sm text-slate-400">{itemSubtitle(selected)}</p>
                </Show>
                <ItemInstanceDecorations item={selected} showFloat />
              </div>

              <div class="rounded-2xl border border-slate-800/80 bg-slate-900/70 p-3 text-sm text-slate-300">
                <div class="grid gap-3 sm:grid-cols-2">
                  <Show when={selected.kind}>
                    <div>
                      <p class="text-xs uppercase tracking-wide text-slate-500">Type</p>
                      <p class="mt-1 font-medium text-slate-100">{itemKindLabel(selected.kind)}</p>
                    </div>
                  </Show>
                  <Show when={selected.collection}>
                    <div>
                      <p class="text-xs uppercase tracking-wide text-slate-500">Collection</p>
                      <button type="button" class="mt-1 text-left font-medium text-cyan-300 underline decoration-cyan-500/50 underline-offset-4 hover:text-cyan-200" onClick={() => setContentsDialog({ title: selected.collection!, description: "Items belonging to this collection", items: selected.collectionItems ?? [], context: "collection" })}>{selected.collection}</button>
                    </div>
                  </Show>
                  <Show when={selected.exterior}>
                    <div>
                      <p class="text-xs uppercase tracking-wide text-slate-500">Exterior</p>
                      <p class="mt-1 font-medium text-slate-100">{selected.exterior}</p>
                    </div>
                  </Show>
                  <Show when={selected.storageLocation}>
                    <div>
                      <p class="text-xs uppercase tracking-wide text-slate-500">Storage</p>
                      <p class="mt-1 font-medium text-slate-100">{selected.storageLocation}</p>
                    </div>
                  </Show>
                  <Show when={selected.paintWear !== undefined}>
                    <div>
                      <p class="text-xs uppercase tracking-wide text-slate-500">Wear</p>
                      <p class="mt-1 font-mono font-medium text-slate-100">{formatFloat(selected.paintWear!)}</p>
                    </div>
                  </Show>
                  <Show when={selected.marketPrice || selectedMarketPreview()?.price || selectedMarketLoading()}>
                    <div>
                      <p class="text-xs uppercase tracking-wide text-slate-500">Market</p>
                      <Show
                        when={selected.marketName}
                        fallback={<p class="mt-1 font-medium text-slate-100">{selected.marketPrice}</p>}
                      >
                        <a
                          class="mt-1 inline-block font-medium text-sky-300 underline decoration-sky-500/50 underline-offset-4 hover:text-sky-200"
                          href={steamMarketURL(selected.marketName!)}
                          target="_blank"
                          rel="noreferrer"
                        >
                          {selected.marketPrice || selectedMarketPreview()?.price || "Loading…"}
                        </a>
                      </Show>
                    </div>
                  </Show>
                  <Show when={selected.marketSellListings}>
                    <div>
                      <p class="text-xs uppercase tracking-wide text-slate-500">Listings</p>
                      <p class="mt-1 font-medium text-slate-100">{selected.marketSellListings}</p>
                    </div>
                  </Show>
                  <Show when={selected.stickers && selected.stickers.length > 0}>
                    <div>
                      <p class="text-xs uppercase tracking-wide text-slate-500">Stickers</p>
                      <p class="mt-1 font-medium text-slate-100">{selected.stickers?.length}</p>
                    </div>
                  </Show>
                </div>
              </div>

              <Show when={selected.kind === "weapon_skin" && selected.paintWear !== undefined}>
                <WearRangeBar wear={selected.paintWear!} min={selected.paintWearMin} max={selected.paintWearMax} />
              </Show>

              <Show when={selected.kind === "weapon_skin" && (selected.tradeUpItems?.length ?? 0) > 0}>
                <section class="rounded-2xl border border-slate-800/80 bg-slate-900/70 p-4">
                  <h4 class="font-semibold text-slate-100">Identical-copy trade-up outcomes</h4>
                  <p class="mt-1 text-xs text-slate-400">Possible results from {tradeUpInputCount(selected)} identical copies. Wear uses normalized input float mapped into each output finish’s range. {selected.isSouvenir ? "Souvenir attributes are removed; results are normal items." : ""}</p>
                  <div class="mt-3 grid gap-3 sm:grid-cols-2">
                    <For each={selected.tradeUpItems}>{(outcome) => (
                      <article class={`rounded-xl border-2 bg-slate-950/70 p-3 ${rarityBorderClass(outcome.rarity)}`}>
                        <div class="flex gap-3">
                          <Show when={outcome.imageUrl} fallback={<div class="grid h-16 w-20 shrink-0 place-items-center rounded bg-slate-900 text-xs text-slate-600">No image</div>}>
                            <img class="h-16 w-20 shrink-0 rounded bg-slate-900 object-contain" src={outcome.imageUrl} alt="" loading="lazy" />
                          </Show>
                          <div class="min-w-0">
                            <p class="font-medium text-slate-100">{outcome.marketName || outcome.name}</p>
                            <Show when={outcome.paintWear !== undefined}><p class="mt-1 font-mono text-xs text-slate-300">Float {formatFloat(outcome.paintWear!)}</p></Show>
                            <p class="mt-1 text-xs text-slate-400">{outcome.price || "Market price unavailable"}</p>
                          </div>
                        </div>
                        <Show when={outcome.marketName}><a class="mt-3 inline-block text-xs font-medium text-sky-300 hover:text-sky-200" href={steamMarketURL(outcome.marketName!)} target="_blank" rel="noreferrer">Steam Market ↗</a></Show>
                      </article>
                    )}</For>
                  </div>
                </section>
              </Show>

              <div class="flex flex-wrap gap-2">
                <Show when={selected.containerItems?.length}>
                  <Button variant="secondary" onClick={() => setContentsDialog({ title: itemDisplayName(selected), description: "Opening odds, prices, and generated wear outcomes", items: selected.containerItems ?? [], context: "container" })}>
                    View possible contents ({selected.containerItems?.length})
                  </Button>
                </Show>
                <Show when={props.canOpenContainer}>
                  <div class="flex flex-col gap-2">
                    <Button onClick={() => void props.onOpenContainer()} disabled={props.pending}>
                      Open container
                    </Button>
                    <Show when={props.containerStatusMessage}>
                      <p class="max-w-sm text-sm text-slate-400">{props.containerStatusMessage}</p>
                    </Show>
                  </div>
                </Show>
                <Show when={props.canUseNameTagOn}>
                  <Button variant="secondary" onClick={() => props.onOpenRenameEditor(selected)} disabled={props.pending}>
                    Rename
                  </Button>
                </Show>
                <Show when={selected.hasCustomName || selected.customName}>
                  <Button variant="danger" class="bg-rose-600/90 hover:bg-rose-500" onClick={() => void props.onRemoveName()} disabled={props.pending}>
                    Remove custom name
                  </Button>
                </Show>
              </div>

              <Show when={props.renameOpen}>
                <div class="rounded-2xl border border-slate-800/80 bg-slate-900/70 p-4 text-sm text-slate-300">
                  <label class="block font-medium text-slate-100">Custom name</label>
                  <Input class="mt-2" value={props.draftName} onInput={(event) => props.onDraftNameChange((event.currentTarget as HTMLInputElement | null)?.value ?? "")} />
                  <Show when={props.nameTagTools.length > 0}>
                    <label class="mt-3 block font-medium text-slate-100">Name tag tool</label>
                    <Select class="mt-2 w-full" value={props.selectedToolId} onChange={(event) => props.onSelectedToolChange((event.currentTarget as HTMLInputElement | null)?.value ?? "")}>
                      <For each={props.nameTagTools}>{(tool) => <option value={tool.id}>{tool.name}</option>}</For>
                    </Select>
                  </Show>
                  <Show when={props.nameTagTools.length === 0}>
                    <p class="mt-3 text-xs text-slate-500">No compatible name tag tools are available in the current inventory.</p>
                  </Show>
                  <div class="mt-4 flex flex-wrap gap-2">
                    <Button onClick={() => void props.onRenameSubmit()} disabled={props.pending}>
                      Apply
                    </Button>
                    <Button variant="secondary" onClick={() => props.onCloseRename()} disabled={props.pending}>
                      Cancel
                    </Button>
                  </div>
                </div>
              </Show>

              <details class="rounded-2xl border border-slate-800/80 p-3 text-sm text-slate-400">
                <summary class="cursor-pointer font-medium text-slate-200">Diagnostics</summary>
                <div class="mt-3 space-y-2 font-mono text-xs">
                  <p>Item ID: {selected.id}</p>
                  <Show when={selected.kind === "unknown"}>
                    <p>Kind: unsupported/unknown</p>
                  </Show>
                  <Show when={selected.unsupportedFields?.length}>
                    <p>Unsupported fields: {selected.unsupportedFields?.join(", ")}</p>
                  </Show>
                  <For each={selected.diagnostics}>{(diagnostic) => <p class="text-amber-300">{diagnostic}</p>}</For>
                  <Show when={props.inventoryDebugEnabled && selected.debug}>
                    {(debug) => (
                      <div class="space-y-1 border-t border-slate-800 pt-2">
                        <p>GC ID: {debug().gcId}</p>
                        <p>GC original ID: {debug().gcOriginalId}</p>
                        <p>GC defindex: {debug().gcDefIndex}</p>
                        <p>GC inventory: {debug().gcInventory}</p>
                        <p>GC quantity: {debug().gcQuantity}</p>
                        <p>GC quality: {debug().gcQuality}</p>
                        <p>GC rarity: {debug().gcRarity}</p>
                        <p>GC paint kit: {debug().gcPaintKit}</p>
                        <p>Description matched: {debug().descriptionMatched ? "yes" : "no"}</p>
                        <p>Market fallback used: {debug().marketDescriptionUsed ? "yes" : "no"}</p>
                        <Show when={debug().attributes}>
                          <p>Attributes: {JSON.stringify(debug().attributes)}</p>
                        </Show>
                      </div>
                    )}
                  </Show>
                </div>
              </details>
            </div>
          )}
        </Show>
      </div>
    </div>
    <Dialog open={!!contentsDialog()} title={contentsDialog()?.title ?? "Items"} description={contentsDialog()?.description} onOpenChange={(open) => { if (!open) setContentsDialog(undefined); }}>
      <Show when={(contentsDialog()?.items.length ?? 0) > 0} fallback={<p class="rounded-xl border border-slate-800 bg-slate-900/70 p-4 text-sm text-slate-400">No item contents were found in the current CS2 schema.</p>}>
        <Show when={contentsDialog()?.context === "container"}>
          <div class="mb-3 rounded-xl border border-cyan-900/60 bg-cyan-950/20 p-3 text-xs leading-relaxed text-slate-400">
            Base item odds use the documented 5:1 ratio between adjacent rarity tiers and divide each tier evenly among its listed items. Eligible case weapon finishes have a separate 10% StatTrak™ chance. Float-cap conversion is reserved for expected-value calculations rather than displayed as additional per-item odds.
          </div>
        </Show>
        <div class="grid gap-2 sm:grid-cols-2">
          <For each={sortRelatedItemsByRarity(contentsDialog()?.items ?? [])}>{(item) => <RelatedItemPreview item={item} context={contentsDialog()?.context} probability={contentsDialog()?.context === "container" ? contentsOdds().get(item) : undefined} onRequestMarketPreview={props.onMarketPreview} />}</For>
        </div>
      </Show>
    </Dialog>
    </>
  );
}
