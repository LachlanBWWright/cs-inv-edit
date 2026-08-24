import { createSignal, For, Show } from "solid-js";
import type {
  PriceHistoryResult,
  PriceScanResult,
  PriceSearchResult,
} from "@cs-inv-edit/contracts";
import { fromAppPromise } from "../../shared/lib/result.js";
import { Button } from "../../shared/ui/Button.js";
import { Input } from "../../shared/ui/Input.js";
import { VendorPricePreview } from "./VendorPricePreview.js";

export function PriceAnalysisView(props: {
  onSearchPrices: (
    query: string,
    appId?: number,
  ) => Promise<PriceSearchResult | undefined>;
  onScanPrices: (
    marketNames: string[],
    appId?: number,
  ) => Promise<PriceScanResult | undefined>;
  onLoadHistory: (
    marketName: string,
    currency: string,
    appId: number,
  ) => Promise<PriceHistoryResult | undefined>;
  initialItems?: PriceSearchResult["items"];
  initialResult?: PriceScanResult;
  initialHistory?: PriceHistoryResult;
  initialMarketName?: string;
}) {
  const [searchQuery, setSearchQuery] = createSignal("");
  const [appId, setAppId] = createSignal(730);
  const [items, setItems] = createSignal(props.initialItems ?? []);
  const [selected, setSelected] = createSignal(
    props.initialMarketName ?? props.initialResult?.items[0]?.marketName ?? "",
  );
  const [result, setResult] = createSignal<PriceScanResult>();
  const [history, setHistory] = createSignal<PriceHistoryResult>();
  const [loading, setLoading] = createSignal(false);
  const [searching, setSearching] = createSignal(false);
  const [message, setMessage] = createSignal("");
  if (props.initialResult) setResult(props.initialResult);
  if (props.initialHistory) setHistory(props.initialHistory);

  const loadItem = (marketName: string) => {
    setSelected(marketName);
    setLoading(true);
    setMessage("");
    setResult(undefined);
    setHistory(undefined);
    void Promise.all([
      fromAppPromise(
        props.onScanPrices([marketName], appId()),
        "Price lookup failed",
      ).match(
        (next) => {
          if (next) setResult(next);
        },
        (error) => setMessage(error.message),
      ),
      fromAppPromise(
        props.onLoadHistory(marketName, "USD", appId()),
        "Price history lookup failed",
      ).match(
        (next) => {
          if (next) setHistory(next);
        },
        (error) => setMessage(error.message),
      ),
    ]).finally(() => setLoading(false));
  };

  const search = () => {
    const query = searchQuery().trim();
    if (!query) return;
    setSearching(true);
    setMessage("");
    void fromAppPromise(
      props.onSearchPrices(query, appId()),
      "Item search failed",
    )
      .match(
        (next) => {
          setItems(next?.items ?? []);
          setSelected("");
          setResult(undefined);
          setHistory(undefined);
        },
        (error) => setMessage(error.message),
      )
      .finally(() => setSearching(false));
  };

  return (
    <div class="mx-auto w-full max-w-6xl space-y-5">
      <header class="flex flex-wrap items-center justify-between gap-3">
        <h1 class="text-3xl font-semibold text-slate-50">Price analysis</h1>
        <label class="flex items-center gap-2 text-sm text-slate-400">
          Game
          <select
            class="h-9 rounded-lg border border-slate-700 bg-slate-900 px-2 text-sm text-slate-200"
            value={appId()}
            onChange={(event) => setAppId(Number(event.currentTarget.value))}
          >
            <option value="730">CS2</option>
            <option value="440">TF2</option>
            <option value="570">Dota 2</option>
            <option value="753">Steam Community</option>
          </select>
        </label>
      </header>

      <form
        class="flex gap-2 border-b border-slate-800 pb-4"
        onSubmit={(event) => {
          event.preventDefault();
          search();
        }}
      >
        <Input
          class="min-w-0 flex-1"
          aria-label="Search market items"
          placeholder="Search market items"
          value={searchQuery()}
          onInput={(event) => setSearchQuery(event.currentTarget.value)}
        />
        <Button type="submit" disabled={searching()}>
          {searching() ? "Searching…" : "Search"}
        </Button>
      </form>

      <Show when={message()}>
        <p class="text-sm text-amber-300" role="alert">
          {message()}
        </p>
      </Show>

      <Show when={items().length > 0}>
        <section>
          <div class="mb-2 flex items-center justify-between">
            <h2 class="text-sm font-semibold text-slate-300">Items</h2>
            <span class="text-xs text-slate-500">{items().length} results</span>
          </div>
          <div class="grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-6">
            <For each={items()}>
              {(item) => (
                <button
                  class={`flex min-h-32 flex-col justify-between border p-2 text-left transition ${selected() === item.marketName ? "border-cyan-400 bg-cyan-950/30" : "border-slate-800 bg-slate-950 hover:border-slate-600"}`}
                  onClick={() => loadItem(item.marketName)}
                >
                  <Show when={item.imageUrl}>
                    <img
                      class="h-16 w-full object-contain"
                      src={item.imageUrl}
                      alt=""
                      loading="lazy"
                    />
                  </Show>
                  <span class="line-clamp-3 text-xs text-slate-200">
                    {item.name || item.marketName}
                  </span>
                </button>
              )}
            </For>
          </div>
        </section>
      </Show>

      <Show
        when={selected()}
        fallback={
          <p class="py-8 text-center text-sm text-slate-500">
            Search for an item, then select it to compare prices.
          </p>
        }
      >
        {(marketName) => (
          <>
            <section class="border-t border-slate-800 pt-4">
              <div class="mb-1 flex items-center justify-between gap-3">
                <h2 class="truncate text-lg font-semibold text-slate-100">
                  {marketName()}
                </h2>
                <Show when={loading()}>
                  <span class="text-xs text-cyan-300">Updating…</span>
                </Show>
              </div>
              <VendorPricePreview
                appId={appId()}
                marketName={marketName()}
                result={result()}
                loading={loading()}
                appearance="plain"
              />
            </section>
            <section class="border-t border-slate-800 pt-4">
              <div class="flex items-center justify-between gap-3">
                <h2 class="text-lg font-semibold text-slate-100">History</h2>
                <Show when={history()?.baselineSource}>
                  <span class="text-xs text-slate-500">
                    Baseline: {history()?.baselineSource}
                  </span>
                </Show>
              </div>
              <Show
                when={history()?.observations.length}
                fallback={
                  <p class="py-4 text-sm text-slate-500">
                    No stored observations yet.
                  </p>
                }
              >
                <div class="divide-y divide-slate-800">
                  <For each={history()?.observations ?? []}>
                    {(quote) => (
                      <div class="flex flex-wrap justify-between gap-2 py-2 text-sm">
                        <time
                          class="text-slate-500"
                          dateTime={quote.observedAt}
                        >
                          {formatTimestamp(quote.observedAt)}
                        </time>
                        <span class="text-slate-200">
                          {quote.source}:{" "}
                          {quote.adjustedDisplayPrice ?? quote.displayPrice}
                        </span>
                      </div>
                    )}
                  </For>
                </div>
              </Show>
            </section>
          </>
        )}
      </Show>
    </div>
  );
}

function formatTimestamp(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}
