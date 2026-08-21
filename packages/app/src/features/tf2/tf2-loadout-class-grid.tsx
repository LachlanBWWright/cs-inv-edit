import { For } from "solid-js";
import { tf2Classes as classes } from "./tf2-loadout-model.js";

export interface TF2LoadoutClassGridProps {
  classId: number;
  onSelectClass: (classId: number) => void;
}

export function TF2LoadoutClassGrid(props: TF2LoadoutClassGridProps) {
  return (
    <div class="mt-4 grid grid-cols-9 gap-1">
      <For each={classes}>
        {(entry) => (
          <button
            class={`aspect-square min-w-0 overflow-hidden rounded-lg p-1 ${props.classId === entry.id ? "bg-slate-700 ring-1 ring-inset ring-slate-400" : "opacity-70 hover:bg-slate-800 hover:opacity-100"}`}
            aria-label={entry.name}
            title={entry.name}
            onClick={() => props.onSelectClass(entry.id)}
          >
            <img class="h-full w-full object-contain" src={entry.icon} alt="" />
          </button>
        )}
      </For>
    </div>
  );
}
