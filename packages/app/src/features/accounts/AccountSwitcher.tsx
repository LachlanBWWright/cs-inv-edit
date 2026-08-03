import { For, Show } from "solid-js";
import type {
  InventorySnapshot,
  SteamAccountProfile,
} from "@cs-inv-edit/contracts";
import { formatTimestamp } from "../../shared/lib/format.js";

export interface AccountSwitcherProps {
  inventory: InventorySnapshot | undefined;
  accounts: SteamAccountProfile[];
  onAddAccount: () => void;
  onSignInAccount: (account: SteamAccountProfile) => void;
  onSignOutAccount: (account: SteamAccountProfile) => void;
  onDeleteAccount: (account: SteamAccountProfile) => void;
  onRefreshInventory: () => void;
  onOpenAccount?: () => void;
  onOpenSettings: () => void;
}

function AccountAvatar(props: { account: SteamAccountProfile }) {
  return (
    <div class="flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded-full border border-slate-700 bg-slate-900">
      <Show
        when={props.account.avatarUrl}
        fallback={
          <span class="text-[11px] font-semibold uppercase tracking-[0.2em] text-slate-400">
            {props.account.accountName.slice(0, 2)}
          </span>
        }
      >
        <img
          class="h-full w-full object-cover"
          src={props.account.avatarUrl}
          alt={`${props.account.accountName} avatar`}
          loading="lazy"
        />
      </Show>
    </div>
  );
}

function AccountActionButtons(props: {
  account: SteamAccountProfile;
  onSignInAccount: (account: SteamAccountProfile) => void;
  onSignOutAccount: (account: SteamAccountProfile) => void;
  onDeleteAccount: (account: SteamAccountProfile) => void;
}) {
  return (
    <div class="mt-3 flex flex-wrap gap-2">
      <Show when={props.account.steamId}>
        {(steamId) => (
          <a
            class="rounded-md border border-sky-500/30 bg-sky-950 px-2.5 py-1.5 text-xs font-medium text-sky-200 hover:bg-sky-950"
            href={`https://steamcommunity.com/profiles/${encodeURIComponent(steamId())}`}
            target="_blank"
            rel="noopener noreferrer"
          >
            View Steam profile
          </a>
        )}
      </Show>
      <Show
        when={props.account.signedIn}
        fallback={
          <button
            class="rounded-md border border-cyan-500/40 bg-cyan-950 px-2.5 py-1.5 text-xs font-medium text-cyan-200 hover:bg-cyan-950"
            onClick={() => props.onSignInAccount(props.account)}
          >
            Sign in
          </button>
        }
      >
        <button
          class="rounded-md border border-slate-700 bg-slate-800 px-2.5 py-1.5 text-xs font-medium text-slate-100 hover:bg-slate-700"
          onClick={() => props.onSignOutAccount(props.account)}
        >
          Sign out
        </button>
      </Show>
      <button
        class="rounded-md border border-rose-500/30 bg-rose-950 px-2.5 py-1.5 text-xs font-medium text-rose-300 hover:bg-rose-950"
        onClick={() => props.onDeleteAccount(props.account)}
      >
        Delete
      </button>
    </div>
  );
}

function AccountRow(props: {
  account: SteamAccountProfile;
  onSignInAccount: (account: SteamAccountProfile) => void;
  onSignOutAccount: (account: SteamAccountProfile) => void;
  onDeleteAccount: (account: SteamAccountProfile) => void;
}) {
  const statusClass = () =>
    props.account.signedIn ? "text-emerald-400" : "text-slate-500";

  return (
    <div class="py-3">
      <div class="flex items-center gap-3">
        <AccountAvatar account={props.account} />
        <div class="min-w-0 flex-1">
          <p class="truncate font-semibold text-slate-100">
            {props.account.accountName}
          </p>
          <p class={`mt-0.5 text-xs ${statusClass()}`}>
            {props.account.signedIn ? "Signed in" : "Signed out"}
          </p>
        </div>
      </div>
      <AccountActionButtons
        account={props.account}
        onDeleteAccount={props.onDeleteAccount}
        onSignInAccount={props.onSignInAccount}
        onSignOutAccount={props.onSignOutAccount}
      />
    </div>
  );
}

export function AccountSwitcher(props: AccountSwitcherProps) {
  const orderedAccounts = () =>
    [...props.accounts].sort(
      (left, right) =>
        Number(right.signedIn) - Number(left.signedIn) ||
        right.lastSignedInAt.localeCompare(left.lastSignedInAt),
    );

  return (
    <div class="w-full text-sm text-slate-200">
      <Show
        when={props.accounts.length > 0}
        fallback={
          <p class="rounded-lg border border-slate-800 bg-slate-950 p-3 text-xs text-slate-400">
            No saved accounts yet.
          </p>
        }
      >
        <div class="max-h-72 divide-y divide-slate-800 overflow-y-auto border-b border-slate-800">
          <For each={orderedAccounts()}>
            {(account) => (
              <AccountRow
                account={account}
                onDeleteAccount={props.onDeleteAccount}
                onSignInAccount={props.onSignInAccount}
                onSignOutAccount={props.onSignOutAccount}
              />
            )}
          </For>
        </div>
      </Show>
      <div class="flex items-center justify-between gap-2 px-1 pt-3 text-xs text-slate-500">
        <span>
          Inventory:{" "}
          {props.inventory?.refreshedAt
            ? formatTimestamp(props.inventory.refreshedAt)
            : "Not loaded"}
        </span>
        <button
          class="text-slate-300 hover:text-cyan-200"
          onClick={props.onRefreshInventory}
        >
          Refresh
        </button>
      </div>
      <button
        class="mt-3 w-full rounded-lg border border-dashed border-cyan-500/40 px-3 py-2 text-xs font-medium text-cyan-200 transition hover:bg-cyan-950"
        onClick={props.onAddAccount}
      >
        + Add account
      </button>
      <button
        class="mt-2 flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-xs font-medium text-slate-300 transition hover:bg-slate-800 hover:text-cyan-200"
        onClick={props.onOpenSettings}
      >
        <svg
          class="h-4 w-4"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="1.8"
          stroke-linecap="round"
          stroke-linejoin="round"
          aria-hidden="true"
        >
          <circle cx="12" cy="12" r="3.2" />
          <path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 0 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.6V21a2 2 0 0 1-4 0v-.1a1.7 1.7 0 0 0-1-1.6 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 0 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.6-1H3a2 2 0 0 1 0-4h.1a1.7 1.7 0 0 0 1.6-1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 0 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3h.1a1.7 1.7 0 0 0 1-1.6V3a2 2 0 0 1 4 0v.1a1.7 1.7 0 0 0 1 1.6h.1a1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 0 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8v.1a1.7 1.7 0 0 0 1.6 1H21a2 2 0 0 1 0 4h-.1a1.7 1.7 0 0 0-1.6 1Z" />
        </svg>
        Settings
      </button>
    </div>
  );
}
