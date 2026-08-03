import { generateCappedWear, weightedRandomItem } from "../../features/inventory/related-item-preview-utils.js";
import type { RevealItem } from "./RevealAnimation.js";

export const STATTRAK_ODDS = 1 / 10;
export const MOCK_RESULT_DELAY_MS = 3000;

export function randomRevealCandidate(
  items: RevealItem[],
  fallback: RevealItem,
  random = Math.random,
) {
  return weightedRandomItem(items, random) ?? fallback;
}

export function generateRevealMiss(
  item: RevealItem,
  random = Math.random,
): RevealItem {
  const isSkin =
    item.kind === "weapon_skin" ||
    item.wearMin !== undefined ||
    item.wearMax !== undefined;
  const isSouvenir = isSkin && item.supportsSouvenir === true;
  return {
    ...item,
    isStatTrak:
      item.isStatTrak ??
      (!isSouvenir &&
        isSkin &&
        item.supportsStatTrak === true &&
        random() < STATTRAK_ODDS),
    isSouvenir: item.isSouvenir ?? isSouvenir,
    wear: isSkin
      ? (item.wear ?? generateCappedWear(item.wearMin, item.wearMax, random))
      : undefined,
  };
}
