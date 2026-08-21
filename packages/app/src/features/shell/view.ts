export type InventoryMode = "inventory";
export type EconomyInventoryMode =
  | "steam-inventory"
  | "steam-service-inventory"
  | "tf2-inventory"
  | "dota2-inventory";
export type TF2FeatureMode = "tf2-loadouts";
export type TF2ActivityMode = "tf2-matches" | "tf2-campaigns";
export type CS2FeatureMode = "cs2-features";
export type CS2LoadoutMode = "cs2-loadouts";
export type AppMode =
  | InventoryMode
  | EconomyInventoryMode
  | CS2FeatureMode
  | CS2LoadoutMode
  | TF2FeatureMode
  | TF2ActivityMode
  | "tf2-store"
  | "armory"
  | "store"
  | "trades";
export type AppScreen = AppMode | "account";

const tf2FeatureModes: readonly TF2FeatureMode[] = ["tf2-loadouts"];
const appModes: readonly AppMode[] = [
  "inventory",
  "cs2-features",
  "cs2-loadouts",
  "trades",
  "armory",
  "store",
  "steam-inventory",
  "steam-service-inventory",
  "tf2-inventory",
  ...tf2FeatureModes,
  "tf2-matches",
  "tf2-campaigns",
  "tf2-store",
  "dota2-inventory",
];

export function isAppMode(value: string | null): value is AppMode {
  return value !== null && appModes.some((mode) => mode === value);
}

export function availableModes(flags?: {
  enableSteamInventory?: boolean;
  enableCs2Loadouts?: boolean;
  enableTf2Inventory: boolean;
  enableTf2Store?: boolean;
  enableDota2Inventory: boolean;
}): AppMode[] {
  const modes: AppMode[] = [
    "inventory",
    "cs2-features",
    "trades",
    "armory",
    "store",
  ];
  if (flags?.enableCs2Loadouts) modes.push("cs2-loadouts");
  if (flags?.enableTf2Inventory)
    modes.push(
      "tf2-inventory",
      ...tf2FeatureModes,
      "tf2-matches",
      "tf2-campaigns",
    );
  if (flags?.enableTf2Store !== false) modes.push("tf2-store");
  if (flags?.enableDota2Inventory) modes.push("dota2-inventory");
  if (flags?.enableSteamInventory)
    modes.push("steam-inventory", "steam-service-inventory");
  return modes;
}

export function isTF2FeatureScreen(
  screen: AppScreen,
): screen is TF2FeatureMode {
  return tf2FeatureModes.some((mode) => mode === screen);
}

export function enabledModeOrDefault(
  mode: AppMode,
  flags?: {
    enableSteamInventory?: boolean;
    enableCs2Loadouts?: boolean;
    enableTf2Inventory: boolean;
    enableTf2Store?: boolean;
    enableDota2Inventory: boolean;
  },
): AppMode {
  return availableModes(flags).includes(mode) ? mode : "inventory";
}

export function modeForScreen(screen: AppScreen): AppMode {
  return screen === "account" ? "inventory" : screen;
}

export function isInventoryScreen(screen: AppScreen): screen is InventoryMode {
  return screen === "inventory";
}

export function isEconomyInventoryScreen(
  screen: AppScreen,
): screen is EconomyInventoryMode {
  return (
    screen === "steam-inventory" ||
    screen === "steam-service-inventory" ||
    screen === "tf2-inventory" ||
    screen === "dota2-inventory"
  );
}

export function isCommerceScreen(screen: AppScreen) {
  return screen === "armory" || screen === "store" || screen === "tf2-store";
}
