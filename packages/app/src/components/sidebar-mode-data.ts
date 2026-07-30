import type { AppMode } from "../view.js";

export const modeDetails: Record<AppMode, { label: string; description: string }> = {
  inventory: { label: "Inventory", description: "Browse and edit CS2 items" },
  "inventory-storage": {
    label: "Storage units",
    description: "Move items in or out",
  },
  "inventory-tradeup": { label: "Trade-up", description: "Build a contract" },
  armory: { label: "Armory", description: "View passes and rewards" },
  store: { label: "Store", description: "Browse in-game offers" },
  trades: { label: "Trades", description: "Review Steam trade offers" },
  "steam-inventory": {
    label: "Steam inventory",
    description: "Items across Steam",
  },
  "steam-service-inventory": {
    label: "Inventory Service",
    description: "AppID-scoped Steam items",
  },
  "tf2-inventory": {
    label: "Team Fortress 2",
    description: "View your TF2 inventory",
  },
  "tf2-loadouts": {
    label: "Loadouts",
    description: "Classes, slots, and presets",
  },
  "dota2-inventory": {
    label: "Dota 2",
    description: "View your Dota inventory",
  },
};

export const modeGroups: { label: string; accent: string; modes: AppMode[] }[] = [
  {
    label: "Counter-Strike 2",
    accent: "bg-amber-400",
    modes: [
      "inventory",
      "inventory-storage",
      "inventory-tradeup",
      "armory",
      "store",
    ],
  },
  {
    label: "Steam platform",
    accent: "bg-cyan-400",
    modes: ["trades", "steam-inventory", "steam-service-inventory"],
  },
  {
    label: "Team Fortress 2",
    accent: "bg-red-400",
    modes: ["tf2-inventory", "tf2-loadouts"],
  },
  { label: "Dota 2", accent: "bg-violet-400", modes: ["dota2-inventory"] },
];


