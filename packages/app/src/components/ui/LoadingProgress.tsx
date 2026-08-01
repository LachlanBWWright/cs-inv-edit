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
      class="w-full max-w-md text-center"
      role="progressbar"
      aria-label={props.title}
      aria-valuetext={`${stageLabel()}, ${formatLoadingDuration(elapsedSeconds())} elapsed`}
    >
      <div class="flex flex-col items-center">
        <span
          class="h-8 w-8 shrink-0 animate-spin rounded-full border-2 border-slate-700 border-t-cyan-300"
          aria-hidden="true"
        />
        <div class="mt-4 w-full min-w-0">
          <p class="font-semibold text-slate-100">{props.title}</p>
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
          <p class="mt-2 font-mono text-[11px] text-slate-500">
            {formatLoadingDuration(elapsedSeconds())} elapsed
          </p>
        </div>
      </div>
    </div>
  );
}
