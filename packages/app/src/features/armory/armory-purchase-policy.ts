import type {
  ArmorySnapshot,
  InventoryItemDto,
  RelatedItemDto,
} from "@cs-inv-edit/contracts";
import type { RevealItem } from "../../shared/ui/RevealAnimation.js";

export const ARMORY_PURCHASE_TIMEOUT_MS = 40_000;
export const armoryPurchaseTimeoutMessage =
  "Armory confirmation timed out after 40 seconds. The purchase may still complete; refresh Armory and inventory before trying again.";
export const ARMORY_STAR_COST_MINOR = 40;

export function withArmoryPurchaseTimeout<T>(
  promise: PromiseLike<T>,
  timeoutMs = ARMORY_PURCHASE_TIMEOUT_MS,
): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = globalThis.setTimeout(
      () => reject(new Error(armoryPurchaseTimeoutMessage)),
      timeoutMs,
    );
    void Promise.resolve(promise).then(
      (value) => {
        globalThis.clearTimeout(timer);
        resolve(value);
      },
      (error: unknown) => {
        globalThis.clearTimeout(timer);
        reject(error);
      },
    );
  });
}

export type ArmoryRevealVariant = "regular" | "stattrak" | "souvenir";

export function armoryRevealCandidates(
  items: RelatedItemDto[],
  variant: ArmoryRevealVariant,
): RevealItem[] {
  return items.map((candidate) => ({
    name: candidate.marketName || candidate.name,
    marketName: candidate.marketName,
    price: candidate.price,
    imageUrl: candidate.imageUrl,
    rarity: candidate.rarity,
    kind: candidate.kind,
    wear: candidate.paintWear,
    wearMin: candidate.wearMin,
    wearMax: candidate.wearMax,
    supportsStatTrak:
      variant === "stattrak" && candidate.kind === "weapon_skin",
    supportsSouvenir:
      variant === "souvenir" && candidate.kind === "weapon_skin",
  }));
}

export function armoryRevealResult(item: InventoryItemDto): RevealItem {
  return {
    name: item.marketName || item.customName || item.name,
    imageUrl: item.imageUrl,
    rarity: item.rarity,
    kind: item.kind,
    wear: item.paintWear,
    wearMin: item.paintWearMin,
    wearMax: item.paintWearMax,
    isStatTrak: item.isStatTrak,
    isSouvenir: item.isSouvenir,
  };
}

export function isContainerOffer(offer: ArmorySnapshot["offers"][number]) {
  return /(?:case|container|capsule|package)/i.test(
    `${offer.name ?? ""} ${offer.itemName ?? ""} ${offer.category ?? ""}`,
  );
}

function isWeaponCaseOffer(offer: ArmorySnapshot["offers"][number]) {
  const label = `${offer.name ?? ""} ${offer.itemName ?? ""} ${offer.category ?? ""}`;
  const hasWeaponSkins = (offer.items ?? []).some(
    (item) => item.kind === "weapon_skin",
  );
  return (
    /weapon_case|crate/i.test(label) ||
    (hasWeaponSkins && /\bcase\b/i.test(label))
  );
}

export function armoryPurchaseUsesReveal(
  offer: ArmorySnapshot["offers"][number],
) {
  return !isWeaponCaseOffer(offer);
}

export function armoryRevealVariant(
  offer: ArmorySnapshot["offers"][number],
): ArmoryRevealVariant {
  const label = `${offer.name ?? ""} ${offer.itemName ?? ""} ${offer.category ?? ""}`;
  const hasWeaponSkins = (offer.items ?? []).some(
    (item) => item.kind === "weapon_skin",
  );
  if (hasWeaponSkins && /souvenir.*package|package.*souvenir/i.test(label))
    return "souvenir";
  return isWeaponCaseOffer(offer) ? "stattrak" : "regular";
}

export function armoryPurchaseRequiresConfirmation(
  quantity: number,
  costPerItem: number,
) {
  return quantity > 1 || quantity * costPerItem > 10;
}
