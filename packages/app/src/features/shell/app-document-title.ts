import type { AppScreen } from "./view.js";

export function documentTitleForScreen(screen: AppScreen) {
  switch (screen) {
    case "inventory":
      return "Inventory";
    case "cs2-features":
      return "CS2 Activity";
    case "cs2-loadouts":
      return "CS2 Loadouts";
    case "armory":
      return "Armory";
    case "store":
      return "CS2 Store";
    case "trades":
      return "Trades";
    case "steam-inventory":
      return "Steam Inventory";
    case "steam-service-inventory":
      return "Steam Service";
    case "tf2-inventory":
      return "TF2 Inventory";
    case "tf2-loadouts":
      return "TF2 Loadouts";
    case "tf2-matches":
      return "TF2 Matches";
    case "tf2-campaigns":
      return "TF2 Campaigns";
    case "tf2-store":
      return "TF2 Store";
    case "dota2-inventory":
      return "Dota 2 Inventory";
    case "price-analysis":
      return "Price Analysis";
    case "account":
      return "Account";
  }
}
