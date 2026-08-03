import { Show } from "solid-js";
import type {
  InventoryItemDto,
  InventorySnapshot,
} from "@cs-inv-edit/contracts";
import { Alert } from "../../shared/ui/Alert.js";
import { InventoryLoadingState } from "../../shared/ui/InventoryLoadingState.js";
import { ItemPreviewMedia } from "./ItemPreviewMedia.js";
import { WearRangeBar } from "../../shared/ui/WearRangeBar.js";
import { formatFloat, hasSkinWearFloat } from "./item-instance-utils.js";
import {
  itemDisplayName,
  itemInitials,
} from "./inventory-view-utils.js";

export function InventoryEmptyState(props: {
  inventory: InventorySnapshot | undefined;
  inventoryLoading: boolean;
}) {
  const initialLoad = () =>
    props.inventoryLoading && (props.inventory?.items.length ?? 0) === 0;
  return (
    <Show
      when={initialLoad()}
      fallback={
        <Alert class="flex h-full min-h-48 items-center justify-center">
          <p>
            {(props.inventory?.items.length ?? 0) > 0
              ? "No items match the current filters."
              : "No inventory items are loaded."}
          </p>
        </Alert>
      }
    >
      <InventoryLoadingState
        active={initialLoad()}
        title="Loading CS2 inventory"
        currentStage={props.inventory?.message}
      />
    </Show>
  );
}

export function InventoryItemIcon(props: {
  item: InventoryItemDto;
  large?: boolean;
}) {
  if (props.large) {
    return (
      <ItemPreviewMedia
        name={itemDisplayName(props.item)}
        imageUrl={props.item.imageUrl}
        variant="inventory-card"
      />
    );
  }
  const boxClass =
    "flex h-16 w-20 shrink-0 items-center justify-center rounded bg-slate-950 text-sm font-semibold text-slate-600";
  const imageClass =
    "h-16 w-20 shrink-0 rounded bg-slate-950 object-contain object-top";
  return (
    <div class="w-20 shrink-0">
      <Show
        when={props.item.imageUrl}
        fallback={<div class={boxClass}>{itemInitials(props.item)}</div>}
      >
        <img
          class={imageClass}
          src={props.item.imageUrl}
          alt={itemDisplayName(props.item)}
          loading="lazy"
        />
      </Show>
    </div>
  );
}

export function InventoryItemWear(props: { item: InventoryItemDto }) {
  return (
    <Show when={hasSkinWearFloat(props.item)}>
      <div class="mt-auto pt-3">
        <WearRangeBar
          compact
          wear={props.item.paintWear}
          min={props.item.paintWearMin}
          max={props.item.paintWearMax}
        />
        <p class="mt-1 text-right font-mono text-[11px] text-slate-400">
          {formatFloat(props.item.paintWear!)}
        </p>
      </div>
    </Show>
  );
}
