import type { EconomyInventoryItemDto } from "@cs-inv-edit/contracts";

export type TF2Item = Extract<EconomyInventoryItemDto, { game: "tf2" }>;
export interface TF2CraftingRecipe {
  id: number;
  name: string;
  inputLabel: string;
  outputName: string;
  requiredCount: number;
  matches: (item: TF2Item) => boolean;
  compatibility?: (first: TF2Item, candidate: TF2Item) => boolean;
}

const named = (name: string) => (item: TF2Item) => item.name === name;
const material = (name: string) => (item: TF2Item) =>
  item.details.craftMaterialType === name;
const sharesClass = (first: TF2Item, candidate: TF2Item) =>
  (first.details.usableClasses ?? []).some((name) =>
    candidate.details.usableClasses?.includes(name),
  );

export const tf2CraftingRecipes: TF2CraftingRecipe[] = [
  {
    id: 3,
    name: "Smelt class weapons",
    inputLabel: "2 craftable weapons usable by the same class",
    outputName: "Scrap Metal",
    requiredCount: 2,
    matches: material("weapon"),
    compatibility: sharesClass,
  },
  {
    id: 4,
    name: "Combine Scrap Metal",
    inputLabel: "3 Scrap Metal",
    outputName: "Reclaimed Metal",
    requiredCount: 3,
    matches: named("Scrap Metal"),
  },
  {
    id: 5,
    name: "Combine Reclaimed Metal",
    inputLabel: "3 Reclaimed Metal",
    outputName: "Refined Metal",
    requiredCount: 3,
    matches: named("Reclaimed Metal"),
  },
  {
    id: 6,
    name: "Fabricate Headgear",
    inputLabel: "3 Refined Metal",
    outputName: "Random craftable headgear",
    requiredCount: 3,
    matches: named("Refined Metal"),
  },
  {
    id: 7,
    name: "Fabricate Class Token",
    inputLabel: "3 weapons usable by the same class",
    outputName: "Class Token",
    requiredCount: 3,
    matches: material("weapon"),
    compatibility: sharesClass,
  },
  {
    id: 8,
    name: "Fabricate Slot Token",
    inputLabel: "3 weapons from the same loadout slot",
    outputName: "Slot Token",
    requiredCount: 3,
    matches: material("weapon"),
    compatibility: (first, candidate) =>
      !!first.details.equipSlot &&
      first.details.equipSlot === candidate.details.equipSlot,
  },
  {
    id: 9,
    name: "Rebuild Headgear",
    inputLabel: "2 craftable headgear items",
    outputName: "Random craftable headgear",
    requiredCount: 2,
    matches: material("hat"),
  },
];

const statClockRarities = new Set([
  "uncommon", "rare", "mythical", "legendary", "ancient",
  "freelance", "mercenary", "commando", "assassin", "elite",
]);

export const isStatClockIngredient = (item: EconomyInventoryItemDto) =>
  item.game === "tf2" &&
  ((item.quality ?? "").toLowerCase() === "strange" ||
    statClockRarities.has((item.details.rarity ?? "").toLowerCase()));
