import { Show, type Accessor, type Setter } from "solid-js";
import type { AppMode, AppScreen } from "./view.js";
import { Popover } from "../../shared/ui/Popover.js";
import { modeDetails } from "./sidebar-mode-data.js";
import { SidebarModeMenu } from "./sidebar-mode-menu.js";

function ModePickerLabel(props: {
  compact?: boolean;
  group: string;
  mode: AppMode;
}) {
  return (
    <span class="min-w-0 flex-1 leading-tight">
      <span
        class={`${props.compact ? "hidden lg:block" : "block"} text-[9px] font-semibold uppercase tracking-[0.16em] text-slate-500`}
      >
        {props.group}
      </span>
      <span class="block truncate text-sm font-semibold text-slate-100">
        {modeDetails[props.mode].label}
      </span>
    </span>
  );
}

export function SidebarModePicker(props: {
  view: AppScreen;
  modeMenuOpen: Accessor<boolean>;
  currentMode: Accessor<AppMode>;
  currentGroup: Accessor<string>;
  enabledModes: Accessor<Set<AppMode>>;
  chooseMode: (mode: AppMode) => void;
  setModeMenuOpen: Setter<boolean>;
  setKindMenuOpen: Setter<boolean>;
  setCompactMenuOpen: Setter<boolean>;
  setSettingsOpen: Setter<boolean>;
  compact?: boolean;
}) {
  const buttonClass = () =>
    `group flex items-center gap-2.5 rounded-xl border border-slate-700/80 bg-slate-900 px-2.5 text-left shadow-sm transition hover:border-cyan-400/50 hover:bg-slate-900 ${props.compact ? "h-[38px] w-[6.3rem] min-w-0 lg:w-auto lg:min-w-48" : "h-11 min-w-48"}`;
  return (
    <>
      <Show when={props.view !== "account"}>
        <Popover
          class={`relative shrink-0 ${props.compact ? "min-w-0" : ""}`}
          open={props.modeMenuOpen()}
          onOpenChange={props.setModeMenuOpen}
        >
          <button
            class={buttonClass()}
            aria-label={`Mode: ${modeDetails[props.currentMode()].label}`}
            aria-haspopup="menu"
            aria-expanded={props.modeMenuOpen()}
            onClick={() => {
              props.setModeMenuOpen((value) => !value);
              props.setKindMenuOpen(false);
              props.setCompactMenuOpen(false);
              props.setSettingsOpen(false);
            }}
          >
            <ModePickerLabel
              compact={props.compact}
              group={props.currentGroup()}
              mode={props.currentMode()}
            />
            <svg
              class={`h-4 w-4 shrink-0 text-slate-400 transition-transform ${props.modeMenuOpen() ? "rotate-180" : ""}`}
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="2"
              stroke-linecap="round"
              stroke-linejoin="round"
            >
              <path d="m6 9 6 6 6-6" />
            </svg>
          </button>
          <Show when={props.modeMenuOpen()}>
            <SidebarModeMenu
              enabledModes={props.enabledModes}
              currentMode={props.currentMode}
              chooseMode={props.chooseMode}
            />
          </Show>
        </Popover>
      </Show>
    </>
  );
}
