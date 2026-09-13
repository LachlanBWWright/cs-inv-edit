import { For, type Accessor } from "solid-js";
import type { AppMode } from "./view.js";
import { modeGroups } from "./navbar-mode-data.js";
import { NavbarModeGroup } from "./navbar-mode-group.js";

export function NavbarModeMenu(props: {
  enabledModes: Accessor<Set<AppMode>>;
  currentMode: Accessor<AppMode>;
  chooseMode: (mode: AppMode) => void;
}) {
  return (
    <div
      class="absolute left-0 top-full z-30 mt-2 w-80 overflow-hidden rounded-md border border-slate-700/80 bg-slate-900 p-1 shadow-lg shadow-black/40"
      role="menu"
      aria-label="Application mode"
    >
      <For each={modeGroups}>
        {(group, index) => (
          <NavbarModeGroup
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
