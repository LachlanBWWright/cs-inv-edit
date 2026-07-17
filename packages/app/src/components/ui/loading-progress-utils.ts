export interface LoadingStage {
  afterSeconds: number;
  label: string;
  detail: string;
}

export function loadingStageIndex(stages: readonly LoadingStage[], elapsedSeconds: number) {
  let index = 0;
  for (let candidate = 0; candidate < stages.length; candidate += 1) {
    if (elapsedSeconds >= stages[candidate]!.afterSeconds) index = candidate;
  }
  return index;
}

export function formatLoadingDuration(elapsedSeconds: number) {
  if (elapsedSeconds < 60) return `${elapsedSeconds}s`;
  const minutes = Math.floor(elapsedSeconds / 60);
  const seconds = elapsedSeconds % 60;
  return `${minutes}m ${seconds.toString().padStart(2, "0")}s`;
}
