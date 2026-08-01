import type { FeatureFlags, InventorySnapshot, SettingsData } from "@cs-inv-edit/contracts";
import type { RevealItem } from "./ui/RevealAnimation.js";
import type { UIActionOutcome } from "../lib/ui-action-outcome.js";

export const emptyDebugReveal: RevealItem = { name: "Collection item" };

export const fallbackDebugCollections: Array<[string, RevealItem[]]> = [
  [
    "Kilowatt Case (offline fallback)",
    [
      {
        name: "AK-47 | Inheritance",
        rarity: "Covert",
        kind: "weapon_skin",
        wearMin: 0,
        wearMax: 0.8,
      },
      {
        name: "AWP | Chrome Cannon",
        rarity: "Covert",
        kind: "weapon_skin",
        wearMin: 0,
        wearMax: 1,
      },
      {
        name: "M4A1-S | Black Lotus",
        rarity: "Classified",
        kind: "weapon_skin",
        wearMin: 0,
        wearMax: 0.7,
      },
      {
        name: "USP-S | Jawbreaker",
        rarity: "Classified",
        kind: "weapon_skin",
        wearMin: 0,
        wearMax: 1,
      },
      {
        name: "Glock-18 | Block-18",
        rarity: "Restricted",
        kind: "weapon_skin",
        wearMin: 0,
        wearMax: 0.5,
      },
      {
        name: "MP7 | Just Smile",
        rarity: "Restricted",
        kind: "weapon_skin",
        wearMin: 0,
        wearMax: 1,
      },
    ],
  ],
  [
    "The 2018 Inferno Collection (offline fallback)",
    [
      {
        name: "SG 553 | Integrale",
        rarity: "Classified",
        kind: "weapon_skin",
        wearMin: 0,
        wearMax: 1,
      },
      {
        name: "Dual Berettas | Twin Turbo",
        rarity: "Classified",
        kind: "weapon_skin",
        wearMin: 0,
        wearMax: 1,
      },
      {
        name: "AK-47 | Safety Net",
        rarity: "Restricted",
        kind: "weapon_skin",
        wearMin: 0,
        wearMax: 0.6,
      },
      {
        name: "MP7 | Fade",
        rarity: "Restricted",
        kind: "weapon_skin",
        wearMin: 0,
        wearMax: 0.25,
      },
      {
        name: "SSG 08 | Hand Brake",
        rarity: "Mil-Spec Grade",
        kind: "weapon_skin",
        wearMin: 0,
        wearMax: 1,
      },
      {
        name: "MAC-10 | Calf Skin",
        rarity: "Industrial Grade",
        kind: "weapon_skin",
        wearMin: 0,
        wearMax: 1,
      },
    ],
  ],
  [
    "Copenhagen 2024 Legends Sticker Capsule (offline fallback)",
    [
      {
        name: "Sticker | FaZe Clan | Copenhagen 2024",
        rarity: "High Grade",
        kind: "sticker_item",
      },
      {
        name: "Sticker | Natus Vincere | Copenhagen 2024",
        rarity: "High Grade",
        kind: "sticker_item",
      },
      {
        name: "Sticker | Spirit (Holo) | Copenhagen 2024",
        rarity: "Remarkable",
        kind: "sticker_item",
      },
      {
        name: "Sticker | G2 Esports (Holo) | Copenhagen 2024",
        rarity: "Remarkable",
        kind: "sticker_item",
      },
      {
        name: "Sticker | Vitality (Gold) | Copenhagen 2024",
        rarity: "Extraordinary",
        kind: "sticker_item",
      },
    ],
  ],
];

export interface SettingsViewProps {
  settings: SettingsData | undefined;
  inventory?: InventorySnapshot;
  onRefresh: () => void;
  onSave: (next: SettingsData) => Promise<UIActionOutcome>;
}

export function settingsEqual(
  left: SettingsData | undefined,
  right: SettingsData | undefined,
) {
  if (!left || !right) return left === right;
  if (
    left.backendUrl !== right.backendUrl ||
    left.validationMode !== right.validationMode ||
    left.sacrificialAccountMode !== right.sacrificialAccountMode ||
    left.armoryPurchasePacingSeconds !== right.armoryPurchasePacingSeconds
  )
    return false;
  if (
    left.animations.container !== right.animations.container ||
    left.animations.tradeUp !== right.animations.tradeUp ||
    left.animations.armory !== right.animations.armory ||
    left.animations.terminal !== right.animations.terminal
  )
    return false;
  const keys = new Set([
    ...Object.keys(left.featureFlags),
    ...Object.keys(right.featureFlags),
  ] as Array<keyof FeatureFlags>);
  for (const key of keys) {
    if (left.featureFlags[key] !== right.featureFlags[key]) return false;
  }
  return true;
}
