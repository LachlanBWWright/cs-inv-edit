import { For } from "solid-js";

export interface TF2LoadoutPresetSwitcherProps {
  presetId: number;
  onSelectPreset: (preset: number) => void;
}

export function TF2LoadoutPresetSwitcher(props: TF2LoadoutPresetSwitcherProps) {
  return (
    <div class="flex gap-1">
      <For each={[0, 1, 2, 3]}>
        {(preset) => (
          <button
            class={`h-9 min-w-9 rounded-lg border px-3 text-sm ${props.presetId === preset ? "border-slate-500 bg-slate-700 text-white" : "border-slate-700 text-slate-400 hover:bg-slate-800"}`}
            onClick={() => props.onSelectPreset(preset)}
          >
            {preset + 1}
          </button>
        )}
      </For>
    </div>
  );
}
