export type InventoryMode =
  "inventory" | "inventory-storage" | "inventory-tradeup";
export type EconomyInventoryMode =
  | "steam-inventory"
  | "steam-service-inventory"
  | "tf2-inventory"
  | "dota2-inventory";
export type TF2FeatureMode = "tf2-loadouts";
export type AppMode =
  | InventoryMode
  | EconomyInventoryMode
  | TF2FeatureMode
  | "armory"
  | "store"
  | "trades";
export type AppScreen = AppMode | "account";

const tf2FeatureModes: readonly TF2FeatureMode[] = ["tf2-loadouts"];
const appModes: readonly AppMode[] = [
  "inventory",
  "inventory-storage",
  "inventory-tradeup",
  "trades",
  "armory",
  "store",
  "steam-inventory",
  "steam-service-inventory",
  "tf2-inventory",
  ...tf2FeatureModes,
  "dota2-inventory",
];

export function isAppMode(value: string | null): value is AppMode {
  return value !== null && appModes.some((mode) => mode === value);
}

export function availableModes(flags?: {
  enableSteamInventory?: boolean;
  enableTf2Inventory: boolean;
  enableDota2Inventory: boolean;
}): AppMode[] {
  const modes: AppMode[] = [
    "inventory",
    "inventory-storage",
    "inventory-tradeup",
    "trades",
    "armory",
    "store",
  ];
  if (flags?.enableTf2Inventory)
    modes.push("tf2-inventory", ...tf2FeatureModes);
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
    enableTf2Inventory: boolean;
    enableDota2Inventory: boolean;
  },
): AppMode {
  return availableModes(flags).includes(mode) ? mode : "inventory";
}

export function modeForScreen(screen: AppScreen): AppMode {
  return screen === "account" ? "inventory" : screen;
}

export function isInventoryScreen(screen: AppScreen): screen is InventoryMode {
  return (
    screen === "inventory" ||
    screen === "inventory-storage" ||
    screen === "inventory-tradeup"
  );
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
