import type { EconomyInventoryItemDto } from "@cs-inv-edit/contracts";
import demomanIcon from "../../assets/images/tf2/classes/demoman.png";
import engineerIcon from "../../assets/images/tf2/classes/engineer.png";
import heavyIcon from "../../assets/images/tf2/classes/heavy.png";
import medicIcon from "../../assets/images/tf2/classes/medic.png";
import pyroIcon from "../../assets/images/tf2/classes/pyro.png";
import scoutIcon from "../../assets/images/tf2/classes/scout.png";
import sniperIcon from "../../assets/images/tf2/classes/sniper.png";
import soldierIcon from "../../assets/images/tf2/classes/soldier.png";
import spyIcon from "../../assets/images/tf2/classes/spy.png";

export type TF2Item = Extract<EconomyInventoryItemDto, { game: "tf2" }>;
type SlotGroup = "Weapons" | "Cosmetics" | "Class equipment" | "Taunts";

export const tf2Classes = [
  { id: 1, name: "Scout", icon: scoutIcon },
  { id: 2, name: "Sniper", icon: sniperIcon },
  { id: 3, name: "Soldier", icon: soldierIcon },
  { id: 4, name: "Demoman", icon: demomanIcon },
  { id: 5, name: "Medic", icon: medicIcon },
  { id: 6, name: "Heavy", icon: heavyIcon },
  { id: 7, name: "Pyro", icon: pyroIcon },
  { id: 8, name: "Spy", icon: spyIcon },
  { id: 9, name: "Engineer", icon: engineerIcon },
] as const;

export const tf2Slots = [
  { id: 0, name: "Primary", keys: ["primary"], group: "Weapons" },
  { id: 1, name: "Secondary", keys: ["secondary"], group: "Weapons" },
  { id: 2, name: "Melee", keys: ["melee"], group: "Weapons" },
  { id: 3, name: "Utility", keys: ["utility"], group: "Class equipment" },
  { id: 4, name: "Building", keys: ["building"], group: "Class equipment" },
  { id: 5, name: "PDA", keys: ["pda", "pda1"], group: "Class equipment" },
  { id: 6, name: "PDA 2", keys: ["pda2"], group: "Class equipment" },
  { id: 7, name: "Head", keys: ["head", "headgear"], group: "Cosmetics" },
  { id: 8, name: "Cosmetic", keys: ["misc"], group: "Cosmetics" },
  { id: 9, name: "Action", keys: ["action"], group: "Class equipment" },
  { id: 10, name: "Cosmetic 2", keys: ["misc2"], group: "Cosmetics" },
  ...Array.from({ length: 8 }, (_, index) => ({
    id: index + 11,
    name: `Taunt ${index + 1}`,
    keys: [index === 0 ? "taunt" : `taunt${index + 1}`],
    group: "Taunts" as const,
  })),
] satisfies { id: number; name: string; keys: string[]; group: SlotGroup }[];

export const tf2SlotGroupNames: SlotGroup[] = [
  "Weapons",
  "Cosmetics",
  "Class equipment",
  "Taunts",
];

export function supportsTF2Selection(
  item: TF2Item,
  className: string,
  slotKeys: readonly string[],
) {
  const normalizedClass = className.toLowerCase();
  const usable =
    item.details.usableClasses?.map((value) => value.toLowerCase()) ?? [];
  if (
    usable.length > 0 &&
    !usable.includes(normalizedClass) &&
    !usable.includes("all_class")
  )
    return false;
  const configured =
    item.details.loadoutSlots?.[normalizedClass] ??
    item.details.loadoutSlots?.[className] ??
    item.details.equipSlot;
  return configured ? slotKeys.includes(configured.toLowerCase()) : false;
}

export function tf2ItemGroup(item: TF2Item) {
  if (item.details.itemKind === "weapon") return "Weapons";
  if (item.details.itemKind === "cosmetic") return "Cosmetics";
  if (item.details.itemKind === "taunt") return "Taunts";
  return "Other";
}
