import { describe, expect, it } from "vitest";
import type { EconomyInventoryItemDto, GameInventorySnapshot } from "@cs-inv-edit/contracts";
import { calculateVirtualInventoryWindow, economyOutlineClass, gameFilterCategories, snapshotForGame } from "./game-inventory-utils.js";

describe("calculateVirtualInventoryWindow", () => {
  it("renders only a bounded, overscanned slice of a large inventory", () => {
    const window = calculateVirtualInventoryWindow(10_000, 900, 600, 40_000, "concise");
    expect(window.firstItem).toBeGreaterThan(0);
    expect(window.lastItem - window.firstItem).toBeLessThan(100);
    expect(window.lastItem).toBeLessThan(10_000);
  });

  it("keeps the initial rows visible and accounts for compact columns", () => {
    const normal = calculateVirtualInventoryWindow(100, 900, 600, 0, "concise");
    const compact = calculateVirtualInventoryWindow(100, 900, 600, 0, "icons");
    expect(normal.firstItem).toBe(0);
    expect(compact.columns).toBeGreaterThan(normal.columns);
  });
});

describe("game inventory isolation", () => {
  it("never displays a snapshot belonging to another mode", () => {
		const tf2: GameInventorySnapshot = { game: "tf2", appId: 440, items: [], refreshedAt: "now", status: "ready", diagnostics: [] };
    expect(snapshotForGame("tf2", tf2)).toBe(tf2);
    expect(snapshotForGame("dota2", tf2)).toBeUndefined();
  });

  it("keeps TF2 class filters separate from Dota hero and rarity filters", () => {
    expect(gameFilterCategories("tf2")).toContain("class");
    expect(gameFilterCategories("tf2")).not.toContain("hero");
    expect(gameFilterCategories("dota2")).toContain("hero");
    expect(gameFilterCategories("dota2")).not.toContain("class");
  });

  it("maps backend labels through separate TF2 quality and Dota rarity palettes", () => {
    const base = { assetId: "1", name: "item", quantity: 1, tradable: true, marketable: true, descriptions: [], details: { level: 0, qualityId: 0, inventoryPosition: 0, originId: 0, style: 0, flags: 0, attributes: {} } };
		const tf2: EconomyInventoryItemDto = { ...base, game: "tf2", appId: 440, tags: [{ category: "Quality", internalName: "unusual", name: "Unusual" }], details: { ...base.details, game: "tf2" } };
		const dota: EconomyInventoryItemDto = { ...base, game: "dota2", appId: 570, tags: [{ category: "Rarity", internalName: "rarity_immortal", name: "Immortal" }], details: { ...base.details, game: "dota2" } };
    expect(economyOutlineClass(tf2)).toBe("economy-outline--tf2-unusual");
    expect(economyOutlineClass(dota)).toBe("economy-outline--dota-immortal");
  });
});
