import type { EconomyInventoryItemDto } from "@cs-inv-edit/contracts";

export type TF2Item = Extract<EconomyInventoryItemDto, { game: "tf2" }>;
export interface TF2CraftingRecipe {
  id: number;
  name: string;
  inputLabel: string;
  requiredInputs: string[];
  outputName: string;
  outputDescription: string;
  eligibility: string;
  deterministic: boolean;
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
    requiredInputs: ["2 craftable weapons", "The weapons must share a usable class"],
    outputName: "Scrap Metal",
    outputDescription: "One Scrap Metal",
    eligibility: "Both weapons must be craftable and share at least one class.",
    deterministic: true,
    requiredCount: 2,
    matches: material("weapon"),
    compatibility: sharesClass,
  },
  {
    id: 4,
    name: "Combine Scrap Metal",
    inputLabel: "3 Scrap Metal",
    requiredInputs: ["3 Scrap Metal"],
    outputName: "Reclaimed Metal",
    outputDescription: "One Reclaimed Metal",
    eligibility: "All inputs must be Scrap Metal.",
    deterministic: true,
    requiredCount: 3,
    matches: named("Scrap Metal"),
  },
  {
    id: 5,
    name: "Combine Reclaimed Metal",
    inputLabel: "3 Reclaimed Metal",
    requiredInputs: ["3 Reclaimed Metal"],
    outputName: "Refined Metal",
    outputDescription: "One Refined Metal",
    eligibility: "All inputs must be Reclaimed Metal.",
    deterministic: true,
    requiredCount: 3,
    matches: named("Reclaimed Metal"),
  },
  {
    id: 6,
    name: "Fabricate Headgear",
    inputLabel: "3 Refined Metal",
    requiredInputs: ["3 Refined Metal"],
    outputName: "Random craftable headgear",
    outputDescription: "One randomly selected craftable headgear item",
    eligibility: "All inputs must be Refined Metal.",
    deterministic: false,
    requiredCount: 3,
    matches: named("Refined Metal"),
  },
  {
    id: 7,
    name: "Fabricate Class Token",
    inputLabel: "3 weapons usable by the same class",
    requiredInputs: ["3 craftable weapons", "All must share a class"],
    outputName: "Class Token",
    outputDescription: "One class token for the shared class",
    eligibility: "All weapons must share at least one usable class.",
    deterministic: true,
    requiredCount: 3,
    matches: material("weapon"),
    compatibility: sharesClass,
  },
  {
    id: 8,
    name: "Fabricate Slot Token",
    inputLabel: "3 weapons from the same loadout slot",
    requiredInputs: ["3 craftable weapons", "All must use the same slot"],
    outputName: "Slot Token",
    outputDescription: "One slot token for the shared slot",
    eligibility: "All weapons must have the same equip slot.",
    deterministic: true,
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
    requiredInputs: ["2 craftable headgear items"],
    outputName: "Random craftable headgear",
    outputDescription: "One randomly selected craftable headgear item",
    eligibility: "Both inputs must be craftable headgear.",
    deterministic: false,
    requiredCount: 2,
    matches: material("hat"),
  },
  {
    id: 10,
    name: "Fabricate Class Headgear",
    inputLabel: "4 Refined Metal and 1 Class Token",
    requiredInputs: ["4 Refined Metal", "1 Class Token"],
    outputName: "Random class-specific headgear",
    outputDescription: "One randomly selected headgear item for the token's class",
    eligibility: "Exactly four Refined Metal and one Class Token are required.",
    deterministic: false,
    requiredCount: 5,
    matches: (item) =>
      item.name === "Refined Metal" || item.details.itemClass === "class_token",
  },
  {
    id: 11,
    name: "Fabricate Class and Slot Weapon",
    inputLabel: "3 Refined Metal, 1 Class Token, and 1 Slot Token",
    requiredInputs: ["3 Refined Metal", "1 Class Token", "1 Slot Token"],
    outputName: "Class- and slot-specific weapon",
    outputDescription: "One weapon matching the class and slot tokens",
    eligibility: "Exactly three Refined Metal, one Class Token, and one Slot Token are required.",
    deterministic: false,
    requiredCount: 5,
    matches: (item) =>
      item.name === "Refined Metal" ||
      item.details.itemClass === "class_token" ||
      item.details.itemClass === "slot_token",
  },
  {
    id: 13,
    name: "Rebuild Class Token",
    inputLabel: "1 Class Token and 1 weapon",
    requiredInputs: ["1 Class Token", "1 craftable weapon"],
    outputName: "Class Token",
    outputDescription: "One class token",
    eligibility: "One Class Token and one craftable weapon are required.",
    deterministic: false,
    requiredCount: 2,
    matches: (item) =>
      item.details.itemClass === "class_token" || material("weapon")(item),
  },
  {
    id: 14,
    name: "Rebuild Slot Token",
    inputLabel: "1 Slot Token and 1 weapon",
    requiredInputs: ["1 Slot Token", "1 craftable weapon"],
    outputName: "Slot Token",
    outputDescription: "One slot token",
    eligibility: "One Slot Token and one craftable weapon are required.",
    deterministic: false,
    requiredCount: 2,
    matches: (item) =>
      item.details.itemClass === "slot_token" || material("weapon")(item),
  },
  {
    id: 15,
    name: "Smelt Tokens",
    inputLabel: "3 craft tokens",
    requiredInputs: ["3 Class or Slot Tokens"],
    outputName: "Reclaimed Metal",
    outputDescription: "One Reclaimed Metal",
    eligibility: "All inputs must be Class Tokens or Slot Tokens.",
    deterministic: true,
    requiredCount: 3,
    matches: (item) =>
      item.details.itemClass === "class_token" ||
      item.details.itemClass === "slot_token",
  },
];

const statClockRarities = new Set([
  "uncommon",
  "rare",
  "mythical",
  "legendary",
  "ancient",
  "freelance",
  "mercenary",
  "commando",
  "assassin",
  "elite",
]);

export const isStatClockIngredient = (item: EconomyInventoryItemDto) =>
  item.game === "tf2" &&
  ((item.quality ?? "").toLowerCase() === "strange" ||
    statClockRarities.has((item.details.rarity ?? "").toLowerCase()));
