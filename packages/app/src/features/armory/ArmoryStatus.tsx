import { For, Show } from "solid-js";
import type { ArmorySnapshot } from "@cs-inv-edit/contracts";
import { Alert } from "../../shared/ui/Alert.js";
import { InventoryLoadingState } from "../../shared/ui/InventoryLoadingState.js";

export function ArmoryStatus(props: {
  armory: ArmorySnapshot | undefined;
  purchaseError: string | undefined;
  diagnostics: string[];
}) {
  const ready = () => props.armory?.status === "ready";
  return (
    <>
      <Show when={ready()}>
        <div class="flex flex-wrap items-center justify-between gap-3">
          <p class="text-xl font-semibold leading-none">
            {props.armory?.balance ?? 0} stars
          </p>
        </div>
      </Show>
      <Show
        when={
          (!props.armory || props.armory.status === "loading") &&
          (props.armory?.offers.length ?? 0) === 0
        }
      >
        <InventoryLoadingState
          active={!props.armory || props.armory.status === "loading"}
          title="Loading CS2 Armory"
          currentStage={props.armory?.message}
          variant="catalog"
        />
      </Show>
      <Show when={props.armory?.status === "requires_connection"}>
        <Alert variant="warning">
          Connect and refresh inventory before loading Armory state.
        </Alert>
      </Show>
      <Show when={props.armory?.status === "error"}>
        <Alert variant="danger">{props.armory?.message}</Alert>
      </Show>
      <Show when={props.purchaseError}>
        {(message) => <Alert variant="danger">{message()}</Alert>}
      </Show>
      <For each={props.diagnostics}>
        {(line) => <Alert variant="warning">{line}</Alert>}
      </For>
    </>
  );
}
