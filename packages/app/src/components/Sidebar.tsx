import { For, Show } from "solid-js";
import type { HealthStatus } from "@cs-inv-edit/contracts";
import { HealthBadge } from "./HealthBadge";

export interface SidebarProps {
  view: string;
  setView: (view: string) => void;
  platform: "desktop" | "web";
  health: HealthStatus | undefined;
}

const views = ["inventory", "storage", "trade-ups", "stickers", "operations", "settings"] as const;

export function Sidebar(props: SidebarProps) {
  return (
    <aside class="flex flex-col gap-7 bg-slate-900 p-6 text-white lg:min-h-screen">
      <div>
        <p class="text-xs font-semibold uppercase tracking-wide text-cyan-300">
          {props.platform === "desktop" ? "Desktop app" : "Web wrapper"}
        </p>
        <h1 class="mt-2 text-2xl font-semibold leading-tight">CS Inventory Control</h1>
      </div>

      <nav class="grid grid-cols-2 gap-2 lg:grid-cols-1">
        <For each={views}>
          {(item) => (
            <button
              class={`rounded-md border px-3 py-2 text-left text-sm ${props.view === item ? "border-cyan-400 bg-cyan-600 text-white" : "border-slate-700 text-slate-200 hover:border-cyan-300 hover:text-white"}`}
              onClick={() => props.setView(item)}
            >
              {item.replace(/-/g, " ").replace(/(^\w|\s+\w)/g, (value) => value.toUpperCase())}
            </button>
          )}
        </For>
      </nav>

      <div class="mt-auto flex items-center justify-between border-t border-slate-700 pt-4 text-sm">
        <span class="text-slate-300">Backend</span>
        <HealthBadge health={props.health} />
      </div>
    </aside>
  );
}
