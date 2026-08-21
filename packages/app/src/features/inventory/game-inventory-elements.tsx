import { For, Show } from "solid-js";
import {
  readStoredJson,
  stringArraySchema,
  writeStoredJson,
} from "../../shared/lib/storage.js";
import type {
  EconomyInventoryItemDto,
  PriceScanResult,
} from "@cs-inv-edit/contracts";

export const readTF2DismissedActivity = (steamId: string) =>
  readStoredJson(`tf2.activity.dismissed.${steamId}`, stringArraySchema);
export const writeTF2DismissedActivity = (input: {
  steamId: string;
  ids: string[];
}) => writeStoredJson(`tf2.activity.dismissed.${input.steamId}`, input.ids);
import { ItemPreviewMedia } from "./ItemPreviewMedia.js";

export function marketUrl(item: EconomyInventoryItemDto) {
  return `https://steamcommunity.com/market/listings/${item.appId}/${encodeURIComponent(item.marketName ?? "")}`;
}

export function ItemImage(props: {
  item: EconomyInventoryItemDto;
  large?: boolean;
  card?: boolean;
}) {
  return (
    <ItemPreviewMedia
      name={props.item.name}
      imageUrl={props.item.imageUrl}
      variant={
        props.large ? "details" : props.card ? "inventory-card" : "economy-card"
      }
    />
  );
}

function DecodedAttributeRow(props: {
  attribute: NonNullable<
    Extract<
      EconomyInventoryItemDto,
      { game: "tf2" }
    >["details"]["decodedAttributes"]
  >[number];
}) {
  return (
    <div class="grid grid-cols-[minmax(0,1fr)_auto] gap-3">
      <dt>
        <span class="text-slate-200">{props.attribute.name}</span>
        <span class="ml-1 font-mono text-[10px] text-slate-600">
          #{props.attribute.defIndex}
        </span>
        <Show when={props.attribute.hidden}>
          <span class="ml-1 text-[10px] uppercase text-slate-600">hidden</span>
        </Show>
      </dt>
      <dd class="max-w-64 break-words text-right font-medium text-cyan-100">
        {props.attribute.value}
      </dd>
    </div>
  );
}

function DecodedAttributes(props: {
  attributes: NonNullable<
    Extract<
      EconomyInventoryItemDto,
      { game: "tf2" }
    >["details"]["decodedAttributes"]
  >;
}) {
  return (
    <For each={props.attributes}>
      {(attribute) => <DecodedAttributeRow attribute={attribute} />}
    </For>
  );
}

function AttributeValueList(props: {
  label: string;
  entries: Array<[string, unknown]>;
}) {
  return (
    <div>
      <p class="mb-1 text-slate-500">{props.label}</p>
      <For each={props.entries}>
        {([id, value]) => (
          <p class="flex justify-between gap-3">
            <span>{id}</span>
            <span>{String(value)}</span>
          </p>
        )}
      </For>
    </div>
  );
}

export function TF2ItemDiagnostics(props: {
  item: Extract<EconomyInventoryItemDto, { game: "tf2" }>;
}) {
  const details = () => props.item.details;
  return (
    <details class="rounded-2xl border border-slate-800/80 p-3 text-sm text-slate-400">
      <summary class="cursor-pointer font-medium text-slate-200">
        Item diagnostics
      </summary>
      <div class="mt-3 space-y-3">
        <div class="grid gap-1 font-mono text-xs">
          <p>GC item ID: {props.item.assetId}</p>
          <p>Definition index: {props.item.definitionId ?? "unknown"}</p>
          <p>Inventory position: {details().inventoryPosition}</p>
          <p>Quality ID: {details().qualityId}</p>
          <p>Origin ID: {details().originId}</p>
          <p>Flags: {details().flags}</p>
        </div>
        <Show when={details().decodedAttributes?.length}>
          <section class="border-t border-slate-800 pt-3">
            <h4 class="font-medium text-slate-200">Decoded attributes</h4>
            <dl class="mt-2 space-y-2">
              <DecodedAttributes attributes={details().decodedAttributes!} />
            </dl>
          </section>
        </Show>
        <details class="border-t border-slate-800 pt-3">
          <summary class="cursor-pointer text-xs font-medium text-slate-400">
            Raw GC attribute payloads
          </summary>
          <div class="mt-2 grid gap-3 font-mono text-xs">
            <Show when={Object.keys(details().attributes).length}>
              <AttributeValueList
                label="32-bit values"
                entries={Object.entries(details().attributes)}
              />
            </Show>
            <Show when={Object.keys(details().attributeBytes ?? {}).length}>
              <AttributeValueList
                label="Binary values"
                entries={Object.entries(details().attributeBytes ?? {})}
              />
            </Show>
          </div>
        </details>
      </div>
    </details>
  );
}

