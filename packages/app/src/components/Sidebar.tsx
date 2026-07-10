import { For } from "solid-js";
import type { ConnectionStatus, HealthStatus, InventorySnapshot } from "@cs-inv-edit/contracts";
import { HealthBadge } from "./HealthBadge.js";
import { AccountSwitcher } from "./AccountSwitcher.js";

export interface SidebarProps {
  view: string;
  setView: (view: string) => void;
  platform: "desktop" | "web";
  health: HealthStatus | undefined;
  connection: ConnectionStatus | undefined;
  inventory: InventorySnapshot | undefined;
  onSwitchAccount: () => void;
  onRefreshInventory: () => void;
}

const views = ["account", "inventory", "operations", "settings"] as const;

function formatViewName(item: string) {
  return item.replace(/-/g, " ").replace(/(^\w|\s+\w)/g, (value) => value.toUpperCase());
}

export function Sidebar(props: SidebarProps) {
  const NavLinks = (p: { onNavigate?: () => void }) => (
    <For each={views}>
      {(item) => (
        <button
          class={`w-full rounded-xl border px-3 py-2.5 text-left text-sm transition ${
            props.view === item ? "border-cyan-500/40 bg-cyan-500/15 text-cyan-100 shadow-[0_0_0_1px_rgba(34,211,238,0.15)]" : "border-transparent bg-slate-900/60 text-slate-300 hover:border-slate-700 hover:bg-slate-800/90 hover:text-white"
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
      <div class="flex flex-col gap-3 border-b border-slate-800 bg-slate-950/90 p-4 lg:hidden">
        <div class="flex items-center justify-between">
          <h1 class="text-xl font-semibold leading-tight text-cyan-400">CS Inv Edit</h1>
          <div class="relative">
            <select
              class="cursor-pointer appearance-none rounded-lg border border-slate-700 bg-slate-900/80 py-2 pl-3 pr-8 text-sm text-slate-200 outline-none focus:border-cyan-400 focus:ring-1 focus:ring-cyan-400"
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
        <AccountSwitcher connection={props.connection} inventory={props.inventory} onSwitchAccount={props.onSwitchAccount} onRefreshInventory={props.onRefreshInventory} />
      </div>

      <aside class="hidden min-h-screen w-72 flex-shrink-0 flex-col gap-5 bg-slate-950/90 p-6 text-white lg:flex">
        <div class="rounded-2xl border border-slate-800 bg-slate-900/80 p-4">
          <p class="text-sm font-medium text-slate-400">Inventory editor</p>
          <h1 class="mt-1 text-2xl font-semibold leading-tight text-cyan-400">CS Inv Edit</h1>
        </div>
        <AccountSwitcher connection={props.connection} inventory={props.inventory} onSwitchAccount={props.onSwitchAccount} onRefreshInventory={props.onRefreshInventory} />

        <nav class="flex flex-1 flex-col gap-2 overflow-y-auto pr-2">
          <NavLinks />
        </nav>

        <div class="mt-auto flex items-center justify-between border-t border-slate-800 pt-4 text-sm">
          <span class="text-slate-300">Backend</span>
          <HealthBadge health={props.health} />
        </div>
      </aside>
    </>
  );
}
