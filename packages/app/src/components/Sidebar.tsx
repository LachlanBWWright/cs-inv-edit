import { createMemo, createSignal, For, Show } from "solid-js";
import type { ConnectionStatus, HealthStatus, InventoryItemDto, InventorySnapshot, SettingsData, SteamAccountProfile } from "@cs-inv-edit/contracts";
import { AccountSwitcher } from "./AccountSwitcher.js";
import { SettingsView } from "./SettingsView.js";
import { Input } from "./ui/Input.js";
import { Popover } from "./ui/Popover.js";
import type { AppMode, AppScreen } from "../view.js";
import { availableModes, isEconomyInventoryScreen, isInventoryScreen, modeForScreen } from "../view.js";
import { InventoryFilters } from "./inventory-view-content-sections.js";
import type { InventorySort } from "./inventory-view-utils.js";
import { supportsPullToRefresh } from "./ui/PullToRefresh.js";

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
  rarityFilter: string;
  setRarityFilter: (value: string) => void;
  weaponFilter: string;
  setWeaponFilter: (value: string) => void;
  collectionFilter: string;
  setCollectionFilter: (value: string) => void;
  sort: InventorySort;
  setSort: (value: InventorySort) => void;
  rarityOptions: string[];
  weaponOptions: string[];
  collectionOptions: string[];
  compactMode: "icons" | "concise" | "detailed";
  setCompactMode: (value: "icons" | "concise" | "detailed") => void;
  onAddAccount: () => void;
  onSignInAccount: (account: SteamAccountProfile) => void;
  onSignOutAccount: (account: SteamAccountProfile) => void;
  onDeleteAccount: (account: SteamAccountProfile) => void;
  onRefreshInventory: () => void;
  onRefreshCurrentInventory: () => void;
  onOpenAccount?: () => void;
  onSaveSettings: (next: SettingsData) => Promise<void>;
}

const modeDetails: Record<AppMode, { label: string; description: string; mark: string }> = {
  inventory: { label: "Inventory", description: "Browse and edit CS2 items", mark: "CS" },
  "inventory-storage": { label: "Storage units", description: "Move items in or out", mark: "CS" },
  "inventory-tradeup": { label: "Trade-up", description: "Build a contract", mark: "CS" },
  armory: { label: "Armory", description: "View passes and rewards", mark: "CS" },
  store: { label: "Store", description: "Browse in-game offers", mark: "CS" },
  trades: { label: "Trades", description: "Review Steam trade offers", mark: "S" },
  "steam-inventory": { label: "Steam inventory", description: "Items across Steam", mark: "S" },
  "tf2-inventory": { label: "Team Fortress 2", description: "View your TF2 inventory", mark: "TF" },
  "dota2-inventory": { label: "Dota 2", description: "View your Dota inventory", mark: "D2" },
};

const modeGroups: { label: string; accent: string; modes: AppMode[] }[] = [
  { label: "Counter-Strike 2", accent: "bg-amber-400", modes: ["inventory", "inventory-storage", "inventory-tradeup", "armory", "store"] },
  { label: "Steam platform", accent: "bg-cyan-400", modes: ["trades", "steam-inventory"] },
  { label: "Team Fortress 2", accent: "bg-red-400", modes: ["tf2-inventory"] },
  { label: "Dota 2", accent: "bg-violet-400", modes: ["dota2-inventory"] },
];

