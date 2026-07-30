import { createMemo, createSignal, For, Show } from "solid-js";
import type {
  ConnectionStatus,
  HealthStatus,
  InventoryItemDto,
  InventorySnapshot,
  SettingsData,
  SteamAccountProfile,
} from "@cs-inv-edit/contracts";
import { Input } from "./ui/Input.js";
import { Popover } from "./ui/Popover.js";
import { Select } from "./ui/Select.js";
import { IconButton } from "./ui/IconButton.js";
import type { AppMode, AppScreen } from "../view.js";
import {
  availableModes,
  isEconomyInventoryScreen,
  isInventoryScreen,
  modeForScreen,
} from "../view.js";
import { InventoryFilters } from "./inventory-view-content-sections.js";
import type { InventorySort } from "./inventory-view-utils.js";

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
  economyTagFilter: string;
  setEconomyTagFilter: (value: string) => void;
  economyCategoryOptions: [string, string][];
  onAddAccount: () => void;
  onSignInAccount: (account: SteamAccountProfile) => void;
  onSignOutAccount: (account: SteamAccountProfile) => void;
  onDeleteAccount: (account: SteamAccountProfile) => void;
  onRefreshInventory: () => void;
  onRefreshCurrentInventory: () => void;
  onOpenAccount?: () => void;
  onSaveSettings: (next: SettingsData) => Promise<void>;
}

