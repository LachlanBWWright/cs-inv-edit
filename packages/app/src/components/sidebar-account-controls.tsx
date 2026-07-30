import { Show, type Accessor, type Setter } from "solid-js";
import { AccountSwitcher } from "./AccountSwitcher.js";
import { SettingsView } from "./SettingsView.js";
import { IconButton } from "./ui/IconButton.js";
import { Popover } from "./ui/Popover.js";
import { supportsPullToRefresh } from "./ui/PullToRefresh.js";
import type { SidebarProps } from "./Sidebar.js";
import { isEconomyInventoryScreen, isInventoryScreen } from "../view.js";

export function SidebarAccountControls(
  props: SidebarProps & {
    state: {
      accountOpen: Accessor<boolean>;
      settingsOpen: Accessor<boolean>;
      setAccountOpen: Setter<boolean>;
      setSettingsOpen: Setter<boolean>;
      setModeMenuOpen: Setter<boolean>;
      setKindMenuOpen: Setter<boolean>;
      setCompactMenuOpen: Setter<boolean>;
    };
  },
) {
  const state = props.state;
  return (
    <div class="ml-auto flex items-center gap-2">
      <Show
        when={
          (isInventoryScreen(props.view) ||
            isEconomyInventoryScreen(props.view)) &&
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
        class="relative hidden sm:block"
        open={state.settingsOpen()}
        onOpenChange={state.setSettingsOpen}
      >
        <IconButton
          label="Settings"
          popup="dialog"
          expanded={state.settingsOpen()}
          onClick={() => {
            state.setSettingsOpen((value) => !value);
            state.setKindMenuOpen(false);
            state.setCompactMenuOpen(false);
            state.setAccountOpen(false);
          }}
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
            <circle cx="12" cy="12" r="3.2" />
            <path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 0 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.6V21a2 2 0 0 1-4 0v-.1a1.7 1.7 0 0 0-1-1.6 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 0 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.6-1H3a2 2 0 0 1 0-4h.1a1.7 1.7 0 0 0 1.6-1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 0 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3h.1a1.7 1.7 0 0 0 1-1.6V3a2 2 0 0 1 4 0v.1a1.7 1.7 0 0 0 1 1.6h.1a1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 0 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8v.1a1.7 1.7 0 0 0 1.6 1H21a2 2 0 0 1 0 4h-.1a1.7 1.7 0 0 0-1.6 1Z" />
          </svg>
        </IconButton>
        <Show when={state.settingsOpen()}>
          <div class="absolute right-0 top-full z-30 mt-2 w-[min(82vw,760px)] rounded-3xl border border-slate-800/80 bg-slate-950/95 p-3 shadow-2xl">
            <SettingsView
              settings={props.settings}
              inventory={props.inventory}
              onRefresh={() => props.onRefreshInventory()}
              onSave={props.onSaveSettings}
            />
          </div>
        </Show>
      </Popover>
      <Popover
        class="relative"
        open={state.accountOpen()}
        onOpenChange={state.setAccountOpen}
      >
        <button
          class="flex items-center gap-2 rounded-full border border-slate-800 bg-slate-900/80 px-2 py-1.5 text-sm text-slate-200 transition hover:border-cyan-400/40 hover:text-cyan-200"
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
          <div class="flex h-7 w-7 shrink-0 items-center justify-center overflow-hidden rounded-full border border-slate-700 bg-slate-900/80">
            <Show
              when={props.connection?.avatarUrl}
              fallback={
                <span class="text-[10px] font-semibold uppercase tracking-[0.2em] text-slate-400">
                  {(
                    props.connection?.accountName ||
                    props.connection?.steamId ||
                    "A"
                  ).slice(0, 2)}
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
          <span class="hidden max-w-30 truncate text-sm font-medium text-slate-100 sm:inline">
            {props.connection?.accountName ||
              props.connection?.steamId ||
              "Account"}
          </span>
        </button>
        <Show when={state.accountOpen()}>
          <div class="absolute right-0 top-full z-30 mt-2 w-72 rounded-2xl border border-slate-800/80 bg-slate-950/95 p-3 shadow-2xl">
            <AccountSwitcher
              inventory={props.inventory}
              accounts={props.accounts}
              onAddAccount={props.onAddAccount}
              onSignInAccount={props.onSignInAccount}
              onSignOutAccount={props.onSignOutAccount}
              onDeleteAccount={props.onDeleteAccount}
              onRefreshInventory={props.onRefreshInventory}
              onOpenAccount={props.onOpenAccount}
            />
          </div>
        </Show>
      </Popover>
    </div>
  );
}
