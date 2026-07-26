import { Show, createSignal, onCleanup } from "solid-js";
import type { InventoryItemDto } from "@cs-inv-edit/contracts";

function remainingLabel(until: string | undefined, now: number) {
  const remaining = until ? Date.parse(until) - now : 0;
  if (!Number.isFinite(remaining) || remaining <= 0) return "";
  const hours = Math.ceil(remaining / 3_600_000);
  const days = Math.floor(hours / 24);
  return days > 0 ? `${days}d ${hours % 24}h` : `${hours}h`;
}

export function TradeLockIndicator(props: { item: InventoryItemDto }) {
  const [now, setNow] = createSignal(Date.now());
  const timer = window.setInterval(() => setNow(Date.now()), 60_000);
  onCleanup(() => window.clearInterval(timer));
  const remaining = () => remainingLabel(props.item.tradableAfter, now());
  const isTradeLocked = () =>
    props.item.tradable === false || !!props.item.tradableAfter;

  return (
    <Show when={isTradeLocked()}>
      <span
        class="pointer-events-none absolute right-2 top-2 z-20 rounded-md border border-rose-400/50 bg-slate-950 px-1.5 py-0.5 text-[10px] font-bold text-rose-300 shadow-lg"
        aria-label={
          props.item.tradableAfter
            ? `Trade locked until ${new Date(props.item.tradableAfter).toLocaleString()}`
            : "Not tradable"
        }
        title={
          props.item.tradableAfter
            ? `Tradable after ${new Date(props.item.tradableAfter).toLocaleString()}`
            : "Not tradable"
        }
      >
        {remaining() || "×"}
      </span>
    </Show>
  );
}
