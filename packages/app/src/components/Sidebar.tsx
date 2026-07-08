import { For, createSignal } from "solid-js";
import type { HealthStatus } from "@cs-inv-edit/contracts";
import { HealthBadge } from "./HealthBadge.js";

export interface SidebarProps {
  view: string;
  setView: (view: string) => void;
  platform: "desktop" | "web";
  health: HealthStatus | undefined;
}

const views = ["account", "inventory", "storage", "trade-ups", "stickers", "name-tags", "tools", "item-management", "operations", "settings"] as const;

function formatViewName(item: string) {
  return item.replace(/-/g, " ").replace(/(^\w|\s+\w)/g, (value) => value.toUpperCase());
}

export function Sidebar(props: SidebarProps) {
  const [isMobileMenuOpen, setIsMobileMenuOpen] = createSignal(false);

  const NavLinks = (p: { onNavigate?: () => void }) => (
    <For each={views}>
      {(item) => (
        <button
          class={`w-full rounded-md px-3 py-2 text-left text-sm transition-colors ${
            props.view === item 
              ? "bg-cyan-600 text-white border-cyan-400" 
              : "text-slate-300 hover:bg-slate-700 hover:text-white"
          }`}
          onClick={() => {
            props.setView(item);
            p.onNavigate?.();
          }}
        >
          {formatViewName(item)}
        </button>
      )}
    </For>
  );

  return (
    <>
      {/* Mobile Navbar */}
      <div class="lg:hidden flex items-center justify-between bg-slate-900 p-4 border-b border-slate-700">
        <h1 class="text-xl font-semibold leading-tight text-cyan-400">CS Inv Edit</h1>
        <div class="relative">
          <select
            class="appearance-none rounded-md border border-slate-700 bg-slate-800 pl-3 pr-8 py-2 text-sm text-slate-200 outline-none focus:border-cyan-400 focus:ring-1 focus:ring-cyan-400 cursor-pointer"
            value={props.view}
            onChange={(e) => props.setView(e.currentTarget.value)}
          >
            <For each={views}>
              {(item) => <option value={item}>{formatViewName(item)}</option>}
            </For>
          </select>
          <div class="pointer-events-none absolute inset-y-0 right-0 flex items-center px-2 text-slate-400">
            <svg class="h-4 w-4 fill-current" viewBox="0 0 20 20">
              <path d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z" clip-rule="evenodd" fill-rule="evenodd" />
            </svg>
          </div>
        </div>
      </div>

      {/* Desktop Sidebar */}
      <aside class="hidden lg:flex flex-col gap-5 bg-slate-900 p-6 text-white min-h-screen lg:gap-7 w-64 flex-shrink-0">
        <h1 class="text-2xl font-semibold leading-tight text-cyan-400">CS Inv Edit</h1>

        <nav class="flex-1 flex flex-col gap-2 overflow-y-auto pr-2">
          <NavLinks />
        </nav>

        <div class="mt-auto flex items-center justify-between border-t border-slate-700 pt-4 text-sm">
          <span class="text-slate-300">Backend</span>
          <HealthBadge health={props.health} />
        </div>
      </aside>
    </>
  );
}
