import { createSignal, Show } from "solid-js";
import type { ConnectionStatus, InventorySnapshot } from "@cs-inv-edit/contracts";
import { formatTimestamp } from "../lib/format.js";

export interface AccountSwitcherProps {
  connection: ConnectionStatus | undefined;
  inventory: InventorySnapshot | undefined;
  onSwitchAccount: () => void;
  onRefreshInventory: () => void;
}

export function AccountSwitcher(props: AccountSwitcherProps) {
  const [open, setOpen] = createSignal(false);
  const label = () => props.connection?.accountName || props.connection?.steamId || "No account";
  const stateLabel = () => {
    if (!props.connection) return "Disconnected";
    if (props.connection.state === "connected") return "Connected";
    if (props.connection.state === "awaiting_guard") return "Awaiting Steam Guard";
    if (props.connection.state === "connecting") return "Connecting";
    return props.connection.detail || "Disconnected";
  };

  return (
    <div class="rounded-xl border border-slate-700 bg-slate-800/90 p-3 text-sm text-slate-200 shadow-sm">
      <button class="flex w-full items-center justify-between gap-3 text-left" onClick={() => setOpen((value) => !value)}>
        <div>
          <p class="font-semibold text-white">{label()}</p>
          <p class="text-xs text-slate-400">{stateLabel()}</p>
        </div>
        <span class="rounded-full bg-slate-700 px-2 py-1 text-[11px] uppercase tracking-wide text-slate-300">{props.connection?.state ?? "disconnected"}</span>
      </button>
      <Show when={open()}>
        <div class="mt-3 space-y-3 border-t border-slate-700 pt-3 text-sm">
          <div class="rounded-lg border border-slate-700 bg-slate-900/80 p-3">
            <p class="text-xs uppercase tracking-wide text-slate-400">Inventory scope</p>
            <p class="mt-1 font-medium text-slate-100">{props.inventory?.status === "ready" ? "Live inventory loaded" : "Inventory waiting for a connected account"}</p>
            <p class="mt-1 text-xs text-slate-400">Last refresh: {props.inventory?.refreshedAt ? formatTimestamp(props.inventory.refreshedAt) : "Not loaded"}</p>
          </div>
          <div class="flex flex-wrap gap-2">
            <button class="rounded-md border border-slate-600 bg-slate-700 px-3 py-2 text-xs font-medium text-slate-100 hover:border-cyan-400" onClick={() => props.onRefreshInventory()}>
              Refresh inventory
            </button>
            <button class="rounded-md border border-cyan-500/40 bg-cyan-600/80 px-3 py-2 text-xs font-medium text-white hover:bg-cyan-500" onClick={() => props.onSwitchAccount()}>
              Switch account
            </button>
          </div>
        </div>
      </Show>
    </div>
  );
}
