import { LoadingProgress, type LoadingStage } from "./LoadingProgress.js";

export interface InventoryLoadingStateProps {
  active: boolean;
  title: string;
  stages: readonly LoadingStage[];
  currentStage?: string;
}

export function InventoryLoadingState(props: InventoryLoadingStateProps) {
  return (
    <div class="grid h-full min-h-64 place-items-center px-4 py-10">
      <LoadingProgress
        active={props.active}
        title={props.title}
        stages={props.stages}
        currentStage={props.currentStage}
      />
    </div>
  );
}
