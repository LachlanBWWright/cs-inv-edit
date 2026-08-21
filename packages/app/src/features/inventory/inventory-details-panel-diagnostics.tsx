import { createMemo, For, Show } from "solid-js";
import type { InventoryItemDto, RelatedItemDto } from "@cs-inv-edit/contracts";
import {
  RelatedItemPreview,
  type RelatedItemPreviewContext,
} from "./RelatedItemPreview.js";
import { containerItemOdds } from "./related-item-preview-utils.js";

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
    const pairRegex = /([#a-zA-Z0-9_-]+)=([^\s,]+)/g;
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
  const kvRegex = /([#a-zA-Z0-9_-]+)=(?:"([^"]*)"|([^\s,]+))/g;
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
      class="mt-2 rounded-xl border border-slate-800 bg-slate-950 p-3 text-xs"
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
              <div class="flex flex-col rounded-lg bg-slate-900 p-2">
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
  context: import("../../shared/ui-types.js").RelatedItemPreviewContext | undefined;
  onClose: () => void;
  onMarketPreview: (marketName: string) => Promise<RelatedItemDto | undefined>;
}

export function ContentsDialog(props: ContentsDialogProps) {
  const odds = containerItemOdds(props.items ?? []);
  return (
    <div class="rounded-xl border border-cyan-900/60 bg-cyan-950 p-3 text-xs leading-relaxed text-slate-400">
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
