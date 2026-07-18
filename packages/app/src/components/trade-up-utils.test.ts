import { describe, expect, it } from "vitest";
import type { InventoryItemDto } from "@cs-inv-edit/contracts";
import { calculateTradeUpOutcomes, effectiveFloat, resolveTradeUpLocally, tradeUpInputCount } from "./trade-up-utils.js";

const item = (id: string, collection: string, candidates: string[]): InventoryItemDto => ({
  id, name: id, kind: "weapon_skin", rarity: "Classified", collection,
  paintWear: 0.05, paintWearMin: 0, paintWearMax: 0.1,
  tradeUpItems: candidates.map((name) => ({ name, wearMin: 0.1, wearMax: 0.5 })),
});

describe("trade-up calculations", () => {
  it("normalizes input wear against its caps", () => {
    expect(effectiveFloat(item("a", "A", ["x"]))).toBeCloseTo(0.5);
  });

  it("uses five inputs for Covert contracts", () => {
    expect(tradeUpInputCount({ rarity: "Covert" })).toBe(5);
    expect(tradeUpInputCount({ rarity: "Classified" })).toBe(10);
  });

  it("weights each input equally and candidates within it equally", () => {
    const outcomes = calculateTradeUpOutcomes([
      item("a", "A", ["Shared", "A only"]),
      item("b", "B", ["Shared"]),
    ]);
    expect(outcomes.find((outcome) => outcome.name === "Shared")?.probability).toBeCloseTo(0.75);
    expect(outcomes.find((outcome) => outcome.name === "A only")?.probability).toBeCloseTo(0.25);
    expect(outcomes[0]?.predictedWear).toBeCloseTo(0.3);
  });

  it("keeps local resolution behind the same request boundary as a future GC resolver", () => {
    const outcomes = calculateTradeUpOutcomes([item("a", "A", ["First", "Second"])]);
    expect(resolveTradeUpLocally({ itemIds: ["a"], outcomes }, () => 0)?.name).toBe("First");
    expect(resolveTradeUpLocally({ itemIds: ["a"], outcomes }, () => 0.99)?.name).toBe("Second");
  });
});
