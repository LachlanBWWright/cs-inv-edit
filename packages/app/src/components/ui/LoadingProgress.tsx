import { For, createEffect, createSignal, onCleanup } from "solid-js";
import {
  formatLoadingDuration,
  loadingStageIndex,
  type LoadingStage,
} from "./loading-progress-utils.js";

export type { LoadingStage } from "./loading-progress-utils.js";

export interface LoadingProgressProps {
  active: boolean;
  title: string;
  stages: readonly LoadingStage[];
  currentStage?: string;
}

export function LoadingProgress(props: LoadingProgressProps) {
  const [elapsedSeconds, setElapsedSeconds] = createSignal(0);
  let timer: ReturnType<typeof setInterval> | undefined;

  const stopTimer = () => {
    if (timer !== undefined) clearInterval(timer);
    timer = undefined;
  };

  createEffect(() => {
    stopTimer();
    setElapsedSeconds(0);
    if (!props.active) return;
    const startedAt = Date.now();
    timer = setInterval(
      () => setElapsedSeconds(Math.floor((Date.now() - startedAt) / 1000)),
      1000,
    );
  });
  onCleanup(stopTimer);

  const stageIndex = () => loadingStageIndex(props.stages, elapsedSeconds());
  const stage = () => props.stages[stageIndex()] ?? props.stages[0];
  const stageLabel = () => props.currentStage || stage()?.label || "Loading";

  return (
    <div
      class="w-full max-w-xl rounded-2xl border border-cyan-400/20 bg-slate-950/80 p-5 text-left shadow-lg shadow-cyan-950/20"
      role="progressbar"
      aria-label={props.title}
      aria-valuetext={`${stageLabel()}, ${formatLoadingDuration(elapsedSeconds())} elapsed`}
    >
      <div class="flex items-start gap-4">
        <span
          class="mt-0.5 h-9 w-9 shrink-0 animate-spin rounded-full border-2 border-slate-700 border-t-cyan-300"
          aria-hidden="true"
        />
        <div class="min-w-0 flex-1">
          <div class="flex flex-wrap items-baseline justify-between gap-2">
            <p class="font-semibold text-slate-100">{props.title}</p>
            <p class="font-mono text-xs text-cyan-200">
              {formatLoadingDuration(elapsedSeconds())} elapsed
            </p>
          </div>
          <p class="mt-2 text-sm font-medium text-cyan-200">{stageLabel()}</p>
          <p class="mt-1 text-xs leading-5 text-slate-400">{stage()?.detail}</p>
          <div
            class="mt-4 grid gap-1"
            style={{
              "grid-template-columns": `repeat(${Math.max(props.stages.length, 1)}, minmax(0, 1fr))`,
            }}
            aria-hidden="true"
          >
            <For each={props.stages}>
              {(_, index) => (
                <span
                  class={`h-1.5 rounded-full transition-colors duration-500 ${index() < stageIndex() ? "bg-cyan-400" : index() === stageIndex() ? "animate-pulse bg-cyan-300" : "bg-slate-800"}`}
                />
              )}
            </For>
          </div>
          <p class="mt-2 text-[11px] text-slate-500">
            Stage {stageIndex() + 1} of {props.stages.length}. Timing depends on
            Steam and CS2 Game Coordinator response times.
          </p>
        </div>
      </div>
    </div>
  );
}
