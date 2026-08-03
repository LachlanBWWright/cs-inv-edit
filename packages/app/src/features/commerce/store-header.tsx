import { Show } from "solid-js";
import type { StoreSnapshot } from "@cs-inv-edit/contracts";
import { Alert } from "../../shared/ui/Alert.js";
import { InventoryLoadingState } from "../../shared/ui/InventoryLoadingState.js";

export function StoreHeader(props: {
  store: StoreSnapshot | undefined;
  purchaseEnabled: boolean;
  browseOnly?: boolean;
  gameName?: string;
}) {
  return (
    <>
      <Show
        when={
          (!props.store || props.store.status === "loading") &&
          (props.store?.offers.length ?? 0) === 0
        }
      >
        <InventoryLoadingState
          active
          title={`Loading ${props.gameName ?? "CS2"} Store`}
          currentStage={props.store?.message}
          variant="catalog"
        />
      </Show>
      <Show when={props.store?.status === "requires_connection"}>
        <Alert variant="warning">
          {props.store?.message ||
            `Connect Steam to load the ${props.gameName ?? "CS2"} store.`}
        </Alert>
      </Show>
      <Show when={props.store?.status === "error"}>
        <Alert variant="danger">{props.store?.message}</Alert>
      </Show>
      <Show
        when={
          props.store?.status === "ready" &&
          !props.purchaseEnabled &&
          !props.browseOnly
        }
      >
        <Alert variant="warning">
          Browsing is enabled, but purchases are locked. Enable{" "}
          <code>enableStorePurchases</code> in Settings before confirming a
          real-money transaction.
        </Alert>
      </Show>
    </>
  );
}
