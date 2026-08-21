import { describe, expect, it } from "vitest";
import {
  cappedWearDistribution,
  containerItemOdds,
  generateCappedWear,
  weightedRandomItem,
} from "./related-item-preview-utils.js";

describe("containerItemOdds", () => {
  it("assigns adjacent rarity tiers a 5:1 total probability and divides within a tier", () => {
    const commonA = { name: "A", rarity: "rare" };
    const commonB = { name: "B", rarity: "rare" };
    const rare = { name: "C", rarity: "mythical" };
    const odds = containerItemOdds([commonA, commonB, rare]);
    expect(odds.get(commonA)).toBeCloseTo(5 / 6 / 2);
    expect(odds.get(commonB)).toBeCloseTo(5 / 6 / 2);
    expect(odds.get(rare)).toBeCloseTo(1 / 6);
  });
});

describe("weightedRandomItem", () => {
  it("selects adjacent rarity tiers at a 5:1 ratio and divides a tier between its items", () => {
    const items = [
      { name: "A", rarity: "Restricted" },
      { name: "B", rarity: "Restricted" },
      { name: "C", rarity: "Classified" },
    ];
    expect(weightedRandomItem(items, () => 0)?.name).toBe("A");
    expect(weightedRandomItem(items, () => 5 / 6 - 0.0001)?.name).toBe("B");
    expect(weightedRandomItem(items, () => 5 / 6 + 0.0001)?.name).toBe("C");
  });
});

describe("generateCappedWear", () => {
  it("selects a source bracket, samples within it, then applies finish caps", () => {
    const rolls = [0, 0.5];
    const wear = generateCappedWear(0.1, 0.7, () => rolls.shift() ?? 0);
    expect(wear).toBeCloseTo(0.035 * 0.6 + 0.1);
  });

  it("can select the final wear bracket", () => {
    const rolls = [0.99, 0.5];
    expect(generateCappedWear(0, 1, () => rolls.shift() ?? 0)).toBeCloseTo(
      0.725,
    );
  });
});

describe("cappedWearDistribution", () => {
  it("applies the finish cap after generated wear-bracket selection", () => {
    const distribution = cappedWearDistribution(0, 0.5);
    const factoryNew =
      distribution.find((entry) => entry.name === "Factory New")?.probability ??
      0;
    const minimalWear =
      distribution.find((entry) => entry.name === "Minimal Wear")
        ?.probability ?? 0;
    expect(factoryNew).toBeGreaterThan(0.03);
    expect(minimalWear).toBeGreaterThan(0);
    expect(
      distribution.reduce((sum, entry) => sum + entry.probability, 0),
    ).toBeCloseTo(1);
  });
});
