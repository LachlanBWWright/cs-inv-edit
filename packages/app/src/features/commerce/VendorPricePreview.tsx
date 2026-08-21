import { For, Show } from "solid-js";
import type { PriceQuoteDto, PriceScanResult } from "@cs-inv-edit/contracts";

const vendorsByAppId: Record<
  number,
  ReadonlyArray<{ id: string; label: string }>
> = {
  730: [
    { id: "steam", label: "Steam Community Market" },
    { id: "skinport", label: "Skinport" },
    { id: "csfloat", label: "CSFloat" },
    { id: "waxpeer", label: "Waxpeer" },
    { id: "marketcsgo", label: "Market.CSGO" },
  ],
  440: [
    { id: "steam", label: "Steam Community Market" },
    { id: "skinport", label: "Skinport" },
    { id: "waxpeer", label: "Waxpeer" },
    { id: "backpacktf", label: "Backpack.tf guide" },
  ],
  570: [
    { id: "steam", label: "Steam Community Market" },
    { id: "skinport", label: "Skinport" },
    { id: "marketdota", label: "Market.Dota2.net" },
  ],
};

export function vendorIdsForAppId(appId: number) {
  return (
    vendorsByAppId[appId] ?? [{ id: "steam", label: "Steam Community Market" }]
  ).map((vendor) => vendor.id);
}

export function priceFreshnessLabel(result: PriceScanResult | undefined) {
  return result?.cacheState === "stale" ? "Last known prices" : undefined;
}

function VendorQuote(props: { quote: PriceQuoteDto }) {
  const price = () =>
    props.quote.adjustedDisplayPrice || props.quote.displayPrice;
  return (
    <Show
      when={props.quote.url}
      fallback={<span class="font-semibold text-slate-100">{price()}</span>}
    >
      <a
        class="font-semibold text-sky-300 hover:text-sky-200"
        href={props.quote.url}
        target="_blank"
        rel="noreferrer"
      >
        {price()}
      </a>
    </Show>
  );
}

function LoadingRow() {
  return (
    <span
      class="h-4 w-20 animate-pulse rounded bg-slate-700"
      aria-hidden="true"
    />
  );
}

function EmptyRow(props: { error?: string }) {
  return (
    <span class="max-w-40 truncate text-xs text-slate-500" title={props.error}>
      {props.error ? "Unavailable" : "No listing"}
    </span>
  );
}

function PriceFreshness(props: { result?: PriceScanResult }) {
  return (
    <Show when={priceFreshnessLabel(props.result)}>
      {(label) => (
        <span
          class="text-xs font-medium text-amber-300"
          title="The shared data service could not refresh these observations."
        >
          {label()}
        </span>
      )}
    </Show>
  );
}

function VendorRow(props: {
  label: string;
  quote?: PriceQuoteDto;
  error?: string;
  loading: boolean;
}) {
  const rowContent = () => {
    if (props.loading) return <LoadingRow />;
    if (!props.quote) return <EmptyRow error={props.error} />;

    return (
      <span class="text-right">
        <VendorQuote quote={props.quote} />
        <Show when={props.quote.listingCount !== undefined}>
          <span class="ml-2 text-xs text-slate-500">
            {props.quote.listingCount} listings
          </span>
        </Show>
      </span>
    );
  };

  return (
    <div class="flex items-center justify-between gap-3 py-2 text-sm">
      <span class="text-slate-300">{props.label}</span>
      {rowContent()}
    </div>
  );
}

export function VendorPricePreview(props: {
  appId: number;
  marketName?: string;
  marketable?: boolean;
  result?: PriceScanResult;
  loading: boolean;
  appearance?: "card" | "plain";
}) {
  const vendors = () =>
    vendorsByAppId[props.appId] ?? [
      { id: "steam", label: "Steam Community Market" },
    ];
  const quotes = () =>
    props.result?.items.find((item) => item.marketName === props.marketName)
      ?.quotes ?? [];
  const errorFor = (source: string) =>
    props.result?.errors.find((error) => error.source === source)?.message;
  const quoteFor = (source: string) =>
    quotes().find((candidate) => candidate.source === source);
  const renderVendor = (vendor: { id: string; label: string }) => (
    <VendorRow
      label={vendor.label}
      quote={quoteFor(vendor.id)}
      error={errorFor(vendor.id)}
      loading={props.loading}
    />
  );
  return (
    <Show when={props.marketName}>
      <section
        class={
          props.appearance === "plain"
            ? "py-4"
            : "rounded-2xl border border-slate-800/80 bg-slate-900 p-3"
        }
        aria-label="Vendor prices"
        aria-busy={props.loading}
      >
        <div class="flex items-center justify-between gap-3">
          <h4 class="text-xs font-semibold uppercase tracking-wide text-slate-400">
            Market prices
          </h4>
          <Show
            when={props.loading}
            fallback={<PriceFreshness result={props.result} />}
          >
            <span
              class="inline-flex items-center gap-2 text-xs font-medium text-sky-300"
              role="status"
            >
              <span class="h-2 w-2 animate-pulse rounded-full bg-sky-400" />
              Loading vendor prices…
            </span>
          </Show>
        </div>
        <div class="mt-2 divide-y divide-slate-800">
          <For each={vendors()}>{renderVendor}</For>
        </div>
      </section>
    </Show>
  );
}
