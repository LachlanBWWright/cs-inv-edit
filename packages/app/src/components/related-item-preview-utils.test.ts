import { describe, expect, it } from "vitest";
import { cappedWearDistribution, containerItemOdds } from "./related-item-preview-utils.js";

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

describe("cappedWearDistribution", () => {
  it("applies the finish cap after generated wear-bracket selection", () => {
    const distribution = cappedWearDistribution(0, 0.5);
    const factoryNew = distribution.find((entry) => entry.name === "Factory New")?.probability ?? 0;
    const minimalWear = distribution.find((entry) => entry.name === "Minimal Wear")?.probability ?? 0;
    expect(factoryNew).toBeGreaterThan(0.03);
    expect(minimalWear).toBeGreaterThan(0);
    expect(distribution.reduce((sum, entry) => sum + entry.probability, 0)).toBeCloseTo(1);
  });
});
