import { For, Show, type Accessor } from "solid-js";
import type { AppMode } from "./view.js";
import { modeDetails } from "./sidebar-mode-data.js";
type ModeGroup = { label: string; accent: string; modes: AppMode[] };

function SidebarModeButton(props: {
  mode: AppMode;
  selected: boolean;
  chooseMode: (mode: AppMode) => void;
}) {
  return (
    <button
      class={`flex w-full items-center gap-3 rounded-xl border px-2.5 py-2 text-left transition ${props.selected ? "border-cyan-400/25 bg-cyan-950" : "border-transparent hover:border-slate-700/70 hover:bg-slate-800"}`}
      role="menuitemradio"
      aria-checked={props.selected}
      onClick={() => props.chooseMode(props.mode)}
    >
      <span class="min-w-0 flex-1">
        <span
          class={`block text-sm font-semibold ${props.selected ? "text-cyan-100" : "text-slate-100"}`}
        >
          {modeDetails[props.mode].label}
        </span>
        <span class="block truncate text-xs text-slate-500">
          {modeDetails[props.mode].description}
        </span>
      </span>
      <Show when={props.selected}>
        <span class="text-cyan-300" aria-hidden="true">
          ✓
        </span>
      </Show>
    </button>
  );
}

export function SidebarModeGroup(props: {
  group: ModeGroup;
  index: number;
  enabledModes: Accessor<Set<AppMode>>;
  currentMode: Accessor<AppMode>;
  chooseMode: (mode: AppMode) => void;
}) {
  const visibleModes = () =>
    props.group.modes.filter((mode) => props.enabledModes().has(mode));
  return (
    <Show when={visibleModes().length > 0}>
      <section
        class={props.index > 0 ? "mt-2 border-t border-slate-800 pt-2" : ""}
      >
        <div class="flex items-center gap-2 px-2 pb-1.5 pt-1">
          <span class={`h-1.5 w-1.5 rounded-full ${props.group.accent}`} />
          <p class="text-[10px] font-bold uppercase tracking-[0.2em] text-slate-400">
            {props.group.label}
          </p>
        </div>
        <div class="space-y-1">
          <For each={visibleModes()}>
            {(mode) => (
              <SidebarModeButton
                mode={mode}
                selected={props.currentMode() === mode}
                chooseMode={props.chooseMode}
              />
            )}
          </For>
        </div>
      </section>
    </Show>
  );
}
