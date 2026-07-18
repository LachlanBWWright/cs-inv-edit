import { createSignal, For, Show } from "solid-js";
import type { ConnectionStatus, HealthStatus, InventoryItemDto, InventorySnapshot, SettingsData, SteamAccountProfile } from "@cs-inv-edit/contracts";
import { AccountSwitcher } from "./AccountSwitcher.js";
import { SettingsView } from "./SettingsView.js";
import { Input } from "./ui/Input.js";
import { Popover } from "./ui/Popover.js";
import type { AppMode, AppScreen } from "../view.js";
import { availableModes, isEconomyInventoryScreen, isInventoryScreen, modeForScreen } from "../view.js";

export interface SidebarProps {
  view: AppScreen;
  setView: (view: AppScreen) => void;
  platform: "desktop" | "web";
  health: HealthStatus | undefined;
  connection: ConnectionStatus | undefined;
  accounts: SteamAccountProfile[];
  inventory: InventorySnapshot | undefined;
  settings: SettingsData | undefined;
  query: string;
  setQuery: (value: string) => void;
  kindFilter: "all" | InventoryItemDto["kind"];
  setKindFilter: (value: "all" | InventoryItemDto["kind"]) => void;
  compactMode: "icons" | "concise" | "detailed";
  setCompactMode: (value: "icons" | "concise" | "detailed") => void;
  onAddAccount: () => void;
  onSignInAccount: (account: SteamAccountProfile) => void;
  onSignOutAccount: (account: SteamAccountProfile) => void;
  onDeleteAccount: (account: SteamAccountProfile) => void;
  onRefreshInventory: () => void;
  onOpenAccount?: () => void;
  onSaveSettings: (next: SettingsData) => Promise<void>;
}

