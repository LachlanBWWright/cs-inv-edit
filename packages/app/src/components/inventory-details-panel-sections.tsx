import { createMemo, For, Show, type JSX } from "solid-js";
import type { InventoryItemDto, RelatedItemDto } from "@cs-inv-edit/contracts";
import { Button } from "./ui/Button.js";
import { Input } from "./ui/Input.js";
import { Select } from "./ui/Select.js";
import {
  isActiveTerminal,
  isOpenableContainer,
  itemDisplayName,
  itemInitials,
  itemKindLabel,
  itemSubtitle,
  rarityBorderClass,
} from "./inventory-view-utils.js";
import { ItemInstanceDecorations } from "./ItemInstanceDecorations.js";
import { formatFloat } from "./item-instance-utils.js";
import { tradeStateDescription } from "./ItemMarketBadges.js";
import {
  RelatedItemPreview,
  type RelatedItemPreviewContext,
} from "./RelatedItemPreview.js";
import { containerItemOdds } from "./related-item-preview-utils.js";
import { ItemPreviewMedia } from "./ItemPreviewMedia.js";
import type { ReturnEstimate } from "./roi-utils.js";
import { ReturnEstimateCard } from "./ReturnEstimateCard.js";

function steamMarketURL(marketName: string) {
  return `https://steamcommunity.com/market/listings/730/${encodeURIComponent(marketName)}`;
}

function tradeUpInputCount(item: InventoryItemDto) {
  const covert = ["ancient", "covert", "extraordinary", "master"].includes(
    (item.rarity ?? "").toLowerCase(),
  );
  return covert ? 5 : 10;
}

export interface ItemHeaderProps {
  selected: InventoryItemDto;
}

export function ItemHeader(props: ItemHeaderProps) {
  return (
    <div>
      <ItemIcon item={props.selected} large />
      <h3 class="mt-3 text-xl font-semibold text-slate-50">
        {itemDisplayName(props.selected)}
      </h3>
      <Show when={itemSubtitle(props.selected)}>
        <p class="mt-1 text-sm text-slate-400">
          {itemSubtitle(props.selected)}
        </p>
      </Show>
      <ItemInstanceDecorations item={props.selected} showFloat />
    </div>
  );
}

export function ItemIcon(props: { item: InventoryItemDto; large?: boolean }) {
  if (props.large)
    return (
      <ItemPreviewMedia
        name={itemDisplayName(props.item)}
        imageUrl={props.item.imageUrl}
        variant="details"
      />
    );
  const boxClass = () =>
    "flex h-16 w-20 shrink-0 items-center justify-center rounded bg-slate-950 text-sm font-semibold text-slate-600";
  const imageClass = () =>
    "h-16 w-20 shrink-0 rounded bg-slate-950 object-contain";

  return (
    <Show
      when={props.item.imageUrl}
      fallback={<div class={boxClass()}>{itemInitials(props.item)}</div>}
    >
      <img
        class={imageClass()}
        src={props.item.imageUrl}
        alt={itemDisplayName(props.item)}
        loading="lazy"
      />
    </Show>
  );
}

export interface PropertyGridProps {
  selected: InventoryItemDto;
  selectedMarketPreview: RelatedItemDto | undefined;
  selectedMarketLoading: boolean;
  onOpenCollection: (
    collection: string,
    items: RelatedItemDto[],
    context: RelatedItemPreviewContext,
  ) => void;
}

function PropertyField(props: {
  label: string;
  children: JSX.Element | string | number | null | undefined;
}) {
  return (
    <div>
      <p class="text-xs uppercase tracking-wide text-slate-500">
        {props.label}
      </p>
      {props.children}
    </div>
  );
}

function scrapePercent(wear: number | undefined) {
  return wear === undefined
    ? undefined
    : Math.round(Math.max(0, Math.min(1, wear)) * 100);
}

