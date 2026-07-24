import { describe, expect, it } from "vitest";
import { formatUSDMinor, marketPriceLabel, tradeRestrictionLabel, tradeStateDescription } from "./ItemMarketBadges.js";

describe("item market badges", () => {
  const now = Date.parse("2026-07-23T00:00:00Z");

  it("formats integer Steam prices", () => {
    expect(formatUSDMinor(12345)).toBe("$123.45");
    expect(formatUSDMinor(undefined)).toBe("$0.00");
  });

  it("shows rounded-up hours for temporary locks", () => {
    const item = { name: "Item", tradable: false, marketable: true, tradableAfter: "2026-07-24T16:00:00Z" };
    expect(tradeRestrictionLabel(item, now)).toBe("40H");
    expect(tradeStateDescription(item, now)).toContain("Trade locked until");
  });

  it("uses a cross only for permanent restrictions", () => {
    expect(tradeRestrictionLabel({ name: "Item", tradable: false, marketable: true }, now)).toBe("×");
    expect(tradeRestrictionLabel({ name: "Item", tradable: true, marketable: false }, now)).toBe("×");
  });

  it("shows a green-tick label for tradable items", () => {
    expect(tradeRestrictionLabel({ name: "Item", tradable: true, marketable: true }, now)).toBe("✓");
    expect(tradeRestrictionLabel({ name: "Item", marketable: true }, now)).toBe("");
  });

  it("does not describe missing metadata as tradable", () => {
    expect(tradeStateDescription({ name: "Item" }, now)).toBe("Tradeability unknown · Marketability unknown");
  });

  it("omits prices for unmarketable and unlisted items", () => {
    expect(marketPriceLabel({ name: "Item", marketable: false }, 500)).toBeUndefined();
    expect(marketPriceLabel({ name: "Item", marketable: true }, 0)).toBeUndefined();
    expect(marketPriceLabel({ name: "Item", marketable: true }, undefined)).toBeUndefined();
    expect(marketPriceLabel({ name: "Item", marketable: true }, 500)).toBe("$5.00");
  });
});
