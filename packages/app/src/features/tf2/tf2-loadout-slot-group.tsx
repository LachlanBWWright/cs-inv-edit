import { For, Show } from "solid-js";
import { ItemPreviewMedia } from "../inventory/ItemPreviewMedia.js";
import type { TF2Item } from "./tf2-loadout-model.js";

export interface TF2LoadoutSlotGroupProps {
  groupName: string;
  slots: Array<{ id: number; name: string; group: string }>;
  selectedSlotId: number;
  onSelectSlot: (slotId: number) => void;
  equippedForSlot: (id: number) => TF2Item | undefined;
}

function LoadoutSlotButton(props: {
  slot: TF2LoadoutSlotGroupProps["slots"][number];
  selected: boolean;
  equipped: TF2Item | undefined;
  onSelectSlot: (slotId: number) => void;
}) {
  return (
    <button
      class={`min-h-20 rounded-lg border p-2 text-left ${props.selected ? "border-slate-400 bg-slate-800" : "border-slate-800 bg-slate-950 hover:border-slate-700"}`}
      onClick={() => props.onSelectSlot(props.slot.id)}
    >
      <span class="block text-xs font-semibold text-slate-400">{props.slot.name}</span>
      <Show
        when={props.equipped}
        fallback={<span class="mt-2 block text-xs text-slate-600">Empty</span>}
      >
        {(item) => (
          <span class="mt-2 flex items-center gap-2">
            <span class="h-9 w-9 shrink-0">
              <ItemPreviewMedia
                name={item().name}
                imageUrl={item().imageUrl}
                variant="loadout-slot"
              />
            </span>
            <span class="line-clamp-2 text-xs text-slate-200">{item().name}</span>
          </span>
        )}
      </Show>
    </button>
  );
}

export function TF2LoadoutSlotGroup(props: TF2LoadoutSlotGroupProps) {
  return (
    <section>
      <h3 class="mb-2 text-[10px] font-semibold uppercase tracking-wider text-slate-500">
        {props.groupName}
      </h3>
      <div class="grid grid-cols-2 gap-2">
        <For each={props.slots}>
          {(slot) => (
            <LoadoutSlotButton
              slot={slot}
              selected={props.selectedSlotId === slot.id}
              equipped={props.equippedForSlot(slot.id)}
              onSelectSlot={props.onSelectSlot}
            />
          )}
        </For>
      </div>
    </section>
  );
}