function AppliedItemGallery(props: {
  items: NonNullable<InventoryItemDto["appliedItems"]>;
}) {
  return (
    <div class="sm:col-span-2">
      <p class="text-xs uppercase tracking-wide text-slate-500">
        Applied items
      </p>
      <div class="mt-2 flex flex-wrap gap-3">
        <For each={props.items}>
          {(applied) => {
            const scraped = () =>
              applied.kind === "sticker"
                ? scrapePercent(applied.wear)
                : undefined;
            return (
              <div class="w-24 rounded-lg border border-slate-700/80 bg-slate-950/70 p-2">
                <div class="flex h-16 w-full items-center justify-center overflow-hidden rounded bg-slate-900">
                  <Show
                    when={applied.imageUrl}
                    fallback={
                      <span class="text-xl font-bold text-slate-600">
                        {applied.kind === "charm"
                          ? "C"
                          : applied.kind === "patch"
                            ? "P"
                            : "S"}
                      </span>
                    }
                  >
                    <img
                      class="h-full w-full object-contain"
                      src={applied.imageUrl}
                      alt={applied.name}
                      loading="lazy"
                    />
                  </Show>
                </div>
                <p
                  class="mt-1 line-clamp-2 text-[11px] font-medium leading-tight text-slate-200"
                  title={applied.name}
                >
                  {applied.name}
                </p>
                <p class="mt-1 text-[10px] capitalize text-slate-500">
                  {applied.kind}
                  {applied.slot === undefined
                    ? ""
                    : ` · slot ${applied.slot + 1}`}
                </p>
                <Show when={scraped() !== undefined}>
                  <div
                    class="mt-1"
                    title={`Sticker scrape level: ${scraped()}%`}
                  >
                    <div class="h-1 overflow-hidden rounded bg-slate-700">
                      <div
                        class="h-full bg-amber-400"
                        style={{ width: `${scraped()}%` }}
                      />
                    </div>
                    <p class="mt-0.5 text-[10px] text-amber-200">
                      {scraped()}% scraped
                    </p>
                  </div>
                </Show>
              </div>
            );
          }}
        </For>
      </div>
    </div>
  );
}

function MarketField(props: {
  selected: InventoryItemDto;
  selectedMarketPreview: RelatedItemDto | undefined;
  selectedMarketLoading: boolean;
}) {
  const hasMarketValue =
    props.selected.marketPrice ||
    props.selectedMarketPreview?.price ||
    props.selectedMarketLoading;
  if (!hasMarketValue) return null;

  const marketValue = props.selected.marketName
    ? props.selected.marketPrice ||
      props.selectedMarketPreview?.price ||
      "Loading…"
    : props.selected.marketPrice;

  return (
    <PropertyField label="Market">
      <Show
        when={props.selected.marketName}
        fallback={<p class="mt-1 font-medium text-slate-100">{marketValue}</p>}
      >
        <a
          class="mt-1 inline-block font-medium text-sky-300 underline decoration-sky-500/50 underline-offset-4 hover:text-sky-200"
          href={steamMarketURL(props.selected.marketName!)}
          target="_blank"
          rel="noreferrer"
        >
          {marketValue}
        </a>
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
            <p class="mt-1 font-medium text-slate-100">
              {itemKindLabel(props.selected.kind)}
            </p>
          </PropertyField>
        </Show>
        <Show when={props.selected.collection}>
          <PropertyField label="Collection">
            <button
              type="button"
              class="mt-1 text-left font-medium text-cyan-300 underline decoration-cyan-500/50 underline-offset-4 hover:text-cyan-200"
              onClick={() =>
                props.onOpenCollection(
                  props.selected.collection!,
                  props.selected.collectionItems ?? [],
                  "collection",
                )
              }
            >
              {props.selected.collection}
            </button>
          </PropertyField>
        </Show>
        <Show when={props.selected.exterior}>
          <PropertyField label="Exterior">
            <p class="mt-1 font-medium text-slate-100">
              {props.selected.exterior}
            </p>
          </PropertyField>
        </Show>
        <Show when={props.selected.storageLocation}>
          <PropertyField label="Storage">
            <p class="mt-1 font-medium text-slate-100">
              {props.selected.storageLocation}
            </p>
          </PropertyField>
        </Show>
        <Show when={props.selected.paintWear !== undefined}>
          <PropertyField label="Wear">
            <p class="mt-1 font-mono font-medium text-slate-100">
              {formatFloat(props.selected.paintWear!)}
            </p>
          </PropertyField>
        </Show>
        <Show when={props.selected.graffitiCharges !== undefined}>
          <PropertyField label="Charges remaining">
            <p class="mt-1 font-mono font-medium text-slate-100">
              {props.selected.graffitiCharges}
            </p>
          </PropertyField>
        </Show>
        <MarketField
          selected={props.selected}
          selectedMarketPreview={props.selectedMarketPreview}
          selectedMarketLoading={props.selectedMarketLoading}
        />
        <PropertyField label="Trade state">
          <p class="mt-1 font-medium text-slate-100">
            {tradeStateDescription(props.selected)}
          </p>
        </PropertyField>
        <Show when={props.selected.marketSellListings}>
          <PropertyField label="Listings">
            <p class="mt-1 font-medium text-slate-100">
              {props.selected.marketSellListings}
            </p>
          </PropertyField>
        </Show>
        <Show
          when={props.selected.stickers && props.selected.stickers.length > 0}
        >
          <PropertyField label="Stickers">
            <p class="mt-1 font-medium text-slate-100">
              {props.selected.stickers?.length}
            </p>
          </PropertyField>
        </Show>
        <Show when={(props.selected.appliedItems?.length ?? 0) > 0}>
          <AppliedItemGallery items={props.selected.appliedItems!} />
        </Show>
        <Show when={props.selected.customName}>
          <PropertyField label="Name Tag">
            <p class="mt-1 font-medium text-cyan-200">
              {props.selected.customName}
            </p>
          </PropertyField>
        </Show>
      </div>
    </div>
  );
}

