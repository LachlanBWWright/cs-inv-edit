import { For, Show } from "solid-js";
import type { OperationReceipt } from "@cs-inv-edit/contracts";
import { TF2LoadoutClassGrid } from "./tf2-loadout-class-grid.js";
import { TF2LoadoutPresetSwitcher } from "./tf2-loadout-preset-switcher.js";
import { TF2LoadoutSlotGroup } from "./tf2-loadout-slot-group.js";
import { tf2SlotGroupNames as slotGroupNames, type TF2Item } from "./tf2-loadout-model.js";

export function TF2LoadoutSidebar(props: {
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
  mobileVisible: boolean;
}) {
  return (
    <aside
      class={`rounded-2xl border border-slate-800 bg-slate-950 p-4 ${props.mobileVisible ? "block" : "hidden"} lg:sticky lg:top-20 lg:order-1 lg:block lg:max-h-[calc(100vh-6rem)] lg:self-start lg:overflow-y-auto`}
    >
      <div class="flex items-center justify-between gap-3">
        <div>
          <h2 class="text-xl font-semibold text-slate-100">{props.selectedClass.name}</h2>
          <p class="text-xs text-slate-500">Loadout preset {props.presetId + 1}</p>
        </div>
        <TF2LoadoutPresetSwitcher presetId={props.presetId} onSelectPreset={props.onSelectPreset} />
      </div>
      <TF2LoadoutClassGrid classId={props.classId} onSelectClass={props.onSelectClass} />
      <div class="mt-5 space-y-4">
        <For each={slotGroupNames}>
          {(groupName) => {
            const slots = () => props.applicableSlots.filter((slot) => slot.group === groupName);
            return (
              <Show when={slots().length}>
                <TF2LoadoutSlotGroup
                  groupName={groupName}
                  slots={slots()}
                  selectedSlotId={props.slotId}
                  onSelectSlot={props.onSelectSlot}
                  equippedForSlot={props.equippedForSlot}
                />
              </Show>
            );
          }}
        </For>
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
        <p class="mt-4 text-xs text-slate-500">Waiting for the TF2 Game Coordinator to publish loadout state.</p>
      </Show>
    </aside>
  );
}
