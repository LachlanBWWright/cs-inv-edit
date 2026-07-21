import { For, Show, type JSX } from "solid-js";
import type { InventoryItemDto, RelatedItemDto } from "@cs-inv-edit/contracts";
import { Button } from "./ui/Button.js";
import { Input } from "./ui/Input.js";
import { Select } from "./ui/Select.js";
import { isOpenableContainer, itemDisplayName, itemInitials, itemKindLabel, itemSubtitle, rarityBorderClass } from "./inventory-view-utils.js";
import { ItemInstanceDecorations } from "./ItemInstanceDecorations.js";
import { formatFloat } from "./item-instance-utils.js";
import { RelatedItemPreview, type RelatedItemPreviewContext } from "./RelatedItemPreview.js";
import { containerItemOdds } from "./related-item-preview-utils.js";

function steamMarketURL(marketName: string) {
  return `https://steamcommunity.com/market/listings/730/${encodeURIComponent(marketName)}`;
}

function tradeUpInputCount(item: InventoryItemDto) {
  const covert = ["ancient", "covert", "extraordinary", "master"].includes((item.rarity ?? "").toLowerCase());
  return covert ? 5 : 10;
}

export interface ItemHeaderProps {
  selected: InventoryItemDto;
}

export function ItemHeader(props: ItemHeaderProps) {
  return (
    <div>
      <ItemIcon item={props.selected} large />
      <h3 class="mt-3 text-xl font-semibold text-slate-50">{itemDisplayName(props.selected)}</h3>
      <Show when={itemSubtitle(props.selected)}>
        <p class="mt-1 text-sm text-slate-400">{itemSubtitle(props.selected)}</p>
      </Show>
      <ItemInstanceDecorations item={props.selected} showFloat />
    </div>
  );
}