export interface TradeUpOutcomesProps {
  selected: InventoryItemDto;
  onPreview?: (item: InventoryItemDto) => void;
  returnEstimate?: ReturnEstimate;
  returnEstimateLoading?: boolean;
}

function TradeUpOutcomeCard(props: { outcome: RelatedItemDto }) {
  return (
    <article
      class={`rounded-xl border-2 bg-slate-950/70 p-3 ${rarityBorderClass(props.outcome.rarity)}`}
    >
      <div class="flex gap-3">
        <Show
          when={props.outcome.imageUrl}
          fallback={
            <div class="grid h-16 w-20 shrink-0 place-items-center rounded bg-slate-900 text-xs text-slate-600">
              No image
            </div>
          }
        >
          <img
            class="h-16 w-20 shrink-0 rounded bg-slate-900 object-contain"
            src={props.outcome.imageUrl}
            alt=""
            loading="lazy"
          />
        </Show>
        <div class="min-w-0">
          <p class="font-medium text-slate-100">
            {props.outcome.marketName || props.outcome.name}
          </p>
          <Show when={props.outcome.paintWear !== undefined}>
            <p class="mt-1 font-mono text-xs text-slate-300">
              Float {formatFloat(props.outcome.paintWear!)}
            </p>
          </Show>
          <p class="mt-1 text-xs text-slate-400">
            {props.outcome.marketName
              ? "Market preview available"
              : "Market price unavailable"}
          </p>
        </div>
      </div>
      <Show when={props.outcome.marketName}>
        <a
          class="mt-3 inline-block text-xs font-medium text-sky-300 hover:text-sky-200"
          href={steamMarketURL(props.outcome.marketName!)}
          target="_blank"
          rel="noreferrer"
        >
          Steam Market ↗
        </a>
      </Show>
    </article>
  );
}

