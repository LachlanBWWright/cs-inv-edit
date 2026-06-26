import { For, Show, type Component, type JSX } from "solid-js";
import { HealthBadge } from "./HealthBadge";
import type { HealthStatus } from "../lib/backend";

interface AppShellProps {
  platform: "desktop" | "web";
  activeView: string;
  health: HealthStatus | null;
  healthLoading: boolean;
  onNavigate(view: string): void;
  children: JSX.Element;
}

const views = [
  { key: "inventory", label: "Inventory" },
  { key: "storage", label: "Storage" },
  { key: "tradeups", label: "Trade-ups" },
  { key: "stickers", label: "Stickers" },
  { key: "operations", label: "Operations" },
  { key: "settings", label: "Settings" },
] as const;

export const AppShell: Component<AppShellProps> = (props) => {
  return (
    <main class="min-h-screen bg-slate-100 text-slate-950 lg:grid lg:grid-cols-[260px_1fr]">
      <aside class="flex flex-col gap-7 bg-slate-900 p-6 text-white lg:min-h-screen">
        <div>
          <p class="text-xs font-semibold uppercase tracking-wide text-cyan-300">{props.platform === "desktop" ? "Desktop shell" : "Web shell"}</p>
          <h1 class="mt-2 text-2xl font-semibold leading-tight">CS Inventory Control</h1>
          <p class="mt-3 text-sm text-slate-400">Shared Solid UI with Go-backed operation receipts and mock GC state.</p>
        </div>

        <nav class="grid gap-2 lg:grid-cols-1">
          <For each={views}>
            {(view) => (
              <button
                class={`rounded-lg border px-3 py-2 text-left text-sm transition ${props.activeView === view.key ? "border-cyan-400 bg-cyan-500/10 text-white" : "border-slate-700 text-slate-300 hover:border-cyan-400 hover:text-white"}`}
                onClick={() => props.onNavigate(view.key)}
              >
                {view.label}
              </button>
            )}
          </For>
        </nav>

        <div class="mt-auto flex flex-wrap items-center justify-between gap-3 border-t border-slate-700 pt-4 text-sm">
          <span class="text-slate-300">Backend</span>
          <HealthBadge health={props.health} loading={props.healthLoading} />
        </div>
      </aside>

      <section class="p-5 sm:p-7">{props.children}</section>
    </main>
  );
};
