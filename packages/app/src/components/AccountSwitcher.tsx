import { For, Show } from "solid-js";
import type { InventorySnapshot, SteamAccountProfile } from "@cs-inv-edit/contracts";
import { formatTimestamp } from "../lib/format.js";

export interface AccountSwitcherProps {
  inventory: InventorySnapshot | undefined;
  accounts: SteamAccountProfile[];
  onAddAccount: () => void;
  onSignInAccount: (account: SteamAccountProfile) => void;
  onSignOutAccount: (account: SteamAccountProfile) => void;
  onDeleteAccount: (account: SteamAccountProfile) => void;
  onRefreshInventory: () => void;
  onOpenAccount?: () => void;
}

export function AccountSwitcher(props: AccountSwitcherProps) {
  const orderedAccounts = () => [...props.accounts].sort((left, right) => Number(right.signedIn) - Number(left.signedIn) || right.lastSignedInAt.localeCompare(left.lastSignedInAt));

  return (
    <div class="w-full text-sm text-slate-200">
      <Show when={props.accounts.length > 0} fallback={<p class="rounded-lg border border-slate-800 bg-slate-950/70 p-3 text-xs text-slate-400">No saved accounts yet.</p>}>
        <div class="max-h-72 divide-y divide-slate-800 overflow-y-auto border-b border-slate-800">
          <For each={orderedAccounts()}>{(account) => (
            <div class="py-3">
              <div class="flex items-center gap-3">
                <div class="flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded-full border border-slate-700 bg-slate-900/80">
                  <Show when={account.avatarUrl} fallback={<span class="text-[11px] font-semibold uppercase tracking-[0.2em] text-slate-400">{account.accountName.slice(0, 2)}</span>}>
                    <img class="h-full w-full object-cover" src={account.avatarUrl} alt={`${account.accountName} avatar`} loading="lazy" />
                  </Show>
                </div>
                <div class="min-w-0 flex-1">
                  <p class="truncate font-semibold text-slate-100">{account.accountName}</p>
                  <p class={`mt-0.5 text-xs ${account.signedIn ? "text-emerald-400" : "text-slate-500"}`}>{account.signedIn ? "Signed in" : "Signed out"}</p>
                </div>
              </div>
              <div class="mt-3 flex flex-wrap gap-2">
                <Show when={account.signedIn} fallback={<button class="rounded-md border border-cyan-500/40 bg-cyan-500/10 px-2.5 py-1.5 text-xs font-medium text-cyan-200 hover:bg-cyan-500/20" onClick={() => props.onSignInAccount(account)}>Sign in</button>}>
                  <button class="rounded-md border border-slate-700 bg-slate-800 px-2.5 py-1.5 text-xs font-medium text-slate-100 hover:bg-slate-700" onClick={() => props.onSignOutAccount(account)}>Sign out</button>
                </Show>
                <button class="rounded-md border border-rose-500/30 bg-rose-500/10 px-2.5 py-1.5 text-xs font-medium text-rose-300 hover:bg-rose-500/20" onClick={() => props.onDeleteAccount(account)}>Delete</button>
              </div>
            </div>
          )}</For>
        </div>
      </Show>

      <div class="flex items-center justify-between gap-2 px-1 pt-3 text-xs text-slate-500">
        <span>Inventory: {props.inventory?.refreshedAt ? formatTimestamp(props.inventory.refreshedAt) : "Not loaded"}</span>
        <button class="text-slate-300 hover:text-cyan-200" onClick={props.onRefreshInventory}>Refresh</button>
      </div>
      <button class="mt-3 w-full rounded-lg border border-dashed border-cyan-500/40 px-3 py-2 text-xs font-medium text-cyan-200 transition hover:bg-cyan-500/10" onClick={props.onAddAccount}>+ Add account</button>
    </div>
  );
}
