import { For, Show, type Accessor, type Setter } from "solid-js";
import type { AppMode, AppScreen } from "../view.js";
import { Popover } from "./ui/Popover.js";
import { modeDetails, modeGroups } from "./sidebar-mode-data.js";

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
  return (
    <>
      <Show when={props.view !== "account"}>
        <Popover
          class={`relative shrink-0 ${props.compact ? "min-w-0" : ""}`}
          open={props.modeMenuOpen()}
          onOpenChange={props.setModeMenuOpen}
        >
          <button
            class={`group flex items-center gap-2.5 rounded-xl border border-slate-700/80 bg-slate-900/90 px-2.5 text-left shadow-sm transition hover:border-cyan-400/50 hover:bg-slate-900 ${
              props.compact
                ? "h-10 w-28 min-w-0 sm:h-11 sm:w-auto sm:min-w-48"
                : "h-11 min-w-48"
            }`}
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
            <span class="min-w-0 flex-1 leading-tight">
              <span
                class={`${props.compact ? "hidden sm:block" : "block"} text-[9px] font-semibold uppercase tracking-[0.16em] text-slate-500`}
              >
                {props.currentGroup()}
              </span>
              <span class="block truncate text-sm font-semibold text-slate-100">
                {modeDetails[props.currentMode()].label}
              </span>
            </span>
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
            <div
              class="absolute left-0 top-full z-30 mt-2 w-80 overflow-hidden rounded-2xl border border-slate-700/80 bg-slate-950/98 p-2 shadow-2xl shadow-black/40"
              role="menu"
              aria-label="Application mode"
            >
              <For each={modeGroups}>
                {(group, groupIndex) => {
                  const visibleModes = () =>
                    group.modes.filter((mode) =>
                      props.enabledModes().has(mode),
                    );
                  return (
                    <Show when={visibleModes().length > 0}>
                      <section
                        class={
                          groupIndex() > 0
                            ? "mt-2 border-t border-slate-800 pt-2"
                            : ""
                        }
                      >
                        <div class="flex items-center gap-2 px-2 pb-1.5 pt-1">
                          <span
                            class={`h-1.5 w-1.5 rounded-full ${group.accent}`}
                          />
                          <p class="text-[10px] font-bold uppercase tracking-[0.2em] text-slate-400">
                            {group.label}
                          </p>
                        </div>
                        <div class="space-y-1">
                          <For each={visibleModes()}>
                            {(mode) => {
                              const selected = () =>
                                props.currentMode() === mode;
                              return (
                                <button
                                  class={`flex w-full items-center gap-3 rounded-xl border px-2.5 py-2 text-left transition ${selected() ? "border-cyan-400/25 bg-cyan-400/10" : "border-transparent hover:border-slate-700/70 hover:bg-slate-800/70"}`}
                                  role="menuitemradio"
                                  aria-checked={selected()}
                                  onClick={() => props.chooseMode(mode)}
                                >
                                  <span class="min-w-0 flex-1">
                                    <span
                                      class={`block text-sm font-semibold ${selected() ? "text-cyan-100" : "text-slate-100"}`}
                                    >
                                      {modeDetails[mode].label}
                                    </span>
                                    <span class="block truncate text-xs text-slate-500">
                                      {modeDetails[mode].description}
                                    </span>
                                  </span>
                                  <Show when={selected()}>
                                    <svg
                                      class="h-4 w-4 shrink-0 text-cyan-300"
                                      viewBox="0 0 24 24"
                                      fill="none"
                                      stroke="currentColor"
                                      stroke-width="2.2"
                                      stroke-linecap="round"
                                      stroke-linejoin="round"
                                    >
                                      <path d="m5 12 4 4L19 6" />
                                    </svg>
                                  </Show>
                                </button>
                              );
                            }}
                          </For>
                        </div>
                      </section>
                    </Show>
                  );
                }}
              </For>
            </div>
          </Show>
        </Popover>
      </Show>
    </>
  );
}
