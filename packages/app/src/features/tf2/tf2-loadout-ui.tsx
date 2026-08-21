import { For, Show } from "solid-js";
import type { OperationReceipt } from "@cs-inv-edit/contracts";
import type { CompactMode } from "../../shared/ui-types.js";
import { TF2CompatibleItemGroups } from "./tf2-compatible-item-groups.js";
import { TF2LoadoutClassGrid } from "./tf2-loadout-class-grid.js";
import { TF2LoadoutPresetSwitcher } from "./tf2-loadout-preset-switcher.js";
import { TF2LoadoutSlotGroup } from "./tf2-loadout-slot-group.js";
import {
  tf2SlotGroupNames as slotGroupNames,
  type TF2Item,
} from "./tf2-loadout-model.js";

function EmptyCompatibleItems(props: {
  snapshotStatus: string | undefined;
  onRefresh: () => void;
}) {
  return (
    <div class="py-12 text-center">
      <p class="text-sm text-slate-500">
        No owned items match this class and slot.
      </p>
      <Show when={!props.snapshotStatus || props.snapshotStatus !== "ready"}>
        <button
          class="mt-3 rounded-lg border border-slate-700 px-3 py-2 text-sm text-slate-300"
          onClick={props.onRefresh}
        >
          Load TF2 inventory
        </button>
      </Show>
    </div>
  );
}

function LoadoutSlotGroups(props: {
  applicableSlots: Array<{ id: number; name: string; group: string }>;
  selectedSlotId: number;
  onSelectSlot: (slotId: number) => void;
  equippedForSlot: (id: number) => TF2Item | undefined;
}) {
  return (
    <For each={slotGroupNames}>
      {(groupName) => <LoadoutSlotGroup {...props} groupName={groupName} />}
    </For>
  );
}

function LoadoutSlotGroup(
  props: Parameters<typeof LoadoutSlotGroups>[0] & { groupName: string },
) {
  const slots = () =>
    props.applicableSlots.filter((slot) => slot.group === props.groupName);
  return (
    <Show when={slots().length > 0}>
      <TF2LoadoutSlotGroup
        groupName={props.groupName}
        slots={slots()}
        selectedSlotId={props.selectedSlotId}
        onSelectSlot={props.onSelectSlot}
        equippedForSlot={props.equippedForSlot}
      />
    </Show>
  );
}

export function TF2ItemBrowser(props: {
  inventoryReady: boolean;
  loading: boolean;
  snapshotStatus: string | undefined;
  query: string;
  selectedSlot: { name: string };
  compatibleItems: TF2Item[];
  compatibleGroups: Array<{ name: string; items: TF2Item[] }>;
  equippedItem: TF2Item | undefined;
  cardMinimumWidth: number;
  cardHeight: number;
  compactMode: CompactMode;
  onRefresh: () => void;
  onQueryChange: (value: string) => void;
  onSelect: (item: TF2Item) => void;
  visible: boolean;
}) {
  return (
    <section class={props.visible ? "block" : "hidden"}>
      <div class="sticky top-0 z-10 flex flex-wrap items-center justify-between gap-3 border-b border-slate-800 bg-slate-950 pb-3">
        <div>
          <h2 class="font-semibold text-slate-100">
            {props.selectedSlot.name}
          </h2>
          <p class="text-xs text-slate-500">
            {props.compatibleItems.length} compatible owned items
            {props.equippedItem ? ` · ${props.equippedItem.name} equipped` : ""}
          </p>
        </div>
        <input
          class="h-9 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 text-sm text-slate-100 sm:w-64"
          placeholder="Filter items"
          value={props.query}
          onInput={(event) => props.onQueryChange(event.currentTarget.value)}
        />
      </div>
      <Show
        when={!props.loading && props.inventoryReady}
        fallback={
          <p class="py-12 text-center text-sm text-slate-500">
            Loading your TF2 inventory…
          </p>
        }
      >
        <Show
          when={props.compatibleItems.length}
          fallback={
            <EmptyCompatibleItems
              snapshotStatus={props.snapshotStatus}
              onRefresh={props.onRefresh}
            />
          }
        >
          <TF2CompatibleItemGroups
            groups={props.compatibleGroups}
            cardMinimumWidth={props.cardMinimumWidth}
            cardHeight={props.cardHeight}
            compactMode={props.compactMode}
            equippedItem={props.equippedItem}
            onSelect={(item) => props.onSelect(item)}
          />
        </Show>
      </Show>
    </section>
  );
}

export function TF2LoadoutPanel(props: {
  selectedClass: { name: string };
  presetId: number;
  classId: number;
  slotId: number;
  receipt: OperationReceipt | undefined;
  featuresStatus: string | undefined;
  applicableSlots: Array<{ id: number; name: string; group: string }>;
  onSelectPreset: (preset: number) => void;
  onSelectClass: (classId: number) => void;
  onSelectSlot: (slotId: number) => void;
  equippedForSlot: (id: number) => TF2Item | undefined;
  visible: boolean;
}) {
  return (
    <aside class={props.visible ? "block" : "hidden"}>
      <div class="flex items-center justify-between gap-3">
        <div>
          <h2 class="text-xl font-semibold text-slate-100">
            {props.selectedClass.name}
          </h2>
          <p class="text-xs text-slate-500">
            Loadout preset {props.presetId + 1}
          </p>
        </div>
        <TF2LoadoutPresetSwitcher
          presetId={props.presetId}
          onSelectPreset={props.onSelectPreset}
        />
      </div>
      <TF2LoadoutClassGrid
        classId={props.classId}
        onSelectClass={props.onSelectClass}
      />
      <div class="mt-5 space-y-4">
        <LoadoutSlotGroups
          applicableSlots={props.applicableSlots}
          selectedSlotId={props.slotId}
          onSelectSlot={props.onSelectSlot}
          equippedForSlot={props.equippedForSlot}
        />
      </div>
      <Show when={props.receipt}>
        {(value) => (
          <div class="mt-4 border-t border-slate-800 pt-3 text-sm">
            <span class="font-medium text-slate-200">{value().state}</span>
            <span class="ml-2 text-slate-400">{value().message}</span>
          </div>
        )}
      </Show>
      <Show when={props.featuresStatus === "waiting"}>
        <p class="mt-4 text-xs text-slate-500">
          Waiting for the TF2 Game Coordinator to publish loadout state.
        </p>
      </Show>
    </aside>
  );
}
