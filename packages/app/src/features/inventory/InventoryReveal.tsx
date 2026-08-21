import type { InventoryItemDto, SettingsData } from "@cs-inv-edit/contracts";
import {
  RevealAnimation,
  type RevealItem,
} from "../../shared/ui/RevealAnimation.js";
import { isTerminal } from "./inventory-view-utils.js";

export interface InventoryRevealState {
  result: RevealItem;
  ready: boolean;
  candidates: RevealItem[];
  complete: () => void;
}

export function InventoryReveal(props: {
  reveal: InventoryRevealState | undefined;
  selectedItem: InventoryItemDto | undefined;
  settings: SettingsData | undefined;
  onDismiss: () => void;
}) {
  const terminal = () => isTerminal(props.selectedItem);
  return (
    <RevealAnimation
      open={!!props.reveal}
      ready={props.reveal?.ready}
      mode={
        terminal()
          ? (props.settings?.animations?.terminal ?? "slot-machine")
          : (props.settings?.animations?.container ?? "slot-machine")
      }
      title={terminal() ? "Terminal offer" : "Container opening"}
      candidates={props.reveal?.candidates ?? []}
      result={props.reveal?.result ?? { name: "Item" }}
      onComplete={props.onDismiss}
    />
  );
}
