import { Show } from "solid-js";
import type { ReturnEstimate } from "./roi-utils.js";
import { formatUSDMinor } from "./roi-utils.js";

export function ReturnEstimateCard(props: {
  estimate?: ReturnEstimate;
  loading?: boolean;
  costLabel?: string;
  unitCost?: number;
  note?: string;
}) {
  return (
    <section
      class="rounded-xl border border-emerald-500/25 bg-emerald-950/15 p-3"
      aria-label="Return on investment estimate"
      aria-busy={props.loading}
    >
      <div class="flex items-center justify-between gap-3">
        <h4 class="text-xs font-semibold uppercase tracking-wide text-emerald-300">
          Expected return
        </h4>
        <Show when={props.loading}>
          <span class="animate-pulse text-xs text-sky-300">
            Loading prices…
          </span>
        </Show>
      </div>
      <Show
        when={props.estimate}
        fallback={
          <p class="mt-2 text-xs text-slate-500">
            Market prices are not available for this preview.
          </p>
        }
      >
        {(estimate) => (
          <div class="mt-2 grid grid-cols-2 gap-2 text-sm">
            <div>
              <p class="text-xs text-slate-500">Expected value</p>
              <p class="font-semibold text-slate-100">
                {formatUSDMinor(estimate().expectedValueMinor)}
              </p>
            </div>
            <Show when={estimate().costMinor !== undefined}>
              <div>
                <p class="text-xs text-slate-500">
                  {props.costLabel ?? "Estimated cost"}
                </p>
                <p class="font-semibold text-slate-100">
                  {formatUSDMinor(estimate().costMinor!)}
                </p>
              </div>
            </Show>
            <Show when={estimate().roiPercent !== undefined}>
              <div>
                <p class="text-xs text-slate-500">Expected ROI</p>
                <p
                  class={`font-semibold ${estimate().roiPercent! >= 0 ? "text-emerald-300" : "text-rose-300"}`}
                >
                  {estimate().roiPercent! >= 0 ? "+" : ""}
                  {estimate().roiPercent!.toFixed(1)}%
                </p>
              </div>
            </Show>
            <Show when={props.unitCost && props.unitCost! > 0}>
              <div>
                <p class="text-xs text-slate-500">Value per star</p>
                <p class="font-semibold text-amber-300">
                  {formatUSDMinor(
                    estimate().expectedValueMinor / props.unitCost!,
                  )}
                </p>
              </div>
            </Show>
            <div>
              <p class="text-xs text-slate-500">Price coverage</p>
              <p class="text-slate-300">
                {estimate().pricedOutcomes}/{estimate().totalOutcomes} outcomes
              </p>
            </div>
          </div>
        )}
      </Show>
      <Show when={props.note}>
        <p class="mt-2 text-[11px] leading-relaxed text-slate-500">
          {props.note}
        </p>
      </Show>
    </section>
  );
}
