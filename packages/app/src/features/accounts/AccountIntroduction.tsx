import { For } from "solid-js";
import { modeDetails, modeGroups } from "../shell/sidebar-mode-data.js";

export function AccountIntroduction() {
  return (
    <section class="space-y-8 py-4" aria-labelledby="application-introduction">
      <div class="space-y-5">
        <p class="text-sm font-medium uppercase tracking-[0.18em] text-cyan-400">
          CS Inventory Editor
        </p>
        <h3
          id="application-introduction"
          class="max-w-lg text-3xl font-semibold leading-tight text-slate-50 sm:text-4xl"
        >
          Your game inventories, without the clutter.
        </h3>
        <p class="max-w-lg text-base leading-7 text-slate-400">
          Connect to Steam to browse the items you own, inspect their details,
          and use every supported inventory, activity, commerce, and account
          tool from one focused app.
        </p>
      </div>
      <div class="space-y-4">
        <h4 class="text-sm font-medium text-slate-200">Supported features</h4>
        <div class="grid gap-x-8 gap-y-5 sm:grid-cols-2">
          <For each={modeGroups}>
            {(group) => (
              <section aria-label={group.label}>
                <h5 class="text-xs font-medium uppercase tracking-wider text-slate-500">
                  {group.label}
                </h5>
                <ul class="mt-2 space-y-1.5 text-sm text-slate-300">
                  <For each={group.modes}>
                    {(mode) => (
                      <li>
                        <span class="font-medium text-slate-200">
                          {modeDetails[mode].label}
                        </span>
                        <span class="text-slate-500">
                          {` — ${modeDetails[mode].description}`}
                        </span>
                      </li>
                    )}
                  </For>
                </ul>
              </section>
            )}
          </For>
        </div>
      </div>
    </section>
  );
}