export function Sidebar(props: SidebarProps) {
  const [accountOpen, setAccountOpen] = createSignal(false);
  const [settingsOpen, setSettingsOpen] = createSignal(false);
  const [kindMenuOpen, setKindMenuOpen] = createSignal(false);
  const [compactMenuOpen, setCompactMenuOpen] = createSignal(false);
  const chooseMode = (mode: AppMode) => props.setView(mode);
	const modeLabel: Record<AppMode, string> = { inventory: "Inventory", "inventory-storage": "Storage move selection (stub)", "inventory-tradeup": "Trade-up input selection (stub)", trades: "Trades", armory: "Armory", store: "Store", "steam-inventory": "Steam Inventory", "tf2-inventory": "Team Fortress 2 Inventory", "dota2-inventory": "Dota 2 Inventory" };

  return (
    <header class="sticky top-0 z-20 flex flex-wrap items-center gap-2 border-b border-slate-800/80 bg-slate-950/90 px-3 py-2 backdrop-blur lg:px-4">
      <Show when={props.view !== "account"}><label class="relative shrink-0">
        <span class="sr-only">Mode</span>
        <select
          aria-label="Mode"
          class="h-9 min-w-32 cursor-pointer appearance-auto rounded-lg border border-slate-700 bg-slate-900 px-3 text-sm font-medium text-slate-100 hover:border-cyan-400/50"
          value={props.view === "account" ? modeForScreen(props.view) : props.view}
          onInput={(event) => chooseMode(event.currentTarget.value as AppMode)}
          onChange={(event) => chooseMode(event.currentTarget.value as AppMode)}
        >
		  <For each={availableModes(props.settings?.featureFlags)}>{(mode) => <option value={mode}>{modeLabel[mode]}</option>}</For>
        </select>
      </label></Show>
      <Show when={isInventoryScreen(props.view) || isEconomyInventoryScreen(props.view)}><div class="flex min-w-0 flex-1 flex-wrap items-center gap-2">
        <div class="flex min-w-0 flex-1 flex-wrap items-center gap-2">
          <div class="relative min-w-[220px] flex-1">
            <Input class="w-full min-w-0" placeholder="Search" value={props.query} onInput={(event) => props.setQuery((event.currentTarget as HTMLInputElement | null)?.value ?? "")} />
          </div>
          <Show when={isInventoryScreen(props.view)}><Popover class="relative" open={kindMenuOpen()} onOpenChange={setKindMenuOpen}>
            <button class="flex h-9 items-center gap-2 rounded-lg border border-slate-700 bg-slate-900/80 px-3 text-sm font-medium text-slate-200 transition hover:border-cyan-400/50 hover:text-cyan-100" aria-label="Filter inventory" aria-haspopup="menu" aria-expanded={kindMenuOpen()} onClick={() => { setKindMenuOpen((value) => !value); setCompactMenuOpen(false); setSettingsOpen(false); }}>
              <svg class="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
                <path d="M4 5h16" />
                <path d="M8 12h8" />
                <path d="M10 19h4" />
              </svg>
              <span class="hidden sm:inline">Filter</span>
              <svg class="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m6 9 6 6 6-6" /></svg>
            </button>
            <Show when={kindMenuOpen()}>
              <div class="absolute right-0 top-full z-30 mt-2 min-w-44 rounded-2xl border border-slate-800/80 bg-slate-950/95 p-2 shadow-2xl">
                <button class="flex w-full items-center rounded-xl px-3 py-2 text-left text-sm text-slate-200 hover:bg-slate-800/80" onClick={() => { props.setKindFilter("all"); setKindMenuOpen(false); }}>All kinds</button>
                <button class="flex w-full items-center rounded-xl px-3 py-2 text-left text-sm text-slate-200 hover:bg-slate-800/80" onClick={() => { props.setKindFilter("weapon_skin"); setKindMenuOpen(false); }}>Weapon skins</button>
                <button class="flex w-full items-center rounded-xl px-3 py-2 text-left text-sm text-slate-200 hover:bg-slate-800/80" onClick={() => { props.setKindFilter("sticker_item"); setKindMenuOpen(false); }}>Stickers</button>
                <button class="flex w-full items-center rounded-xl px-3 py-2 text-left text-sm text-slate-200 hover:bg-slate-800/80" onClick={() => { props.setKindFilter("tool_item"); setKindMenuOpen(false); }}>Tools</button>
                <button class="flex w-full items-center rounded-xl px-3 py-2 text-left text-sm text-slate-200 hover:bg-slate-800/80" onClick={() => { props.setKindFilter("container"); setKindMenuOpen(false); }}>Containers</button>
              </div>
            </Show>
          </Popover></Show>
          <Popover class="relative" open={compactMenuOpen()} onOpenChange={setCompactMenuOpen}>
            <button class="flex h-9 items-center gap-2 rounded-lg border border-slate-700 bg-slate-900/80 px-3 text-sm font-medium text-slate-200 transition hover:border-cyan-400/50 hover:text-cyan-100" aria-label="Inventory display size" aria-haspopup="menu" aria-expanded={compactMenuOpen()} onClick={() => { setCompactMenuOpen((value) => !value); setKindMenuOpen(false); setSettingsOpen(false); }}>
              <svg class="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
                <rect x="4" y="4" width="7" height="7" rx="1.2" />
                <rect x="13" y="4" width="7" height="7" rx="1.2" />
                <rect x="4" y="13" width="7" height="7" rx="1.2" />
                <rect x="13" y="13" width="7" height="7" rx="1.2" />
              </svg>
              <span class="hidden sm:inline">Size</span>
              <svg class="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m6 9 6 6 6-6" /></svg>
            </button>
            <Show when={compactMenuOpen()}>
              <div class="absolute right-0 top-full z-30 mt-2 min-w-40 rounded-2xl border border-slate-800/80 bg-slate-950/95 p-2 shadow-2xl">
                <button class="flex w-full items-center rounded-xl px-3 py-2 text-left text-sm text-slate-200 hover:bg-slate-800/80" onClick={() => { props.setCompactMode("icons"); setCompactMenuOpen(false); }}>Icons</button>
                <button class="flex w-full items-center rounded-xl px-3 py-2 text-left text-sm text-slate-200 hover:bg-slate-800/80" onClick={() => { props.setCompactMode("concise"); setCompactMenuOpen(false); }}>Concise</button>
                <button class="flex w-full items-center rounded-xl px-3 py-2 text-left text-sm text-slate-200 hover:bg-slate-800/80" onClick={() => { props.setCompactMode("detailed"); setCompactMenuOpen(false); }}>Detailed</button>
              </div>
            </Show>
          </Popover>
        </div>
      </div></Show>

      <div class="ml-auto flex items-center gap-2">
        <Popover class="relative" open={settingsOpen()} onOpenChange={setSettingsOpen}>
          <button class="flex h-9 w-9 items-center justify-center rounded-lg border border-slate-700 bg-slate-900/80 text-slate-200 transition hover:border-cyan-400/50 hover:text-cyan-100" aria-label="Settings" title="Settings" aria-haspopup="dialog" aria-expanded={settingsOpen()} onClick={() => { setSettingsOpen((value) => !value); setKindMenuOpen(false); setCompactMenuOpen(false); setAccountOpen(false); }}>
            <svg class="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
              <circle cx="12" cy="12" r="3.2" />
              <path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 0 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.6V21a2 2 0 0 1-4 0v-.1a1.7 1.7 0 0 0-1-1.6 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 0 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.6-1H3a2 2 0 0 1 0-4h.1a1.7 1.7 0 0 0 1.6-1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 0 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3h.1a1.7 1.7 0 0 0 1-1.6V3a2 2 0 0 1 4 0v.1a1.7 1.7 0 0 0 1 1.6h.1a1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 0 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8v.1a1.7 1.7 0 0 0 1.6 1H21a2 2 0 0 1 0 4h-.1a1.7 1.7 0 0 0-1.6 1Z" />
            </svg>
          </button>
          <Show when={settingsOpen()}>
            <div class="absolute right-0 top-full z-30 mt-2 w-[min(82vw,760px)] rounded-3xl border border-slate-800/80 bg-slate-950/95 p-3 shadow-2xl">
              <SettingsView settings={props.settings} inventory={props.inventory} onRefresh={() => props.onRefreshInventory()} onSave={props.onSaveSettings} />
            </div>
          </Show>
        </Popover>
        <Popover class="relative" open={accountOpen()} onOpenChange={setAccountOpen}>
          <button class="flex items-center gap-2 rounded-full border border-slate-800 bg-slate-900/80 px-2 py-1.5 text-sm text-slate-200 transition hover:border-cyan-400/40 hover:text-cyan-200" aria-label={props.connection?.accountName ? `Account: ${props.connection.accountName}` : "Account"} aria-haspopup="dialog" aria-expanded={accountOpen()} onClick={() => { setAccountOpen((value) => !value); setSettingsOpen(false); setKindMenuOpen(false); setCompactMenuOpen(false); }}>
            <div class="flex h-7 w-7 shrink-0 items-center justify-center overflow-hidden rounded-full border border-slate-700 bg-slate-900/80">
              <Show when={props.connection?.avatarUrl} fallback={<span class="text-[10px] font-semibold uppercase tracking-[0.2em] text-slate-400">{(props.connection?.accountName || props.connection?.steamId || "A").slice(0, 2)}</span>}>
                <img class="h-full w-full object-cover" src={props.connection?.avatarUrl} alt="Account avatar" loading="lazy" />
              </Show>
            </div>
            <span class="hidden max-w-30 truncate text-sm font-medium text-slate-100 sm:inline">{props.connection?.accountName || props.connection?.steamId || "Account"}</span>
          </button>
          <Show when={accountOpen()}>
            <div class="absolute right-0 top-full z-30 mt-2 w-72 rounded-2xl border border-slate-800/80 bg-slate-950/95 p-3 shadow-2xl">
              <AccountSwitcher inventory={props.inventory} accounts={props.accounts} onAddAccount={props.onAddAccount} onSignInAccount={props.onSignInAccount} onSignOutAccount={props.onSignOutAccount} onDeleteAccount={props.onDeleteAccount} onRefreshInventory={props.onRefreshInventory} onOpenAccount={props.onOpenAccount} />
            </div>
          </Show>
        </Popover>
      </div>
    </header>
  );
}
