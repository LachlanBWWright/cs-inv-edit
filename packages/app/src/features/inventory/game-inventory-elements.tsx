import { For, Show } from "solid-js";
import { fromThrowable } from "neverthrow";
import type {
  EconomyInventoryItemDto,
  PriceScanResult,
} from "@cs-inv-edit/contracts";

export const readTF2DismissedActivity = fromThrowable(
  (steamId: string): string[] =>
    JSON.parse(
      globalThis.localStorage.getItem(`tf2.activity.dismissed.${steamId}`) ??
        "[]",
    ),
  () => [] as string[],
);
export const writeTF2DismissedActivity = fromThrowable(
  (input: { steamId: string; ids: string[] }) =>
    globalThis.localStorage.setItem(
      `tf2.activity.dismissed.${input.steamId}`,
      JSON.stringify(input.ids),
    ),
  () => undefined,
);
import { ItemPreviewMedia } from "./ItemPreviewMedia.js";

export function marketURL(item: EconomyInventoryItemDto) {
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
              <For each={details().decodedAttributes}>
                {(attribute) => (
                  <div class="grid grid-cols-[minmax(0,1fr)_auto] gap-3">
                    <dt>
                      <span class="text-slate-200">{attribute.name}</span>
                      <span class="ml-1 font-mono text-[10px] text-slate-600">
                        #{attribute.defIndex}
                      </span>
                      <Show when={attribute.hidden}>
                        <span class="ml-1 text-[10px] uppercase text-slate-600">
                          hidden
                        </span>
                      </Show>
                    </dt>
                    <dd class="max-w-64 break-words text-right font-medium text-cyan-100">
                      {attribute.value}
                    </dd>
                  </div>
                )}
              </For>
            </dl>
          </section>
        </Show>
        <details class="border-t border-slate-800 pt-3">
          <summary class="cursor-pointer text-xs font-medium text-slate-400">
            Raw GC attribute payloads
          </summary>
          <div class="mt-2 grid gap-3 font-mono text-xs">
            <Show when={Object.keys(details().attributes).length}>
              <div>
                <p class="mb-1 text-slate-500">32-bit values</p>
                <For each={Object.entries(details().attributes)}>
                  {([id, value]) => (
                    <p class="flex justify-between gap-3">
                      <span>{id}</span>
                      <span>{value}</span>
                    </p>
                  )}
                </For>
              </div>
            </Show>
            <Show when={Object.keys(details().attributeBytes ?? {}).length}>
              <div>
                <p class="mb-1 text-slate-500">Binary values</p>
                <For each={Object.entries(details().attributeBytes ?? {})}>
                  {([id, value]) => (
                    <p class="grid grid-cols-[auto_1fr] gap-3">
                      <span>{id}</span>
                      <span class="break-all text-right">{value}</span>
                    </p>
                  )}
                </For>
              </div>
            </Show>
          </div>
        </details>
      </div>
    </details>
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
            {(quote) => (
              <p class="mt-2 text-xs">
                <span class="text-slate-200">{quote.source}</span>:{" "}
                {quote.displayPrice || "no display price"}
                <Show when={quote.listingCount !== undefined}>
                  {" "}
                  · {quote.listingCount} listings
                </Show>
              </p>
            )}
          </For>
          <For each={props.priceScan?.errors ?? []}>
            {(error) => (
              <p class="mt-2 break-words text-xs text-amber-300">
                {error.source}: {error.message}
              </p>
            )}
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