export function TradeUpOutcomes(props: TradeUpOutcomesProps) {
  return (
    <Show
      when={
        props.selected.kind === "weapon_skin" &&
        (props.selected.tradeUpItems?.length ?? 0) > 0
      }
    >
      <section class="rounded-2xl border border-slate-800/80 bg-slate-900/70 p-4">
        <div class="flex flex-wrap items-start justify-between gap-3">
          <h4 class="font-semibold text-slate-100">
            Identical-copy trade-up outcomes
          </h4>
          <button
            type="button"
            class="rounded-md border border-cyan-500/40 bg-cyan-600/80 px-3 py-2 text-sm font-medium text-white hover:bg-cyan-500"
            onClick={() => props.onPreview?.(props.selected)}
          >
            Preview trade-up animation
          </button>
        </div>
        <p class="mt-1 text-xs text-slate-400">
          Possible results from {tradeUpInputCount(props.selected)} identical
          copies. Wear uses normalized input float mapped into each output
          finish’s range.{" "}
          {props.selected.isSouvenir
            ? "Souvenir attributes are removed; results are normal items."
            : ""}
        </p>
        <div class="mt-3">
          <ReturnEstimateCard
            estimate={props.returnEstimate}
            loading={props.returnEstimateLoading}
            costLabel="Identical-copy inputs"
            note="Expected value uses equal odds for this collection’s displayed outcomes and current market prices; Steam fees are excluded."
          />
        </div>
        <div class="mt-3 grid gap-3 sm:grid-cols-2">
          <For each={props.selected.tradeUpItems}>
            {(outcome) => <TradeUpOutcomeCard outcome={outcome} />}
          </For>
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
  onOpenContainer: (terminalSelection?: {
    pointsRemaining?: number;
    volatileLimit?: number;
  }) => Promise<void> | void;
  onOpenRenameEditor: (item: InventoryItemDto) => void;
  onRemoveName: () => Promise<void> | void;
  onShowContents: () => void;
  onViewStorageContents: () => Promise<void> | void;
  onSelectedContainerKeyChange: (value: string) => void;
}

function ContainerKeyControl(
  props: Pick<
    ActionBarProps,
    | "selected"
    | "compatibleContainerKeys"
    | "selectedContainerKeyId"
    | "onSelectedContainerKeyChange"
  >,
) {
  const keyState = (props.selected.requiredKeyDefIndexes?.length ?? 0) > 0;
  if (!keyState) {
    return null;
  }
  if (props.compatibleContainerKeys.length === 0) {
    return (
      <p class="max-w-sm text-xs text-amber-300">
        This container requires a compatible key, but none is present in your
        inventory.
      </p>
    );
  }
  return (
    <label class="max-w-sm text-xs text-slate-300">
      Compatible key
      <Select
        class="mt-1 w-full"
        value={props.selectedContainerKeyId}
        onChange={(event) =>
          props.onSelectedContainerKeyChange(
            (event.currentTarget as HTMLSelectElement | null)?.value ?? "",
          )
        }
      >
        <option value="">Select a key…</option>
        <For each={props.compatibleContainerKeys}>
          {(key) => <option value={key.id}>{itemDisplayName(key)}</option>}
        </For>
      </Select>
    </label>
  );
}

export function ActionBar(props: ActionBarProps) {
  const showOpenContainer = () =>
    !isActiveTerminal(props.selected) &&
    (props.canOpenContainer || isOpenableContainer(props.selected));
  const requiresKeySelection = () =>
    (props.selected.requiredKeyDefIndexes?.length ?? 0) > 0 &&
    !props.compatibleContainerKey;

  return (
    <div class="flex flex-wrap gap-2">
      <Show when={props.selected.containerItems?.length}>
        <Button variant="secondary" onClick={() => props.onShowContents()}>
          View possible contents ({props.selected.containerItems?.length})
        </Button>
      </Show>
      <Show when={props.selected.kind === "storage_unit"}>
        <Button
          variant="secondary"
          onClick={() => void props.onViewStorageContents()}
          disabled={props.pending}
        >
          View contents ({props.selected.storageCount ?? 0})
        </Button>
      </Show>
      <Show when={showOpenContainer()}>
        <div class="flex flex-col gap-2">
          <ContainerKeyControl
            selected={props.selected}
            compatibleContainerKeys={props.compatibleContainerKeys}
            selectedContainerKeyId={props.selectedContainerKeyId}
            onSelectedContainerKeyChange={props.onSelectedContainerKeyChange}
          />
          <Button
            onClick={() => void props.onOpenContainer()}
            disabled={props.pending}
          >
            {requiresKeySelection() ? "Choose key" : "Open"}
          </Button>
          <Show when={props.containerStatusMessage}>
            <p class="max-w-sm text-sm text-slate-400">
              {props.containerStatusMessage}
            </p>
          </Show>
        </div>
      </Show>
      <Show when={props.canUseNameTagOn}>
        <Button
          variant="secondary"
          onClick={() => props.onOpenRenameEditor(props.selected)}
          disabled={props.pending}
        >
          Rename
        </Button>
      </Show>
      <Show when={props.selected.hasCustomName || props.selected.customName}>
        <Button
          variant="danger"
          class="bg-rose-600/90 hover:bg-rose-500"
          onClick={() => void props.onRemoveName()}
          disabled={props.pending}
        >
          Remove custom name
        </Button>
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

function NameTagToolSelect(props: {
  nameTagTools: InventoryItemDto[];
  selectedToolId: string;
  onSelectedToolChange: (value: string) => void;
}) {
  if (props.nameTagTools.length === 0) {
    return (
      <p class="mt-3 text-xs text-slate-500">
        No compatible name tag tools are available in the current inventory.
      </p>
    );
  }

  return (
    <>
      <label class="mt-3 block font-medium text-slate-100">Name tag tool</label>
      <Select
        class="mt-2 w-full"
        value={props.selectedToolId}
        onChange={(event) =>
          props.onSelectedToolChange(
            (event.currentTarget as HTMLInputElement | null)?.value ?? "",
          )
        }
      >
        <For each={props.nameTagTools}>
          {(tool) => <option value={tool.id}>{tool.name}</option>}
        </For>
      </Select>
    </>
  );
}

export function RenameEditor(props: RenameEditorProps) {
  return (
    <Show when={props.renameOpen}>
      <div class="rounded-2xl border border-slate-800/80 bg-slate-900/70 p-4 text-sm text-slate-300">
        <label class="block font-medium text-slate-100">Custom name</label>
        <Input
          class="mt-2"
          value={props.draftName}
          onInput={(event) =>
            props.onDraftNameChange(
              (event.currentTarget as HTMLInputElement | null)?.value ?? "",
            )
          }
        />
        <NameTagToolSelect
          nameTagTools={props.nameTagTools}
          selectedToolId={props.selectedToolId}
          onSelectedToolChange={props.onSelectedToolChange}
        />
        <div class="mt-4 flex flex-wrap gap-2">
          <Button
            onClick={() => void props.onRenameSubmit()}
            disabled={props.pending}
          >
            Apply
          </Button>
          <Button
            variant="secondary"
            onClick={() => props.onCloseRename()}
            disabled={props.pending}
          >
            Cancel
          </Button>
        </div>
      </div>
    </Show>
  );
}

export interface DiagnosticsPanelProps {
  selected: InventoryItemDto;
  inventoryDebugEnabled: boolean;
}

function DebugBlock(props: {
  debug: NonNullable<NonNullable<InventoryItemDto["debug"]>>;
}) {
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
      <p>
        Description matched: {props.debug.descriptionMatched ? "yes" : "no"}
      </p>
      <p>
        Market fallback used: {props.debug.marketDescriptionUsed ? "yes" : "no"}
      </p>
      <Show when={props.debug.attributes}>
        <p>Attributes: {JSON.stringify(props.debug.attributes)}</p>
      </Show>
    </div>
  );
}

const ECON_ATTR_MAP: Record<string, string> = {
  "6": "paint_kit",
  "7": "seed",
  "8": "paint_wear",
  "169": "points_remaining",
  "183": "expiration_date",
  "270": "storage_count",
  "272": "casket_id_low",
  "273": "casket_id_high",
  "315": "volatile_container",
  "316": "purchase_price",
};

function formatAttrLabel(prefix: string, rawKey: string): string {
  const cleanKey = rawKey.replace(/^#/, "");
  const name = ECON_ATTR_MAP[cleanKey];
  const tag = name ? `#${cleanKey} (${name})` : `#${cleanKey}`;
  return prefix ? `${prefix} · ${tag}` : tag;
}

function parseDiagnosticLine(line: string) {
  const colonIndex = line.indexOf(":");
  if (colonIndex === -1) return { title: line, entries: [] };
  const title = line.slice(0, colonIndex).trim();
  const rest = line.slice(colonIndex + 1).trim();

  const entries: { label: string; value: string }[] = [];

  // If line contains attributes={...} or byte_attributes={...}, extract them specially
  const attrBlockRegex = /(attributes|byte_attributes)=\{([^}]+)\}/g;
  let attrMatch: RegExpExecArray | null;
  let remainingText = rest;
  while ((attrMatch = attrBlockRegex.exec(rest)) !== null) {
    const groupName = attrMatch[1] === "byte_attributes" ? "Bytes" : "Attr";
    const inner = attrMatch[2] ?? "";
    const pairRegex = /([#a-zA-Z0-9_\-]+)=([^\s,]+)/g;
    let pair: RegExpExecArray | null;
    while ((pair = pairRegex.exec(inner)) !== null) {
      entries.push({
        label: formatAttrLabel(groupName, pair[1]!),
        value: pair[2]!,
      });
    }
    remainingText = remainingText.replace(attrMatch[0], "");
  }

  // Parse remaining key=value or key: value pairs
  const kvRegex = /([#a-zA-Z0-9_\-]+)=(?:"([^"]*)"|([^\s,]+))/g;
  let match: RegExpExecArray | null;
  while ((match = kvRegex.exec(remainingText)) !== null) {
    let key = match[1] ?? "";
    const rawVal = match[2] ?? match[3] ?? "";
    if (key.includes("paint_kit")) {
      key = `paint_kit (${key})`;
    } else if (key.startsWith("#")) {
      key = formatAttrLabel("", key);
    }
    entries.push({ label: key, value: rawVal });
  }

  // Handle comma or hash separated list if no kv matched
  if (entries.length === 0 && remainingText.includes("#")) {
    const items = remainingText.split(",");
    for (const item of items) {
      const parts = item.trim().split(":");
      if (parts.length >= 2) {
        entries.push({
          label: parts[0]!.trim(),
          value: parts.slice(1).join(":").trim(),
        });
      }
    }
  }

  return {
    title,
    entries: entries.length > 0 ? entries : [{ label: "Details", value: rest }],
  };
}

function decodeHexToFloat(hex: string): number | undefined {
  const cleanHex = hex.replace(/^0x/i, "");
  if (cleanHex.length !== 8) return undefined;
  const num = parseInt(cleanHex, 16);
  if (isNaN(num)) return undefined;
  const buf = new ArrayBuffer(4);
  const view = new DataView(buf);
  view.setUint32(0, num, false);
  const f = view.getFloat32(0, false);
  if (!isNaN(f) && isFinite(f)) return f;
  return undefined;
}

function decodeLittleEndianHexToFloat(hex: string): number | undefined {
  const cleanHex = hex.replace(/^0x/i, "");
  if (cleanHex.length !== 8) return undefined;
  const num = parseInt(cleanHex, 16);
  if (isNaN(num)) return undefined;
  const buf = new ArrayBuffer(4);
  const view = new DataView(buf);
  view.setUint32(0, num, true);
  const f = view.getFloat32(0, true);
  if (!isNaN(f) && isFinite(f)) return f;
  return undefined;
}

function decodeLittleEndianHexToUint32(hex: string): number | undefined {
  const cleanHex = hex.replace(/^0x/i, "");
  if (cleanHex.length !== 8) return undefined;
  const num = parseInt(cleanHex, 16);
  if (isNaN(num)) return undefined;
  const buf = new ArrayBuffer(4);
  const view = new DataView(buf);
  view.setUint32(0, num, true);
  return view.getUint32(0, true);
}

const QUALITY_NAMES: Record<number, string> = {
  0: "Normal",
  1: "Genuine",
  2: "Vintage",
  3: "Unusual (★)",
  4: "Unique (Standard)",
  5: "Community",
  6: "Developer",
  7: "Self-Made",
  8: "Customized",
  9: "StatTrak™",
  10: "Completed",
  12: "Souvenir",
};

const RARITY_NAMES: Record<number, string> = {
  1: "Consumer Grade (Common)",
  2: "Industrial Grade (Uncommon)",
  3: "Mil-Spec Grade (Rare)",
  4: "Restricted (Mythical)",
  5: "Classified (Legendary)",
  6: "Covert (Ancient)",
  7: "Contraband (Immortal)",
};

function formatDecodedDiagnosticEntry(
  label: string,
  rawVal: string,
): { displayVal: string; rawVal?: string } {
  const cleanLabel = label.toLowerCase();

  // Attribute #8 or paint_wear
  if (cleanLabel.includes("#8") || cleanLabel.includes("paint_wear")) {
    if (rawVal.includes("/")) {
      const parts = rawVal.split("/");
      const floatVal = decodeHexToFloat(parts[1] ?? "");
      if (floatVal !== undefined) {
        return {
          displayVal: `Float ${floatVal.toString()}`,
          rawVal: `raw: ${rawVal}`,
        };
      }
    }
    const num = parseFloat(rawVal);
    if (!isNaN(num) && num >= 0 && num <= 1) {
      return {
        displayVal: `Float ${num.toString()}`,
        rawVal: `raw: ${rawVal}`,
      };
    }
    const hexFloat = decodeLittleEndianHexToFloat(rawVal);
    if (hexFloat !== undefined) {
      return {
        displayVal: `Float ${hexFloat.toString()}`,
        rawVal: `hex: ${rawVal}`,
      };
    }
  }

  // Attribute #6 or paint_kit
  if (cleanLabel.includes("#6") || cleanLabel.includes("paint_kit")) {
    if (rawVal.includes("/")) {
      const parts = rawVal.split("/");
      const floatVal = decodeHexToFloat(parts[1] ?? "");
      if (floatVal !== undefined) {
        return {
          displayVal: `Paint Kit ${Math.round(floatVal)}`,
          rawVal: `raw: ${rawVal}`,
        };
      }
    }
    const hexVal = decodeLittleEndianHexToFloat(rawVal);
    if (hexVal !== undefined) {
      return {
        displayVal: `Paint Kit ${Math.round(hexVal)}`,
        rawVal: `hex: ${rawVal}`,
      };
    }
    const num = parseInt(rawVal, 10);
    if (!isNaN(num)) {
      return { displayVal: `Paint Kit ${num}`, rawVal: `raw: ${rawVal}` };
    }
  }

  // Attribute #316 or purchase_price
  if (cleanLabel.includes("#316") || cleanLabel.includes("purchase_price")) {
    const rawNum = parseInt(rawVal.split("/")[0] ?? rawVal, 10);
    if (!isNaN(rawNum)) {
      const priceStr = (rawNum / 100).toLocaleString("en-US", {
        style: "currency",
        currency: "USD",
      });
      return { displayVal: priceStr, rawVal: `raw: ${rawVal}` };
    }
  }

  // Expiration / Timestamp (#183, generation_time, expiration_date)
  if (
    cleanLabel.includes("#183") ||
    cleanLabel.includes("expiration") ||
    cleanLabel.includes("generation_time")
  ) {
    const timestampStr = rawVal.split("/")[0] ?? rawVal;
    const num = parseInt(timestampStr, 10);
    if (!isNaN(num) && num > 1000000000) {
      const date = new Date(num * 1000).toUTCString();
      return { displayVal: date, rawVal: `unix: ${rawVal}` };
    }
    const hexNum = decodeLittleEndianHexToUint32(rawVal);
    if (hexNum !== undefined && hexNum > 1000000000) {
      const date = new Date(hexNum * 1000).toUTCString();
      return { displayVal: date, rawVal: `hex: ${rawVal}` };
    }
  }

  // Quality
  if (cleanLabel === "quality") {
    const num = parseInt(rawVal, 10);
    if (!isNaN(num) && QUALITY_NAMES[num]) {
      return { displayVal: QUALITY_NAMES[num]!, rawVal: `quality: ${num}` };
    }
  }

  // Rarity
  if (cleanLabel === "rarity") {
    const num = parseInt(rawVal, 10);
    if (!isNaN(num) && RARITY_NAMES[num]) {
      return { displayVal: RARITY_NAMES[num]!, rawVal: `rarity: ${num}` };
    }
  }

  // Active terminal / X-Ray inventory slot
  if (cleanLabel === "inventory" && rawVal.includes("3221225477")) {
    return {
      displayVal: "Active Terminal / X-Ray Slot (0xc0000005)",
      rawVal: `raw: ${rawVal}`,
    };
  }

  return { displayVal: rawVal };
}

function DiagnosticCard(props: { diagnostic: string }) {
  const parsed = createMemo(() => parseDiagnosticLine(props.diagnostic));
  return (
    <details
      open
      class="mt-2 rounded-xl border border-slate-800 bg-slate-950/80 p-3 text-xs"
    >
      <summary class="cursor-pointer font-semibold text-cyan-300">
        {parsed().title}
      </summary>
      <div class="mt-2 grid gap-1.5 sm:grid-cols-2">
        <For each={parsed().entries}>
          {(entry) => {
            const decoded = createMemo(() =>
              formatDecodedDiagnosticEntry(entry.label, entry.value),
            );
            return (
              <div class="flex flex-col rounded-lg bg-slate-900/60 p-2">
                <span class="text-[10px] font-semibold uppercase tracking-wider text-slate-400">
                  {entry.label}
                </span>
                <span class="mt-0.5 font-mono text-emerald-300 font-medium break-all">
                  {decoded().displayVal}
                </span>
                <Show when={decoded().rawVal}>
                  <span class="mt-0.5 font-mono text-[10px] text-slate-500 break-all">
                    {decoded().rawVal}
                  </span>
                </Show>
              </div>
            );
          }}
        </For>
      </div>
    </details>
  );
}

export function DiagnosticsPanel(props: DiagnosticsPanelProps) {
  const debugContent =
    props.inventoryDebugEnabled && props.selected.debug ? (
      <DebugBlock debug={props.selected.debug} />
    ) : null;

  return (
    <details class="rounded-2xl border border-slate-800/80 p-3 text-sm text-slate-400">
      <summary class="cursor-pointer font-medium text-slate-200">
        Diagnostics
      </summary>
      <div class="mt-3 space-y-2 text-xs">
        <p class="font-mono text-slate-300">Item ID: {props.selected.id}</p>
        <Show when={props.selected.kind === "unknown"}>
          <p class="font-mono text-amber-300">Kind: unsupported/unknown</p>
        </Show>
        <Show when={props.selected.unsupportedFields?.length}>
          <p class="font-mono text-amber-300">
            Unsupported fields: {props.selected.unsupportedFields?.join(", ")}
          </p>
        </Show>
        <For each={props.selected.diagnostics}>
          {(diagnostic) => <DiagnosticCard diagnostic={diagnostic} />}
        </For>
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
      <div class="grid gap-2 sm:grid-cols-2">
        <For each={props.items}>
          {(item) => (
            <RelatedItemPreview
              item={item}
              context={props.dialogContext}
              probability={
                props.context === "container" ? odds.get(item) : undefined
              }
              onRequestMarketPreview={props.onMarketPreview}
            />
          )}
        </For>
      </div>
    </div>
  );
}
