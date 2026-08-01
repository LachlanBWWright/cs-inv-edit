import { For, Show } from "solid-js";
import { formatFloat } from "../item-instance-utils.js";

const wearRanges = [
  {
    name: "Factory New",
    short: "FN",
    min: 0,
    max: 0.07,
    color: "wear-color-factory-new",
  },
  {
    name: "Minimal Wear",
    short: "MW",
    min: 0.07,
    max: 0.15,
    color: "wear-color-minimal-wear",
  },
  {
    name: "Field-Tested",
    short: "FT",
    min: 0.15,
    max: 0.38,
    color: "wear-color-field-tested",
  },
  {
    name: "Well-Worn",
    short: "WW",
    min: 0.38,
    max: 0.45,
    color: "wear-color-well-worn",
  },
  {
    name: "Battle-Scarred",
    short: "BS",
    min: 0.45,
    max: 1,
    color: "wear-color-battle-scarred",
  },
] as const;

export function WearRangeBar(props: {
  wear?: number;
  min?: number;
  max?: number;
  compact?: boolean;
}) {
  const clamp = (value: number) => Math.max(0, Math.min(1, value));
  const wear = () => clamp(props.wear ?? 0);
  const min = () => clamp(props.min ?? 0);
  const max = () => clamp(props.max ?? 1);

  return (
    <div
      class={
        props.compact
          ? "w-full px-1"
          : "rounded-2xl border border-slate-800/80 bg-slate-900 p-4"
      }
    >
      <Show when={!props.compact}>
        <div class="flex items-baseline justify-between gap-3">
          <p class="text-xs font-medium uppercase tracking-wide text-slate-400">
            Finish wear range
          </p>
          <Show when={props.wear !== undefined}>
            <p class="font-mono text-xs text-slate-300">
              {formatFloat(props.wear!)}
            </p>
          </Show>
        </div>
      </Show>
      <div
        class={
          props.compact
            ? `relative ${props.wear === undefined ? "mt-1" : "mt-4"}`
            : "relative mt-7"
        }
      >
        <Show when={props.wear !== undefined}>
          <div
            class="absolute -top-4 -translate-x-1/2 text-cyan-200"
            style={{ left: `${wear() * 100}%` }}
            aria-label={`Current wear ${formatFloat(props.wear!)}`}
          >
            <span class="block text-center text-[10px] leading-none">▼</span>
          </div>
        </Show>
        <div
          class={`relative flex ${props.compact ? "h-2" : "h-4"} overflow-hidden rounded border border-slate-700`}
        >
          <For each={wearRanges}>
            {(range) => (
              <div
                class={`${range.color} border-r border-slate-950/40 last:border-r-0`}
                style={{ width: `${(range.max - range.min) * 100}%` }}
                title={`${range.name}: ${range.min.toFixed(2)}–${range.max.toFixed(2)}`}
              />
            )}
          </For>
          <Show when={min() > 0}>
            <div
              class="wear-color-impossible absolute inset-y-0 left-0"
              style={{ width: `${min() * 100}%` }}
              title={`Impossible below ${min().toFixed(2)}`}
            />
          </Show>
          <Show when={max() < 1}>
            <div
              class="wear-color-impossible absolute inset-y-0 right-0"
              style={{ width: `${(1 - max()) * 100}%` }}
              title={`Impossible above ${max().toFixed(2)}`}
            />
          </Show>
        </div>
        <Show when={!props.compact}>
          <div class="mt-2 flex text-[9px] font-medium text-slate-400">
            <For each={wearRanges}>
              {(range) => (
                <div
                  class="text-center"
                  style={{ width: `${(range.max - range.min) * 100}%` }}
                  title={range.name}
                >
                  {range.short}
                </div>
              )}
            </For>
          </div>
          <div class="mt-1 flex justify-between font-mono text-[9px] text-slate-500">
            <span>0.00</span>
            <span>1.00</span>
          </div>
          <Show when={min() > 0 || max() < 1}>
            <p class="mt-2 text-xs text-slate-500">
              This finish can only exist from {min().toFixed(2)} to{" "}
              {max().toFixed(2)}; grey regions are impossible.
            </p>
          </Show>
        </Show>
      </div>
    </div>
  );
}
