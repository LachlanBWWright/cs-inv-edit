import { Alert } from "./Alert.js";
import { LoadingProgress, type LoadingStage } from "./LoadingProgress.js";

export interface InventoryLoadingStateProps {
  active: boolean;
  title: string;
  stages: readonly LoadingStage[];
  currentStage?: string;
}

export function InventoryLoadingState(props: InventoryLoadingStateProps) {
  return (
    <Alert class="flex h-full min-h-48 items-center justify-center">
      <LoadingProgress
        active={props.active}
        title={props.title}
        stages={props.stages}
        currentStage={props.currentStage}
      />
    </Alert>
  );
}
