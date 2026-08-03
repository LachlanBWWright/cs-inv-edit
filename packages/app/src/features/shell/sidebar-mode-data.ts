import type { AppMode } from "./view.js";

export const modeDetails: Record<
  AppMode,
  { label: string; description: string }
> = {
  inventory: { label: "Inventory", description: "Browse and edit CS2 items" },
  "cs2-features": {
    label: "Activity & progression",
    description: "Matches, stats, missions, and activity",
  },
  "cs2-loadouts": {
    label: "Loadouts",
    description: "Equip owned items for each team",
  },
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
    label: "Inventory",
    description: "View your TF2 inventory",
  },
  "tf2-loadouts": {
    label: "Loadouts",
    description: "Classes, slots, and presets",
  },
  "tf2-matches": {
    label: "Match history",
    description: "Results, performance, classes, and rating",
  },
  "tf2-campaigns": {
    label: "Campaigns",
    description: "Contracts, objectives, stars, and rewards",
  },
  "tf2-store": {
    label: "Store",
    description: "Browse the Mann Co. Store",
  },
  "dota2-inventory": {
    label: "Dota 2",
    description: "View your Dota inventory",
  },
};

export const modeGroups: { label: string; accent: string; modes: AppMode[] }[] =
  [
    {
      label: "Counter-Strike 2",
      accent: "bg-amber-400",
      modes: ["inventory", "cs2-features", "cs2-loadouts", "armory", "store"],
    },
    {
      label: "Steam platform",
      accent: "bg-cyan-400",
      modes: ["trades", "steam-inventory", "steam-service-inventory"],
    },
    {
      label: "Team Fortress 2",
      accent: "bg-red-400",
      modes: [
        "tf2-inventory",
        "tf2-matches",
        "tf2-campaigns",
        "tf2-loadouts",
        "tf2-store",
      ],
    },
    { label: "Dota 2", accent: "bg-violet-400", modes: ["dota2-inventory"] },
  ];
