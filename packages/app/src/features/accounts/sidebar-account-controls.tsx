import { Show, type Accessor, type Setter } from "solid-js";
import { AccountSwitcher } from "./AccountSwitcher.js";
import { SettingsView } from "../settings/SettingsView.js";
import { IconButton } from "../../shared/ui/IconButton.js";
import { Popover } from "../../shared/ui/Popover.js";
import { supportsPullToRefresh } from "../../shared/ui/PullToRefresh.js";
import type { SidebarProps } from "../shell/Sidebar.js";
import {
  isCommerceScreen,
  isEconomyInventoryScreen,
  isInventoryScreen,
} from "../shell/view.js";

type SidebarAccountControlsProps = Pick<
  SidebarProps,
  | "view"
  | "connection"
  | "inventory"
  | "accounts"
  | "settings"
  | "compactMode"
  | "setCompactMode"
  | "onAddAccount"
  | "onSignInAccount"
  | "onSignOutAccount"
  | "onDeleteAccount"
  | "onRefreshInventory"
  | "onRefreshCurrentInventory"
  | "onOpenAccount"
  | "onSaveSettings"
> & {
  state: {
    accountOpen: Accessor<boolean>;
    settingsOpen: Accessor<boolean>;
    setAccountOpen: Setter<boolean>;
    setSettingsOpen: Setter<boolean>;
    setModeMenuOpen: Setter<boolean>;
    setKindMenuOpen: Setter<boolean>;
    setCompactMenuOpen: Setter<boolean>;
  };
};

function accountInitials(props: SidebarAccountControlsProps) {
  return (
    props.connection?.accountName ||
    props.connection?.steamId ||
    "A"
  ).slice(0, 2);
}

function AccountButton(
  props: SidebarAccountControlsProps & {
    state: SidebarAccountControlsProps["state"];
  },
) {
  const state = props.state;
  return (
    <button
      class="flex items-center gap-2 rounded-full border border-slate-800 bg-slate-900 px-2 py-1.5 text-sm text-slate-200 transition hover:border-cyan-400/40 hover:text-cyan-200"
      aria-label={
        props.connection?.accountName
          ? `Account: ${props.connection.accountName}`
          : "Account"
      }
      aria-haspopup="dialog"
      aria-expanded={state.accountOpen()}
      onClick={() => {
        state.setAccountOpen((value) => !value);
        state.setSettingsOpen(false);
        state.setKindMenuOpen(false);
        state.setCompactMenuOpen(false);
      }}
    >
      <div class="flex h-7 w-7 shrink-0 items-center justify-center overflow-hidden rounded-full border border-slate-700 bg-slate-900">
        <Show
          when={props.connection?.avatarUrl}
          fallback={
            <span class="text-[10px] font-semibold uppercase tracking-[0.2em] text-slate-400">
              {accountInitials(props)}
            </span>
          }
        >
          <img
            class="h-full w-full object-cover"
            src={props.connection?.avatarUrl}
            alt="Account avatar"
            loading="lazy"
          />
        </Show>
      </div>
      <span class="hidden max-w-30 truncate text-sm font-medium text-slate-100 lg:inline">
        {props.connection?.accountName ||
          props.connection?.steamId ||
          "Account"}
      </span>
    </button>
  );
}

export function SidebarAccountControls(props: SidebarAccountControlsProps) {
  const state = props.state;
  const openSettings = () => {
    state.setAccountOpen(false);
    state.setSettingsOpen(true);
  };
  return (
    <div class="ml-auto flex items-center gap-2">
      <Show
        when={
          (isInventoryScreen(props.view) ||
            isEconomyInventoryScreen(props.view) ||
            isCommerceScreen(props.view)) &&
          !supportsPullToRefresh()
        }
      >
        <IconButton
          class="hidden sm:inline-flex"
          label="Refresh inventory"
          onClick={props.onRefreshCurrentInventory}
        >
          <svg
            class="h-4 w-4"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="1.8"
            stroke-linecap="round"
            stroke-linejoin="round"
          >
            <path d="M20 6v5h-5" />
            <path d="M4 18v-5h5" />
            <path d="M18.5 9a7 7 0 0 0-11.8-2.6L4 9" />
            <path d="M5.5 15a7 7 0 0 0 11.8 2.6L20 15" />
          </svg>
        </IconButton>
      </Show>
      <Popover
        class="relative"
        open={state.accountOpen() || state.settingsOpen()}
        onOpenChange={(open) => {
          if (!open) {
            state.setAccountOpen(false);
            state.setSettingsOpen(false);
          }
        }}
      >
        <AccountButton {...props} state={state} />
        <Show when={state.accountOpen()}>
          <div class="absolute right-0 top-full z-30 mt-2 w-72 rounded-2xl border border-slate-800/80 bg-slate-950 p-3 shadow-2xl">
            <AccountSwitcher
              inventory={props.inventory}
              accounts={props.accounts}
              onAddAccount={props.onAddAccount}
              onSignInAccount={props.onSignInAccount}
              onSignOutAccount={props.onSignOutAccount}
              onDeleteAccount={props.onDeleteAccount}
              onRefreshInventory={props.onRefreshInventory}
              onOpenAccount={props.onOpenAccount}
              onOpenSettings={openSettings}
            />
          </div>
        </Show>
        <Show when={state.settingsOpen()}>
          <div class="absolute right-0 top-full z-30 mt-2 max-h-[calc(100dvh-4.75rem)] w-[min(82vw,760px)] overflow-y-auto overscroll-contain rounded-3xl border border-slate-800/80 bg-slate-950 p-3 shadow-2xl">
            <SettingsView
              settings={props.settings}
              inventory={props.inventory}
              compactMode={props.compactMode}
              onCompactModeChange={props.setCompactMode}
              onRefresh={() => props.onRefreshInventory()}
              onSave={props.onSaveSettings}
            />
          </div>
        </Show>
      </Popover>
    </div>
  );
}
