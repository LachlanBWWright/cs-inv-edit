import { afterEach, describe, expect, it, vi } from "vitest";
import { ARMORY_PURCHASE_TIMEOUT_MS, armoryPurchaseRequiresConfirmation, armoryPurchaseUsesReveal, armoryRevealCandidates, armoryRevealResult, withArmoryPurchaseTimeout } from "./ArmoryView.js";
import { generateRevealMiss, STATTRAK_ODDS } from "./ui/RevealAnimation.js";

afterEach(() => vi.useRealTimers());

describe("Armory purchase confirmation", () => {
  it("confirms only bulk purchases or purchases over ten stars", () => {
    expect(armoryPurchaseRequiresConfirmation(1, 10)).toBe(false);
    expect(armoryPurchaseRequiresConfirmation(1, 11)).toBe(true);
    expect(armoryPurchaseRequiresConfirmation(2, 1)).toBe(true);
  });
});

describe("Armory purchase timeout", () => {
  it("rejects a purchase that remains pending for 40 seconds", async () => {
    vi.useFakeTimers();
    const result = withArmoryPurchaseTimeout(new Promise<never>(() => undefined));

    const assertion = expect(result).rejects.toThrow("timed out after 40 seconds");
    await vi.advanceTimersByTimeAsync(ARMORY_PURCHASE_TIMEOUT_MS);
    await assertion;
  });

  it("returns a purchase that settles before the deadline", async () => {
    vi.useFakeTimers();
    const result = withArmoryPurchaseTimeout(Promise.resolve("completed"));

    await expect(result).resolves.toBe("completed");
    expect(vi.getTimerCount()).toBe(0);
  });
});

describe("Armory reveal items", () => {
  it("does not reveal an item when purchasing a weapon case", () => {
    expect(armoryPurchaseUsesReveal({
      campaignId: 1,
      redeemId: 2,
      expectedCost: 2,
      generationTime: 3,
      name: "Gallery Case",
      category: "weapon_case",
    })).toBe(false);
  });

  it("still reveals a directly redeemed collection item", () => {
    expect(armoryPurchaseUsesReveal({
      campaignId: 1,
      redeemId: 2,
      expectedCost: 4,
      generationTime: 3,
      name: "Graphic Collection",
      category: "collection",
      items: [{ name: "Collection skin", kind: "weapon_skin" }],
    })).toBe(true);
  });

  it("uses only the redeemed offer collection as reel candidates", () => {
    const candidates = armoryRevealCandidates([
      { name: "Collection A", marketName: "AK-47 | A", rarity: "Classified", imageUrl: "a.png", kind: "weapon_skin", wearMin: 0.1, wearMax: 0.7 },
      { name: "Collection B", marketName: "M4A1-S | B", rarity: "Restricted", imageUrl: "b.png", kind: "weapon_skin", wearMin: 0, wearMax: 0.8 },
    ], "regular");

    expect(candidates.map((candidate) => candidate.name)).toEqual(["AK-47 | A", "M4A1-S | B"]);
    expect(candidates).toMatchObject([
      { imageUrl: "a.png", rarity: "Classified", wearMin: 0.1, wearMax: 0.7, supportsStatTrak: false, supportsSouvenir: false },
      { imageUrl: "b.png", rarity: "Restricted", wearMin: 0, wearMax: 0.8, supportsStatTrak: false, supportsSouvenir: false },
    ]);
  });

  it("allows StatTrak misses only for weapon case candidates at exactly one in ten", () => {
    const [caseCandidate] = armoryRevealCandidates([{ name: "Case skin", kind: "weapon_skin" }], "stattrak");
    const [collectionCandidate] = armoryRevealCandidates([{ name: "Collection skin", kind: "weapon_skin" }], "regular");

    expect(generateRevealMiss(caseCandidate!, () => STATTRAK_ODDS - Number.EPSILON).isStatTrak).toBe(true);
    expect(generateRevealMiss(caseCandidate!, () => STATTRAK_ODDS).isStatTrak).toBe(false);
    expect(generateRevealMiss(collectionCandidate!, () => 0).isStatTrak).toBe(false);
  });

  it("makes every souvenir-package skin Souvenir and never StatTrak", () => {
    const [candidate] = armoryRevealCandidates([{ name: "Package skin", kind: "weapon_skin" }], "souvenir");
    const miss = generateRevealMiss(candidate!, () => 0);

    expect(miss.isSouvenir).toBe(true);
    expect(miss.isStatTrak).toBe(false);
  });

  it("lands on the awarded GC inventory item", () => {
    expect(armoryRevealResult({
      id: "123",
      name: "Fallback name",
      marketName: "StatTrak™ AK-47 | Reward",
      imageUrl: "reward.png",
      kind: "weapon_skin",
      rarity: "Covert",
      paintWear: 0.123,
      paintWearMin: 0,
      paintWearMax: 1,
      isStatTrak: true,
      isSouvenir: false,
    })).toEqual({
      name: "StatTrak™ AK-47 | Reward",
      imageUrl: "reward.png",
      kind: "weapon_skin",
      rarity: "Covert",
      wear: 0.123,
      wearMin: 0,
      wearMax: 1,
      isStatTrak: true,
      isSouvenir: false,
    });
  });
});