function PriceQuoteRow(props: {
  quote: PriceScanResult["items"][number]["quotes"][number];
}) {
  return (
    <p class="mt-2 text-xs">
      <span class="text-slate-200">{props.quote.source}</span>:{" "}
      {props.quote.displayPrice || "no display price"}
      <Show when={props.quote.listingCount !== undefined}>
        {" · "}
        {props.quote.listingCount} listings
      </Show>
    </p>
  );
}

function PriceErrorRow(props: { error: PriceScanResult["errors"][number] }) {
  return (
    <p class="mt-2 break-words text-xs text-amber-300">
      {props.error.source}: {props.error.message}
    </p>
  );
}

export function SteamItemDiagnostics(props: {
  item: Extract<EconomyInventoryItemDto, { game: "steam" }>;
  priceScan?: PriceScanResult;
  priceScanLoading: boolean;
}) {
  const quotes = () =>
    props.priceScan?.items.find(
      (entry) => entry.marketName === props.item.marketName,
    )?.quotes ?? [];
  return (
    <details class="rounded-2xl border border-slate-800/80 p-3 text-sm text-slate-400">
      <summary class="cursor-pointer font-medium text-slate-200">
        Item diagnostics
      </summary>
      <div class="mt-3 space-y-3">
        <div class="grid gap-1 font-mono text-xs">
          <p>App ID: {props.item.appId}</p>
          <p>Context ID: {props.item.contextId ?? "unknown"}</p>
          <p>Asset ID: {props.item.assetId}</p>
          <p>Class ID: {props.item.classId ?? "unknown"}</p>
          <p>Instance ID: {props.item.instanceId ?? "unknown"}</p>
          <p>Market hash name: {props.item.marketName ?? "missing"}</p>
          <p>Marketable: {String(props.item.marketable)}</p>
          <p>Tradable: {String(props.item.tradable)}</p>
        </div>
        <section class="border-t border-slate-800 pt-3">
          <h4 class="font-medium text-slate-200">Steam Market lookup</h4>
          <Show when={props.priceScanLoading}>
            <p class="mt-2 text-sky-300">Request in progress…</p>
          </Show>
          <Show when={!props.priceScanLoading && !props.item.marketName}>
            <p class="mt-2 text-amber-300">
              No market hash name was supplied by the Steam item description.
            </p>
          </Show>
          <Show
            when={
              !props.priceScanLoading &&
              props.item.marketName &&
              !props.item.marketable
            }
          >
            <p class="mt-2 text-slate-500">
              Lookup skipped because Steam marks this item as non-marketable.
            </p>
          </Show>
          <Show when={props.priceScan?.scannedAt}>
            <p class="mt-2 font-mono text-xs">
              Scanned: {props.priceScan?.scannedAt}
            </p>
          </Show>
          <For each={quotes()}>
            {(quote) => <PriceQuoteRow quote={quote} />}
          </For>
          <For each={props.priceScan?.errors ?? []}>
            {(error) => <PriceErrorRow error={error} />}
          </For>
          <Show
            when={
              !props.priceScanLoading &&
              props.priceScan &&
              quotes().length === 0 &&
              props.priceScan.errors.length === 0
            }
          >
            <p class="mt-2 text-xs text-slate-500">
              Steam returned no active listing for this exact market hash name.
            </p>
          </Show>
        </section>
      </div>
    </details>
  );
}
