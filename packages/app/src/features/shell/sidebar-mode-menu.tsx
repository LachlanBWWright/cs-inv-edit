import { For, type Accessor } from "solid-js";
import type { AppMode } from "./view.js";
import { modeGroups } from "./sidebar-mode-data.js";
import { SidebarModeGroup } from "./sidebar-mode-group.js";

export function SidebarModeMenu(props: {
  enabledModes: Accessor<Set<AppMode>>;
  currentMode: Accessor<AppMode>;
  chooseMode: (mode: AppMode) => void;
}) {
  return (
    <div
      class="absolute left-0 top-full z-30 mt-2 w-80 overflow-hidden rounded-2xl border border-slate-700/80 bg-slate-950 p-2 shadow-2xl shadow-black/40"
      role="menu"
      aria-label="Application mode"
    >
      <For each={modeGroups}>
        {(group, index) => (
          <SidebarModeGroup
            group={group}
            index={index()}
            enabledModes={props.enabledModes}
            currentMode={props.currentMode}
            chooseMode={props.chooseMode}
          />
        )}
      </For>
    </div>
  );
}
