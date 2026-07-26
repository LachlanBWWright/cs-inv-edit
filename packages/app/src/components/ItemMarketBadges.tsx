import { Show, createSignal, onCleanup } from "solid-js";

export interface MarketBadgeItem {
  name: string;
  marketName?: string;
  marketPrice?: string;
  tradable?: boolean;
  marketable?: boolean;
  tradableAfter?: string;
}

export function formatUSDMinor(amountMinor: number | undefined) {
  return `$${((amountMinor ?? 0) / 100).toFixed(2)}`;
}

export function tradeRestrictionLabel(item: MarketBadgeItem, now = Date.now()) {
  if (item.tradableAfter) {
    const remaining = Date.parse(item.tradableAfter) - now;
    if (Number.isFinite(remaining) && remaining > 0)
      return `${Math.ceil(remaining / 3_600_000)}H`;
    return "";
  }
  if (item.tradable === false || item.marketable === false) return "×";
  return item.tradable === true ? "✓" : "";
}

export function marketPriceLabel(
  item: MarketBadgeItem,
  amountMinor: number | undefined,
) {
  if (item.marketable === false) return undefined;
  if (item.marketPrice && /[1-9]/.test(item.marketPrice))
    return item.marketPrice;
  return amountMinor !== undefined && amountMinor > 0
    ? formatUSDMinor(amountMinor)
    : undefined;
}

export function tradeStateDescription(item: MarketBadgeItem, now = Date.now()) {
  const unlockAt = item.tradableAfter;
  const tradeState =
    unlockAt && Date.parse(unlockAt) > now
      ? `Trade locked until ${new Date(unlockAt).toLocaleString()}`
      : item.tradable === false
        ? "Permanently untradable"
        : item.tradable === true
          ? "Tradable"
          : "Tradeability unknown";
  const marketState =
    item.marketable === false
      ? "Unmarketable"
      : item.marketable === true
        ? "Marketable"
        : "Marketability unknown";
  return `${tradeState} · ${marketState}`;
}

export function ItemMarketBadges(props: {
  item: MarketBadgeItem;
  priceMinor?: number;
}) {
  const [now, setNow] = createSignal(Date.now());
  const timer = window.setInterval(() => setNow(Date.now()), 60_000);
  onCleanup(() => window.clearInterval(timer));
  const tradeStatus = () => tradeRestrictionLabel(props.item, now());
  const price = () => marketPriceLabel(props.item, props.priceMinor);
  const statusClasses = () =>
    tradeStatus() === "✓"
      ? "border-emerald-400/50 text-emerald-300"
      : tradeStatus() === "×"
        ? "border-rose-400/50 text-rose-300"
        : "border-amber-400/50 text-amber-200";

  return (
    <>
      <Show when={price()}>
        {(label) => (
          <span
            class="pointer-events-none absolute left-2 top-2 z-20 rounded-md border border-emerald-400/35 bg-slate-950/90 px-1.5 py-0.5 text-[10px] font-bold tabular-nums text-emerald-200 shadow-lg backdrop-blur"
            aria-label={`Steam Market price ${label()}`}
          >
            {label()}
          </span>
        )}
      </Show>
      <Show when={tradeStatus()}>
        {(label) => (
          <span
            class={`pointer-events-none absolute right-2 top-2 z-20 min-w-6 rounded-md border bg-slate-950/90 px-1.5 py-0.5 text-center text-[10px] font-bold uppercase shadow-lg backdrop-blur ${statusClasses()}`}
            aria-label={
              label() === "✓"
                ? "Tradable"
                : label() === "×"
                  ? "Permanently untradable or unmarketable"
                  : `Trade locked for approximately ${label()}`
            }
            title={
              props.item.tradableAfter
                ? `Tradable after ${new Date(props.item.tradableAfter).toLocaleString()}`
                : label() === "✓"
                  ? "Tradable"
                  : "Permanently untradable or unmarketable"
            }
          >
            {label()}
          </span>
        )}
      </Show>
    </>
  );
}
