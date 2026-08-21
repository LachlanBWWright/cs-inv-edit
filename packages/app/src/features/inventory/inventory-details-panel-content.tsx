import { Show } from "solid-js";
import type { InventoryDetailsPanelProps } from "./inventory-details-panel-props.js";
import { SelectedItemContent } from "./inventory-selected-item-content.js";

export interface InventoryDetailsPanelContentProps {
  selectedItem: InventoryDetailsPanelProps["selectedItem"];
  detailsPanelProps: InventoryDetailsPanelProps;
}

export function InventoryDetailsPanelContent(
  props: InventoryDetailsPanelContentProps,
) {
  return (
    <div class="flex h-full min-h-0 flex-col overflow-hidden rounded-2xl border border-slate-800/80 bg-slate-950 p-4">
      <div class="min-h-0 flex-1 overflow-y-auto">
        <Show
          keyed
          when={props.selectedItem}
          fallback={<p class="text-sm text-slate-400">No item selected.</p>}
        >
          {(selected) => (
            <SelectedItemContent
              selected={selected}
              panelProps={props.detailsPanelProps}
            />
          )}
        </Show>
      </div>
    </div>
  );
}
