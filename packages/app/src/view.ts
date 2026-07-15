export type InventoryMode = "inventory" | "inventory-storage" | "inventory-tradeup";
export type EconomyInventoryMode = "tf2-inventory" | "dota2-inventory";
export type AppMode = InventoryMode | EconomyInventoryMode | "armory";
export type AppScreen = AppMode | "account";

export function availableModes(flags?: { enableTf2Inventory: boolean; enableDota2Inventory: boolean }): AppMode[] {
	const modes: AppMode[] = ["inventory", "inventory-storage", "inventory-tradeup", "armory"];
	if (flags?.enableTf2Inventory) modes.push("tf2-inventory");
	if (flags?.enableDota2Inventory) modes.push("dota2-inventory");
	return modes;
}

export function enabledModeOrDefault(mode: AppMode, flags?: { enableTf2Inventory: boolean; enableDota2Inventory: boolean }): AppMode {
	return availableModes(flags).includes(mode) ? mode : "inventory";
}

export function modeForScreen(screen: AppScreen): AppMode {
	return screen === "account" ? "inventory" : screen;
}

export function isInventoryScreen(screen: AppScreen): screen is InventoryMode {
  return screen === "inventory" || screen === "inventory-storage" || screen === "inventory-tradeup";
}

export function isEconomyInventoryScreen(screen: AppScreen): screen is EconomyInventoryMode {
  return screen === "tf2-inventory" || screen === "dota2-inventory";
}
