export type AppMode = "inventory" | "armory";
export type AppScreen = AppMode | "account";

export function modeForScreen(screen: AppScreen): AppMode {
  return screen === "armory" ? "armory" : "inventory";
}
