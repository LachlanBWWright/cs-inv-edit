import { createMemo, createSignal } from "solid-js";
import type { AppMode } from "./view.js";
import {
  availableModes,
  isCommerceScreen,
  isEconomyInventoryScreen,
  isInventoryScreen,
  modeForScreen,
} from "./view.js";
import { modeGroups } from "./navbar-mode-data.js";
import { NavbarModePicker } from "./navbar-mode-picker.js";
import { NavbarAccountControls } from "../accounts/navbar-account-controls.js";
import { MobileNavOptions } from "./navbar-mobile-options.js";
import { NavbarContextControls } from "./navbar-context-controls.js";
import type { NavbarProps } from "./navbar-props.js";
import { priceFeaturesEnabled } from "../../shared/lib/feature-flags.js";

export type { NavbarProps } from "./navbar-props.js";

export function Navbar(props: NavbarProps) {
  const [accountOpen, setAccountOpen] = createSignal(false);
  const [settingsOpen, setSettingsOpen] = createSignal(false);
  const [modeMenuOpen, setModeMenuOpen] = createSignal(false);
  const [, setKindMenuOpen] = createSignal(false);
  const [, setCompactMenuOpen] = createSignal(false);
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
  const sortOptions = [
    { value: "name" as const, label: "Name", detail: "A to Z" },
    { value: "float-low" as const, label: "Float", detail: "Low to high" },
    { value: "float-high" as const, label: "Float", detail: "High to low" },
    { value: "rarity-high" as const, label: "Rarity", detail: "High to low" },
    { value: "rarity-low" as const, label: "Rarity", detail: "Low to high" },
    {
      value: "price-high" as const,
      label: "Steam price",
      detail: "High to low",
    },
    {
      value: "price-low" as const,
      label: "Steam price",
      detail: "Low to high",
    },
  ];
  const visibleSortOptions = () =>
    sortOptions.filter(
      (option) =>
        priceFeaturesEnabled(props.settings) ||
        !option.value.startsWith("price-"),
    );
  const hasAdjacentControls = () =>
    isInventoryScreen(props.view) ||
    isEconomyInventoryScreen(props.view) ||
    isCommerceScreen(props.view) ||
    props.view === "tf2-matches" ||
    props.view === "tf2-campaigns" ||
    props.view === "cs2-features";
  return (
    <header class="sticky top-0 z-20 flex min-h-[42px] flex-nowrap items-stretch border-b border-slate-800 bg-slate-950 px-2 py-2 sm:px-3 lg:px-4">
      <div class="flex min-w-0 flex-[1_1_0%] items-stretch">
        <NavbarModePicker
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
          hasAdjacentControls={hasAdjacentControls()}
          compact
        />
        <NavbarContextControls {...props} />
        <button
          class="relative h-full border border-slate-700 px-3 py-2 text-sm sm:hidden"
          onClick={() => setMobileOptionsOpen(true)}
        >
          Options{activeFilterCount() ? ` (${activeFilterCount()})` : ""}
        </button>
      </div>
      <NavbarAccountControls
        view={props.view}
        connection={props.connection}
        inventory={props.inventory}
        accounts={props.accounts}
        settings={props.settings}
        compactMode={props.compactMode}
        setCompactMode={props.setCompactMode}
        onAddAccount={props.onAddAccount}
        onSignInAccount={props.onSignInAccount}
        onSignOutAccount={props.onSignOutAccount}
        onDeleteAccount={props.onDeleteAccount}
        onRefreshInventory={props.onRefreshInventory}
        onRefreshCurrentInventory={props.onRefreshCurrentInventory}
        onOpenAccount={props.onOpenAccount}
        onSaveSettings={props.onSaveSettings}
        hasAdjacentControls={hasAdjacentControls()}
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
        sortOptions={visibleSortOptions()}
        props={props}
      />
    </header>
  );
}