export function ItemIcon(props: { item: InventoryItemDto; large?: boolean }) {
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

export interface PropertyGridProps {
  selected: InventoryItemDto;
  selectedMarketPreview: RelatedItemDto | undefined;
  selectedMarketLoading: boolean;
  onOpenCollection: (collection: string, items: RelatedItemDto[], context: RelatedItemPreviewContext) => void;
}

function PropertyField(props: { label: string; children: JSX.Element | string | number | null | undefined }) {
  return (
    <div>
      <p class="text-xs uppercase tracking-wide text-slate-500">{props.label}</p>
      {props.children}
    </div>
  );
}

function MarketField(props: { selected: InventoryItemDto; selectedMarketPreview: RelatedItemDto | undefined; selectedMarketLoading: boolean }) {
  const hasMarketValue = props.selected.marketPrice || props.selectedMarketPreview?.price || props.selectedMarketLoading;
  if (!hasMarketValue) return null;

  const marketValue = props.selected.marketName
    ? props.selected.marketPrice || props.selectedMarketPreview?.price || "Loading…"
    : props.selected.marketPrice;

  return (
    <PropertyField label="Market">
      <Show when={props.selected.marketName} fallback={<p class="mt-1 font-medium text-slate-100">{marketValue}</p>}>
        <a class="mt-1 inline-block font-medium text-sky-300 underline decoration-sky-500/50 underline-offset-4 hover:text-sky-200" href={steamMarketURL(props.selected.marketName!)} target="_blank" rel="noreferrer">{marketValue}</a>
      </Show>
    </PropertyField>
  );
}

export function PropertyGrid(props: PropertyGridProps) {
  return (
    <div class="rounded-2xl border border-slate-800/80 bg-slate-900/70 p-3 text-sm text-slate-300">
      <div class="grid gap-3 sm:grid-cols-2">
        <Show when={props.selected.kind}>
          <PropertyField label="Type">
            <p class="mt-1 font-medium text-slate-100">{itemKindLabel(props.selected.kind)}</p>
          </PropertyField>
        </Show>
        <Show when={props.selected.collection}>
          <PropertyField label="Collection">
            <button type="button" class="mt-1 text-left font-medium text-cyan-300 underline decoration-cyan-500/50 underline-offset-4 hover:text-cyan-200" onClick={() => props.onOpenCollection(props.selected.collection!, props.selected.collectionItems ?? [], "collection")}>{props.selected.collection}</button>
          </PropertyField>
        </Show>
        <Show when={props.selected.exterior}>
          <PropertyField label="Exterior">
            <p class="mt-1 font-medium text-slate-100">{props.selected.exterior}</p>
          </PropertyField>
        </Show>
        <Show when={props.selected.storageLocation}>
          <PropertyField label="Storage">
            <p class="mt-1 font-medium text-slate-100">{props.selected.storageLocation}</p>
          </PropertyField>
        </Show>
        <Show when={props.selected.paintWear !== undefined}>
          <PropertyField label="Wear">
            <p class="mt-1 font-mono font-medium text-slate-100">{formatFloat(props.selected.paintWear!)}</p>
          </PropertyField>
        </Show>
        <MarketField selected={props.selected} selectedMarketPreview={props.selectedMarketPreview} selectedMarketLoading={props.selectedMarketLoading} />
        <Show when={props.selected.marketSellListings}>
          <PropertyField label="Listings">
            <p class="mt-1 font-medium text-slate-100">{props.selected.marketSellListings}</p>
          </PropertyField>
        </Show>
        <Show when={props.selected.stickers && props.selected.stickers.length > 0}>
          <PropertyField label="Stickers">
            <p class="mt-1 font-medium text-slate-100">{props.selected.stickers?.length}</p>
          </PropertyField>
        </Show>
      </div>
    </div>
  );
}

export interface TradeUpOutcomesProps {
  selected: InventoryItemDto;
}

function TradeUpOutcomeCard(props: { outcome: RelatedItemDto }) {
  return (
    <article class={`rounded-xl border-2 bg-slate-950/70 p-3 ${rarityBorderClass(props.outcome.rarity)}`}>
      <div class="flex gap-3">
        <Show when={props.outcome.imageUrl} fallback={<div class="grid h-16 w-20 shrink-0 place-items-center rounded bg-slate-900 text-xs text-slate-600">No image</div>}>
          <img class="h-16 w-20 shrink-0 rounded bg-slate-900 object-contain" src={props.outcome.imageUrl} alt="" loading="lazy" />
        </Show>
        <div class="min-w-0">
          <p class="font-medium text-slate-100">{props.outcome.marketName || props.outcome.name}</p>
          <Show when={props.outcome.paintWear !== undefined}>
            <p class="mt-1 font-mono text-xs text-slate-300">Float {formatFloat(props.outcome.paintWear!)}</p>
          </Show>
          <p class="mt-1 text-xs text-slate-400">{props.outcome.marketName ? "Market preview available" : "Market price unavailable"}</p>
        </div>
      </div>
      <Show when={props.outcome.marketName}>
        <a class="mt-3 inline-block text-xs font-medium text-sky-300 hover:text-sky-200" href={steamMarketURL(props.outcome.marketName!)} target="_blank" rel="noreferrer">Steam Market ↗</a>
      </Show>
    </article>
  );
}

export function TradeUpOutcomes(props: TradeUpOutcomesProps) {
  return (
    <Show when={props.selected.kind === "weapon_skin" && (props.selected.tradeUpItems?.length ?? 0) > 0}>
      <section class="rounded-2xl border border-slate-800/80 bg-slate-900/70 p-4">
        <h4 class="font-semibold text-slate-100">Identical-copy trade-up outcomes</h4>
        <p class="mt-1 text-xs text-slate-400">Possible results from {tradeUpInputCount(props.selected)} identical copies. Wear uses normalized input float mapped into each output finish’s range. {props.selected.isSouvenir ? "Souvenir attributes are removed; results are normal items." : ""}</p>
        <div class="mt-3 grid gap-3 sm:grid-cols-2">
          <For each={props.selected.tradeUpItems}>{(outcome) => <TradeUpOutcomeCard outcome={outcome} />}</For>
        </div>
      </section>
    </Show>
  );
}

export interface ActionBarProps {
  selected: InventoryItemDto;
  pending: boolean;
  canOpenContainer: boolean;
  canUseNameTagOn: boolean;
  compatibleContainerKey: InventoryItemDto | undefined;
  compatibleContainerKeys: InventoryItemDto[];
  selectedContainerKeyId: string;
  containerStatusMessage: string;
  onOpenContainer: () => Promise<void> | void;
  onOpenRenameEditor: (item: InventoryItemDto) => void;
  onRemoveName: () => Promise<void> | void;
  onShowContents: () => void;
  onSelectedContainerKeyChange: (value: string) => void;
}

function ContainerKeyControl(props: Pick<ActionBarProps, "selected" | "compatibleContainerKeys" | "selectedContainerKeyId" | "onSelectedContainerKeyChange">) {
  const keyState = (props.selected.requiredKeyDefIndexes?.length ?? 0) > 0;
  if (!keyState) {
    return null;
  }
  if (props.compatibleContainerKeys.length === 0) {
    return <p class="max-w-sm text-xs text-amber-300">This container requires a compatible key, but none is present in your inventory.</p>;
  }
  return (
    <label class="max-w-sm text-xs text-slate-300">
      Compatible key
      <Select class="mt-1 w-full" value={props.selectedContainerKeyId} onChange={(event) => props.onSelectedContainerKeyChange((event.currentTarget as HTMLSelectElement | null)?.value ?? "")}>
        <option value="">Select a key…</option>
        <For each={props.compatibleContainerKeys}>{(key) => <option value={key.id}>{itemDisplayName(key)}</option>}</For>
      </Select>
    </label>
  );
}

export function ActionBar(props: ActionBarProps) {
  const showOpenContainer = () => props.canOpenContainer || isOpenableContainer(props.selected);
  const requiresKeySelection = () => (props.selected.requiredKeyDefIndexes?.length ?? 0) > 0 && !props.compatibleContainerKey;

  return (
    <div class="flex flex-wrap gap-2">
      <Show when={props.selected.inspectUrl}>
        <a class="inline-flex h-10 items-center justify-center rounded-xl bg-cyan-500 px-4 text-sm font-semibold text-slate-950 transition hover:bg-cyan-400" href={props.selected.inspectUrl} target="_blank" rel="noreferrer">Preview in game ↗</a>
      </Show>
      <Show when={props.selected.containerItems?.length}>
        <Button variant="secondary" onClick={() => props.onShowContents()}>View possible contents ({props.selected.containerItems?.length})</Button>
      </Show>
      <Show when={showOpenContainer()}>
        <div class="flex flex-col gap-2">
          <ContainerKeyControl selected={props.selected} compatibleContainerKeys={props.compatibleContainerKeys} selectedContainerKeyId={props.selectedContainerKeyId} onSelectedContainerKeyChange={props.onSelectedContainerKeyChange} />
          <Button onClick={() => void props.onOpenContainer()} disabled={props.pending}>{requiresKeySelection() ? "Choose key" : "Open"}</Button>
          <Show when={props.containerStatusMessage}>
            <p class="max-w-sm text-sm text-slate-400">{props.containerStatusMessage}</p>
          </Show>
        </div>
      </Show>
      <Show when={props.canUseNameTagOn}>
        <Button variant="secondary" onClick={() => props.onOpenRenameEditor(props.selected)} disabled={props.pending}>Rename</Button>
      </Show>
      <Show when={props.selected.hasCustomName || props.selected.customName}>
        <Button variant="danger" class="bg-rose-600/90 hover:bg-rose-500" onClick={() => void props.onRemoveName()} disabled={props.pending}>Remove custom name</Button>
      </Show>
    </div>
  );
}

export interface RenameEditorProps {
  selected: InventoryItemDto;
  renameOpen: boolean;
  draftName: string;
  nameTagTools: InventoryItemDto[];
  pending: boolean;
  selectedToolId: string;
  onRenameSubmit: () => Promise<void> | void;
  onCloseRename: () => void;
  onDraftNameChange: (value: string) => void;
  onSelectedToolChange: (value: string) => void;
}

function NameTagToolSelect(props: { nameTagTools: InventoryItemDto[]; selectedToolId: string; onSelectedToolChange: (value: string) => void }) {
  if (props.nameTagTools.length === 0) {
    return <p class="mt-3 text-xs text-slate-500">No compatible name tag tools are available in the current inventory.</p>;
  }

  return (
    <>
      <label class="mt-3 block font-medium text-slate-100">Name tag tool</label>
      <Select class="mt-2 w-full" value={props.selectedToolId} onChange={(event) => props.onSelectedToolChange((event.currentTarget as HTMLInputElement | null)?.value ?? "")}>
        <For each={props.nameTagTools}>{(tool) => <option value={tool.id}>{tool.name}</option>}</For>
      </Select>
    </>
  );
}

export function RenameEditor(props: RenameEditorProps) {
  return (
    <Show when={props.renameOpen}>
      <div class="rounded-2xl border border-slate-800/80 bg-slate-900/70 p-4 text-sm text-slate-300">
        <label class="block font-medium text-slate-100">Custom name</label>
        <Input class="mt-2" value={props.draftName} onInput={(event) => props.onDraftNameChange((event.currentTarget as HTMLInputElement | null)?.value ?? "")} />
        <NameTagToolSelect nameTagTools={props.nameTagTools} selectedToolId={props.selectedToolId} onSelectedToolChange={props.onSelectedToolChange} />
        <div class="mt-4 flex flex-wrap gap-2">
          <Button onClick={() => void props.onRenameSubmit()} disabled={props.pending}>Apply</Button>
          <Button variant="secondary" onClick={() => props.onCloseRename()} disabled={props.pending}>Cancel</Button>
        </div>
      </div>
    </Show>
  );
}

export interface DiagnosticsPanelProps {
  selected: InventoryItemDto;
  inventoryDebugEnabled: boolean;
}

function DebugBlock(props: { debug: NonNullable<NonNullable<InventoryItemDto["debug"]>> }) {
  return (
    <div class="space-y-1 border-t border-slate-800 pt-2">
      <p>GC ID: {props.debug.gcId}</p>
      <p>GC original ID: {props.debug.gcOriginalId}</p>
      <p>GC defindex: {props.debug.gcDefIndex}</p>
      <p>GC inventory: {props.debug.gcInventory}</p>
      <p>GC quantity: {props.debug.gcQuantity}</p>
      <p>GC quality: {props.debug.gcQuality}</p>
      <p>GC rarity: {props.debug.gcRarity}</p>
      <p>GC paint kit: {props.debug.gcPaintKit}</p>
      <p>Description matched: {props.debug.descriptionMatched ? "yes" : "no"}</p>
      <p>Market fallback used: {props.debug.marketDescriptionUsed ? "yes" : "no"}</p>
      <Show when={props.debug.attributes}>
        <p>Attributes: {JSON.stringify(props.debug.attributes)}</p>
      </Show>
    </div>
  );
}

export function DiagnosticsPanel(props: DiagnosticsPanelProps) {
  const debugContent = props.inventoryDebugEnabled && props.selected.debug
    ? <DebugBlock debug={props.selected.debug} />
    : null;

  return (
    <details class="rounded-2xl border border-slate-800/80 p-3 text-sm text-slate-400">
      <summary class="cursor-pointer font-medium text-slate-200">Diagnostics</summary>
      <div class="mt-3 space-y-2 font-mono text-xs">
        <p>Item ID: {props.selected.id}</p>
        <Show when={props.selected.kind === "unknown"}>
          <p>Kind: unsupported/unknown</p>
        </Show>
        <Show when={props.selected.unsupportedFields?.length}>
          <p>Unsupported fields: {props.selected.unsupportedFields?.join(", ")}</p>
        </Show>
        <For each={props.selected.diagnostics}>{(diagnostic) => <p class="text-amber-300">{diagnostic}</p>}</For>
        {debugContent}
      </div>
    </details>
  );
}

export interface ContentsDialogProps {
  selected: InventoryItemDto;
  items: RelatedItemDto[];
  dialogContext: RelatedItemPreviewContext | undefined;
  context: "container" | "collection" | undefined;
  onClose: () => void;
  onMarketPreview: (marketName: string) => Promise<RelatedItemDto | undefined>;
}

export function ContentsDialog(props: ContentsDialogProps) {
  const odds = containerItemOdds(props.items ?? []);
  return (
    <div class="rounded-xl border border-cyan-900/60 bg-cyan-950/20 p-3 text-xs leading-relaxed text-slate-400">
      <div class="mb-3 rounded-xl border border-cyan-900/60 bg-cyan-950/20 p-3 text-xs leading-relaxed text-slate-400">
        Base item odds use the documented 5:1 ratio between adjacent rarity tiers and divide each tier evenly among its listed items. Eligible case weapon finishes have a separate 10% StatTrak™ chance. Float-cap conversion is reserved for expected-value calculations rather than displayed as additional per-item odds.
      </div>
      <div class="grid gap-2 sm:grid-cols-2">
        <For each={props.items}>{(item) => <RelatedItemPreview item={item} context={props.dialogContext} probability={props.context === "container" ? odds.get(item) : undefined} onRequestMarketPreview={props.onMarketPreview} />}</For>
      </div>
    </div>
  );
}
