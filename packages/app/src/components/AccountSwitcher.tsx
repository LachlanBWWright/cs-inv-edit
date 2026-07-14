import { createSignal, Show } from "solid-js";
import type { ConnectionStatus, InventorySnapshot } from "@cs-inv-edit/contracts";
import { formatTimestamp } from "../lib/format.js";

export interface AccountSwitcherProps {
  connection: ConnectionStatus | undefined;
  inventory: InventorySnapshot | undefined;
  onSwitchAccount: () => void;
  onRefreshInventory: () => void;
  onOpenAccount?: () => void;
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
    <div class="w-full text-sm text-slate-200">
      <button class="flex w-full items-center gap-3 text-left" onClick={() => setOpen((value) => !value)}>
        <div class="flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded-full border border-slate-700 bg-slate-900/80">
          <Show when={props.connection?.avatarUrl} fallback={<span class="text-[11px] font-semibold uppercase tracking-[0.2em] text-slate-400">{label().slice(0, 2)}</span>}>
            <img class="h-full w-full object-cover" src={props.connection?.avatarUrl} alt={`${label()} avatar`} loading="lazy" />
          </Show>
        </div>
        <div class="min-w-0">
          <p class="truncate font-semibold text-slate-100">{label()}</p>
          <p class="mt-1 text-xs text-slate-400">{stateLabel()}</p>
        </div>
      </button>
      <Show when={open()}>
        <div class="mt-3 space-y-3 rounded-xl border border-slate-800/80 bg-slate-900/70 p-3 text-sm">
          <div class="rounded-lg border border-slate-800 bg-slate-950/70 p-3">
            <p class="text-xs uppercase tracking-wide text-slate-400">Inventory scope</p>
            <p class="mt-1 font-medium text-slate-100">{props.inventory?.status === "ready" ? "Live inventory loaded" : "Inventory waiting for a connected account"}</p>
            <p class="mt-1 text-xs text-slate-400">Last refresh: {props.inventory?.refreshedAt ? formatTimestamp(props.inventory.refreshedAt) : "Not loaded"}</p>
          </div>
          <div class="flex flex-wrap gap-2">
            <button class="rounded-md border border-slate-700 bg-slate-800 px-3 py-2 text-xs font-medium text-slate-100 transition hover:border-cyan-400/50 hover:bg-slate-700" onClick={() => props.onRefreshInventory()}>
              Refresh inventory
            </button>
            <button class="rounded-md border border-cyan-500/40 bg-cyan-600/80 px-3 py-2 text-xs font-medium text-white transition hover:bg-cyan-500" onClick={() => props.onSwitchAccount()}>
              Switch account
            </button>
            <Show when={props.onOpenAccount}>
              <button class="rounded-md border border-slate-700 bg-slate-800 px-3 py-2 text-xs font-medium text-slate-100 transition hover:border-cyan-400/50 hover:bg-slate-700" onClick={() => props.onOpenAccount?.()}>
                Manage account
              </button>
            </Show>
          </div>
        </div>
      </Show>
    </div>
  );
}
