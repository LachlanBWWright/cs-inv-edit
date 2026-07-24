import { describe, expect, it } from "vitest";
import { expectedReturn, scanPriceMap } from "./roi-utils.js";

describe("expectedReturn", () => {
  it("calculates probability-weighted value and ROI", () => {
    const result = expectedReturn([{ marketName: "A", probability: 0.75 }, { marketName: "B", probability: 0.25 }], new Map([["A", 100], ["B", 500]]), 200);
    expect(result.expectedValueMinor).toBe(200);
    expect(result.roiPercent).toBe(0);
    expect(result.pricedOutcomes).toBe(2);
  });

  it("reports partial price coverage", () => {
    const result = expectedReturn([{ marketName: "A", probability: 0.5 }, { marketName: "B", probability: 0.5 }], new Map([["A", 100]]));
    expect(result.expectedValueMinor).toBe(50);
    expect(result.pricedOutcomes).toBe(1);
    expect(result.totalOutcomes).toBe(2);
  });

  it("batches large outcome pools", async () => {
    const sizes: number[] = [];
    await scanPriceMap(Array.from({ length: 201 }, (_, index) => `Item ${index}`), async (names) => {
      sizes.push(names.length);
      return { currency: "USD", items: [], listings: [], errors: [], scannedAt: "now" };
    });
    expect(sizes).toEqual([100, 100, 1]);
  });
});