export function Sidebar(props: SidebarProps) {
  const [accountOpen, setAccountOpen] = createSignal(false);
  const [settingsOpen, setSettingsOpen] = createSignal(false);
  const [modeMenuOpen, setModeMenuOpen] = createSignal(false);
  const [kindMenuOpen, setKindMenuOpen] = createSignal(false);
  const [compactMenuOpen, setCompactMenuOpen] = createSignal(false);
  const chooseMode = (mode: AppMode) => {
    props.setView(mode);
    setModeMenuOpen(false);
  };
  const currentMode = createMemo(() => modeForScreen(props.view));
  const currentGroup = createMemo(() => modeGroups.find((group) => group.modes.includes(currentMode()))?.label ?? "Mode");
  const enabledModes = createMemo(() => new Set(availableModes(props.settings?.featureFlags)));

  return (
    <header class="sticky top-0 z-20 flex flex-wrap items-center gap-2 border-b border-slate-800/80 bg-slate-950/90 px-3 py-2 backdrop-blur lg:px-4">
      <Show when={props.view !== "account"}>
        <Popover class="relative shrink-0" open={modeMenuOpen()} onOpenChange={setModeMenuOpen}>
          <button
            class="group flex h-11 min-w-48 items-center gap-2.5 rounded-xl border border-slate-700/80 bg-slate-900/90 px-2.5 text-left shadow-sm transition hover:border-cyan-400/50 hover:bg-slate-900"
            aria-label={`Mode: ${modeDetails[currentMode()].label}`}
            aria-haspopup="menu"
            aria-expanded={modeMenuOpen()}
            onClick={() => { setModeMenuOpen((value) => !value); setKindMenuOpen(false); setCompactMenuOpen(false); setSettingsOpen(false); }}
          >
            <span class="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg border border-white/10 bg-cyan-400/10 text-[9px] font-bold tracking-wide text-cyan-200">{modeDetails[currentMode()].mark}</span>
            <span class="min-w-0 flex-1 leading-tight">
              <span class="block text-[9px] font-semibold uppercase tracking-[0.16em] text-slate-500">{currentGroup()}</span>
              <span class="block truncate text-sm font-semibold text-slate-100">{modeDetails[currentMode()].label}</span>
            </span>
            <svg class={`h-4 w-4 shrink-0 text-slate-400 transition-transform ${modeMenuOpen() ? "rotate-180" : ""}`} viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m6 9 6 6 6-6" /></svg>
          </button>
          <Show when={modeMenuOpen()}>
            <div class="absolute left-0 top-full z-30 mt-2 w-80 overflow-hidden rounded-2xl border border-slate-700/80 bg-slate-950/98 p-2 shadow-2xl shadow-black/40" role="menu" aria-label="Application mode">
              <For each={modeGroups}>{(group, groupIndex) => {
                const visibleModes = () => group.modes.filter((mode) => enabledModes().has(mode));
                return <Show when={visibleModes().length > 0}>
                  <section class={groupIndex() > 0 ? "mt-2 border-t border-slate-800 pt-2" : ""}>
                    <div class="flex items-center gap-2 px-2 pb-1.5 pt-1">
                      <span class={`h-1.5 w-1.5 rounded-full ${group.accent}`} />
                      <p class="text-[10px] font-bold uppercase tracking-[0.2em] text-slate-400">{group.label}</p>
                    </div>
                    <div class="space-y-1">
                      <For each={visibleModes()}>{(mode) => {
                        const selected = () => currentMode() === mode;
                        return <button
                          class={`flex w-full items-center gap-3 rounded-xl border px-2.5 py-2 text-left transition ${selected() ? "border-cyan-400/25 bg-cyan-400/10" : "border-transparent hover:border-slate-700/70 hover:bg-slate-800/70"}`}
                          role="menuitemradio"
                          aria-checked={selected()}
                          onClick={() => chooseMode(mode)}
                        >
                          <span class={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-[10px] font-bold tracking-wide ${selected() ? "bg-cyan-400 text-slate-950" : "border border-slate-700 bg-slate-900 text-slate-300"}`}>{modeDetails[mode].mark}</span>
                          <span class="min-w-0 flex-1">
                            <span class={`block text-sm font-semibold ${selected() ? "text-cyan-100" : "text-slate-100"}`}>{modeDetails[mode].label}</span>
                            <span class="block truncate text-xs text-slate-500">{modeDetails[mode].description}</span>
                          </span>
                          <Show when={selected()}><svg class="h-4 w-4 shrink-0 text-cyan-300" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="m5 12 4 4L19 6" /></svg></Show>
                        </button>;
                      }}</For>
                    </div>
                  </section>
                </Show>;
              }}</For>
            </div>
          </Show>
        </Popover>
      </Show>
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
              <div class="absolute right-0 top-full z-30 mt-2 w-72 rounded-2xl border border-slate-700/80 bg-slate-950/98 p-3 shadow-2xl shadow-black/40">
                <div class="mb-3 flex items-center justify-between">
                  <div><p class="text-sm font-semibold text-slate-100">Inventory filters</p><p class="text-xs text-slate-500">Narrow and sort CS2 items</p></div>
                  <button class="rounded-lg px-2 py-1 text-xs font-medium text-cyan-300 hover:bg-cyan-400/10" onClick={() => { props.setKindFilter("all"); props.setRarityFilter("all"); props.setWeaponFilter("all"); props.setCollectionFilter("all"); props.setSort("name"); }}>Reset</button>
                </div>
                <InventoryFilters class="grid gap-2 [&_label]:block [&_select]:w-full" kindFilter={props.kindFilter} rarityFilter={props.rarityFilter} weaponFilter={props.weaponFilter} collectionFilter={props.collectionFilter} sort={props.sort} rarityOptions={props.rarityOptions} weaponOptions={props.weaponOptions} collectionOptions={props.collectionOptions} onKindFilterChange={props.setKindFilter} onRarityFilterChange={props.setRarityFilter} onWeaponFilterChange={props.setWeaponFilter} onCollectionFilterChange={props.setCollectionFilter} onSortChange={props.setSort} />
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
        <Show when={(isInventoryScreen(props.view) || isEconomyInventoryScreen(props.view)) && !supportsPullToRefresh()}>
          <button class="flex h-9 w-9 items-center justify-center rounded-lg border border-slate-700 bg-slate-900/80 text-slate-200 transition hover:border-cyan-400/50 hover:text-cyan-100" aria-label="Refresh inventory" title="Refresh inventory" onClick={props.onRefreshCurrentInventory}>
            <svg class="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6v5h-5" /><path d="M4 18v-5h5" /><path d="M18.5 9a7 7 0 0 0-11.8-2.6L4 9" /><path d="M5.5 15a7 7 0 0 0 11.8 2.6L20 15" /></svg>
          </button>
        </Show>
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