import { modeGroups } from "./sidebar-mode-data.js";
import { SidebarModePicker } from "./sidebar-mode-picker.js";
import { SidebarAccountControls } from "./sidebar-account-controls.js";
import { MobileNavOptions } from "./sidebar-mobile-options.js";
export function Sidebar(props: SidebarProps) {
  const [accountOpen, setAccountOpen] = createSignal(false);
  const [settingsOpen, setSettingsOpen] = createSignal(false);
  const [modeMenuOpen, setModeMenuOpen] = createSignal(false);
  const [kindMenuOpen, setKindMenuOpen] = createSignal(false);
  const [sortMenuOpen, setSortMenuOpen] = createSignal(false);
  const [compactMenuOpen, setCompactMenuOpen] = createSignal(false);
  const [mobileOptionsOpen, setMobileOptionsOpen] = createSignal(false);
  const chooseMode = (mode: AppMode) => {
    props.setView(mode);
    setModeMenuOpen(false);
  };
  const currentMode = createMemo(() => modeForScreen(props.view));
  const currentGroup = createMemo(
    () =>
      modeGroups.find((group) => group.modes.includes(currentMode()))?.label ??
      "Mode",
  );
  const enabledModes = createMemo(
    () => new Set(availableModes(props.settings?.featureFlags)),
  );
  const activeFilterCount = createMemo(
    () =>
      [
        props.kindFilter,
        props.rarityFilter,
        props.weaponFilter,
        props.collectionFilter,
      ].filter((value) => value !== "all").length,
  );
  const sortOptions: { value: InventorySort; label: string; detail: string }[] =
    [
      { value: "name", label: "Name", detail: "A to Z" },
      { value: "float-low", label: "Float", detail: "Low to high" },
      { value: "float-high", label: "Float", detail: "High to low" },
      { value: "rarity-high", label: "Rarity", detail: "High to low" },
      { value: "rarity-low", label: "Rarity", detail: "Low to high" },
      { value: "price-high", label: "Steam price", detail: "High to low" },
      { value: "price-low", label: "Steam price", detail: "Low to high" },
    ];

  return (
    <header class="sticky top-0 z-20 flex flex-nowrap items-center gap-2 border-b border-slate-800/80 bg-slate-950/90 px-2 py-2 backdrop-blur sm:flex-wrap sm:px-3 lg:px-4">
      <SidebarModePicker
        view={props.view}
        modeMenuOpen={modeMenuOpen}
        currentMode={currentMode}
        currentGroup={currentGroup}
        enabledModes={enabledModes}
        chooseMode={chooseMode}
        setModeMenuOpen={setModeMenuOpen}
        setKindMenuOpen={setKindMenuOpen}
        setCompactMenuOpen={setCompactMenuOpen}
        setSettingsOpen={setSettingsOpen}
        compact
      />
      <Show
        when={
          isInventoryScreen(props.view) || isEconomyInventoryScreen(props.view)
        }
      >
        <div class="flex min-w-0 flex-1 items-center gap-2 sm:flex-wrap">
          <div class="flex min-w-0 flex-1 items-center gap-2 sm:flex-wrap">
            <div class="relative min-w-0 flex-1 sm:min-w-[220px]">
              <Input
                class="h-10 w-full min-w-0 px-2.5 sm:h-auto sm:px-3"
                placeholder="Search"
                value={props.query}
                onInput={(event) =>
                  props.setQuery(
                    (event.currentTarget as HTMLInputElement | null)?.value ??
                      "",
                  )
                }
              />
            </div>
            <Show when={isInventoryScreen(props.view)}>
              <Popover
                class="relative hidden sm:block"
                open={kindMenuOpen()}
                onOpenChange={setKindMenuOpen}
              >
                <button
                  class={`flex h-9 items-center gap-2 rounded-lg border px-3 text-sm font-medium transition ${activeFilterCount() > 0 ? "border-cyan-400/40 bg-cyan-400/10 text-cyan-100" : "border-slate-700 bg-slate-900/80 text-slate-200 hover:border-cyan-400/50 hover:text-cyan-100"}`}
                  aria-label={`Filter inventory${activeFilterCount() > 0 ? `, ${activeFilterCount()} active` : ""}`}
                  aria-haspopup="menu"
                  aria-expanded={kindMenuOpen()}
                  onClick={() => {
                    setKindMenuOpen((value) => !value);
                    setSortMenuOpen(false);
                    setCompactMenuOpen(false);
                    setSettingsOpen(false);
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
                    <path d="M4 5h16" />
                    <path d="M8 12h8" />
                    <path d="M10 19h4" />
                  </svg>
                  <span class="hidden sm:inline">Filter</span>
                  <Show when={activeFilterCount() > 0}>
                    <span class="flex h-5 min-w-5 items-center justify-center rounded-full bg-cyan-300 px-1 text-[10px] font-bold text-slate-950">
                      {activeFilterCount()}
                    </span>
                  </Show>
                  <svg
                    class="h-3.5 w-3.5"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    stroke-width="2"
                    stroke-linecap="round"
                    stroke-linejoin="round"
                  >
                    <path d="m6 9 6 6 6-6" />
                  </svg>
                </button>
                <Show when={kindMenuOpen()}>
                  <div class="absolute right-0 top-full z-30 mt-2 w-[min(92vw,28rem)] overflow-hidden rounded-2xl border border-slate-700/80 bg-slate-950/98 shadow-2xl shadow-black/50">
                    <div class="flex items-center justify-between border-b border-slate-800 px-4 py-3">
                      <div>
                        <p class="text-sm font-semibold text-slate-100">
                          Inventory filters
                        </p>
                        <p class="mt-0.5 text-xs text-slate-500">
                          Narrow the items shown below
                        </p>
                      </div>
                      <button
                        class="rounded-lg px-2 py-1 text-xs font-medium text-cyan-300 hover:bg-cyan-400/10"
                        onClick={() => {
                          props.setKindFilter("all");
                          props.setRarityFilter("all");
                          props.setWeaponFilter("all");
                          props.setCollectionFilter("all");
                        }}
                      >
                        Reset
                      </button>
                    </div>
                    <InventoryFilters
                      class="grid gap-3 p-4 sm:grid-cols-2"
                      kindFilter={props.kindFilter}
                      rarityFilter={props.rarityFilter}
                      weaponFilter={props.weaponFilter}
                      collectionFilter={props.collectionFilter}
                      rarityOptions={props.rarityOptions}
                      weaponOptions={props.weaponOptions}
                      collectionOptions={props.collectionOptions}
                      onKindFilterChange={props.setKindFilter}
                      onRarityFilterChange={props.setRarityFilter}
                      onWeaponFilterChange={props.setWeaponFilter}
                      onCollectionFilterChange={props.setCollectionFilter}
                    />
                  </div>
                </Show>
              </Popover>
            </Show>
            <Show
              when={
                isEconomyInventoryScreen(props.view) &&
                props.economyCategoryOptions.length > 0
              }
            >
              <label class="hidden sm:block">
                <span class="sr-only">Inventory item category</span>
                <Select
                  class="h-9 max-w-64 rounded-lg border border-slate-700 bg-slate-900 px-3 text-sm text-slate-200"
                  value={props.economyTagFilter}
                  onInput={(event) =>
                    props.setEconomyTagFilter(event.currentTarget.value)
                  }
                >
                  <option value="">All item categories</option>
                  <For each={props.economyCategoryOptions}>
                    {([value, label]) => <option value={value}>{label}</option>}
                  </For>
                </Select>
              </label>
            </Show>
            <Show when={isInventoryScreen(props.view)}>
              <Popover
                class="relative hidden sm:block"
                open={sortMenuOpen()}
                onOpenChange={setSortMenuOpen}
              >
                <button
                  class="flex h-9 items-center gap-2 rounded-lg border border-slate-700 bg-slate-900/80 px-3 text-sm font-medium text-slate-200 transition hover:border-cyan-400/50 hover:text-cyan-100"
                  aria-label="Sort inventory"
                  aria-haspopup="menu"
                  aria-expanded={sortMenuOpen()}
                  onClick={() => {
                    setSortMenuOpen((value) => !value);
                    setKindMenuOpen(false);
                    setCompactMenuOpen(false);
                    setSettingsOpen(false);
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
                    <path d="M8 6h11" />
                    <path d="M8 12h8" />
                    <path d="M8 18h5" />
                    <path d="m3 16 2 2 2-2" />
                    <path d="M5 18V5" />
                  </svg>
                  <span class="hidden sm:inline">Sort</span>
                  <svg
                    class="h-3.5 w-3.5"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    stroke-width="2"
                    stroke-linecap="round"
                    stroke-linejoin="round"
                  >
                    <path d="m6 9 6 6 6-6" />
                  </svg>
                </button>
                <Show when={sortMenuOpen()}>
                  <div
                    class="absolute right-0 top-full z-30 mt-2 w-64 rounded-2xl border border-slate-700/80 bg-slate-950/98 p-2 shadow-2xl shadow-black/50"
                    role="menu"
                    aria-label="Sort inventory"
                  >
                    <For each={sortOptions}>
                      {(option) => (
                        <button
                          class={`flex w-full items-center gap-3 rounded-xl border px-3 py-2 text-left transition ${props.sort === option.value ? "border-cyan-400/25 bg-cyan-400/10" : "border-transparent hover:border-slate-700/70 hover:bg-slate-800/70"}`}
                          role="menuitemradio"
                          aria-checked={props.sort === option.value}
                          onClick={() => {
                            props.setSort(option.value);
                            setSortMenuOpen(false);
                          }}
                        >
                          <span
                            class={`flex h-4 w-4 items-center justify-center rounded-full border ${props.sort === option.value ? "border-cyan-300" : "border-slate-600"}`}
                          >
                            <Show when={props.sort === option.value}>
                              <span class="h-2 w-2 rounded-full bg-cyan-300" />
                            </Show>
                          </span>
                          <span class="flex-1 text-sm font-medium text-slate-100">
                            {option.label}
                          </span>
                          <span class="text-xs text-slate-500">
                            {option.detail}
                          </span>
                        </button>
                      )}
                    </For>
                  </div>
                </Show>
              </Popover>
            </Show>
            <Popover
              class="relative hidden sm:block"
              open={compactMenuOpen()}
              onOpenChange={setCompactMenuOpen}
            >
              <button
                class="flex h-9 items-center gap-2 rounded-lg border border-slate-700 bg-slate-900/80 px-3 text-sm font-medium text-slate-200 transition hover:border-cyan-400/50 hover:text-cyan-100"
                aria-label="Inventory display size"
                aria-haspopup="menu"
                aria-expanded={compactMenuOpen()}
                onClick={() => {
                  setCompactMenuOpen((value) => !value);
                  setKindMenuOpen(false);
                  setSortMenuOpen(false);
                  setSettingsOpen(false);
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
                  <rect x="4" y="4" width="7" height="7" rx="1.2" />
                  <rect x="13" y="4" width="7" height="7" rx="1.2" />
                  <rect x="4" y="13" width="7" height="7" rx="1.2" />
                  <rect x="13" y="13" width="7" height="7" rx="1.2" />
                </svg>
                <span class="hidden sm:inline">Size</span>
                <svg
                  class="h-3.5 w-3.5"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  stroke-width="2"
                  stroke-linecap="round"
                  stroke-linejoin="round"
                >
                  <path d="m6 9 6 6 6-6" />
                </svg>
              </button>
              <Show when={compactMenuOpen()}>
                <div class="absolute right-0 top-full z-30 mt-2 min-w-40 rounded-2xl border border-slate-800/80 bg-slate-950/95 p-2 shadow-2xl">
                  <button
                    class="flex w-full items-center rounded-xl px-3 py-2 text-left text-sm text-slate-200 hover:bg-slate-800/80"
                    onClick={() => {
                      props.setCompactMode("icons");
                      setCompactMenuOpen(false);
                    }}
                  >
                    Icons
                  </button>
                  <button
                    class="flex w-full items-center rounded-xl px-3 py-2 text-left text-sm text-slate-200 hover:bg-slate-800/80"
                    onClick={() => {
                      props.setCompactMode("concise");
                      setCompactMenuOpen(false);
                    }}
                  >
                    Concise
                  </button>
                  <button
                    class="flex w-full items-center rounded-xl px-3 py-2 text-left text-sm text-slate-200 hover:bg-slate-800/80"
                    onClick={() => {
                      props.setCompactMode("detailed");
                      setCompactMenuOpen(false);
                    }}
                  >
                    Detailed
                  </button>
                </div>
              </Show>
            </Popover>
          </div>
        </div>
      </Show>

      <Show
        when={
          isInventoryScreen(props.view) || isEconomyInventoryScreen(props.view)
        }
      >
        <div class="relative sm:hidden">
          <IconButton
            label={`Inventory options${activeFilterCount() > 0 ? `, ${activeFilterCount()} active filters` : ""}`}
            expanded={mobileOptionsOpen()}
            popup="dialog"
            onClick={() => setMobileOptionsOpen(true)}
          >
            <svg
              class="h-5 w-5"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="2"
              stroke-linecap="round"
              aria-hidden="true"
            >
              <circle cx="5" cy="12" r="1" fill="currentColor" />
              <circle cx="12" cy="12" r="1" fill="currentColor" />
              <circle cx="19" cy="12" r="1" fill="currentColor" />
            </svg>
            <Show when={activeFilterCount() > 0}>
              <span class="absolute -right-1 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-cyan-300 px-1 text-[9px] font-bold text-slate-950">
                {activeFilterCount()}
              </span>
            </Show>
          </IconButton>
        </div>
      </Show>

      <SidebarAccountControls
        {...props}
        state={{
          accountOpen,
          settingsOpen,
          setAccountOpen,
          setSettingsOpen,
          setModeMenuOpen,
          setKindMenuOpen,
          setCompactMenuOpen,
        }}
      />
      <MobileNavOptions
        open={mobileOptionsOpen()}
        onClose={() => setMobileOptionsOpen(false)}
        activeFilterCount={activeFilterCount()}
        sortOptions={sortOptions}
        props={props}
      />
    </header>
  );
}
