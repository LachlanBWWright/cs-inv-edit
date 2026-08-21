import { describe, expect, it } from "vitest";
import type {
  EconomyInventoryItemDto,
  GameInventorySnapshot,
} from "@cs-inv-edit/contracts";
import {
  calculateVirtualInventoryWindow,
  economyCategoryOptions,
  economyOutlineClass,
  tf2ItemEffects,
  sortEconomyInventoryItems,
  gameFilterCategories,
  snapshotForGame,
  virtualInventoryWindowChanged,
} from "./game-inventory-utils.js";

describe("calculateVirtualInventoryWindow", () => {
  it("renders only a bounded, overscanned slice of a large inventory", () => {
    const window = calculateVirtualInventoryWindow(
      10_000,
      900,
      600,
      40_000,
      "concise",
    );
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

  it("does not rebuild the virtual slice for scrolling within the same row", () => {
    expect(
      virtualInventoryWindowChanged(
        10_000,
        900,
        600,
        10_000,
        10_050,
        "concise",
      ),
    ).toBe(false);
    expect(
      virtualInventoryWindowChanged(
        10_000,
        900,
        600,
        10_000,
        10_200,
        "concise",
      ),
    ).toBe(true);
  });
});

describe("game inventory isolation", () => {
  it("never displays a snapshot belonging to another mode", () => {
    const tf2: GameInventorySnapshot = {
      game: "tf2",
      appId: 440,
      items: [],
      refreshedAt: "now",
      status: "ready",
      diagnostics: [],
    };
    expect(snapshotForGame("tf2", tf2)).toBe(tf2);
    expect(snapshotForGame("dota2", tf2)).toBeUndefined();
  });

  it("keeps TF2 class filters separate from Dota hero and rarity filters", () => {
    expect(gameFilterCategories("tf2")).toContain("class");
    expect(gameFilterCategories("tf2")).not.toContain("hero");
    expect(gameFilterCategories("dota2")).toContain("hero");
    expect(gameFilterCategories("dota2")).not.toContain("class");
  });

  it("builds navbar category options only from the active game taxonomy", () => {
    const tf2: GameInventorySnapshot = {
      game: "tf2",
      appId: 440,
      refreshedAt: "now",
      status: "ready",
      diagnostics: [],
      items: [
        {
          game: "tf2",
          appId: 440,
          assetId: "1",
          name: "Hat",
          quantity: 1,
          tradable: true,
          marketable: true,
          descriptions: [],
          tags: [
            { category: "Class", internalName: "scout", name: "Scout" },
            { category: "Hero", internalName: "axe", name: "Axe" },
          ],
          details: {
            game: "tf2",
            level: 1,
            qualityId: 6,
            inventoryPosition: 1,
            originId: 0,
            style: 0,
            flags: 0,
            attributes: {},
          },
        },
      ],
    };
    expect(economyCategoryOptions("tf2", tf2)).toEqual([
      ["class\u0000scout", "Class: Scout"],
    ]);
  });

  it("maps backend labels through separate TF2 quality and Dota rarity palettes", () => {
    const base = {
      assetId: "1",
      name: "item",
      quantity: 1,
      tradable: true,
      marketable: true,
      descriptions: [],
      details: {
        level: 0,
        qualityId: 0,
        inventoryPosition: 0,
        originId: 0,
        style: 0,
        flags: 0,
        attributes: {},
      },
    };
    const tf2: EconomyInventoryItemDto = {
      ...base,
      game: "tf2",
      appId: 440,
      tags: [{ category: "Quality", internalName: "unusual", name: "Unusual" }],
      details: { ...base.details, game: "tf2" },
    };
    const dota: EconomyInventoryItemDto = {
      ...base,
      game: "dota2",
      appId: 570,
      tags: [
        {
          category: "Rarity",
          internalName: "rarity_immortal",
          name: "Immortal",
        },
      ],
      details: { ...base.details, game: "dota2" },
    };
    expect(economyOutlineClass(tf2)).toBe("economy-outline--tf2-unusual");
    expect(economyOutlineClass(dota)).toBe("economy-outline--dota-immortal");
  });

  it("falls back to authoritative TF2 quality IDs and detects combined effects", () => {
    const item: EconomyInventoryItemDto = {
      game: "tf2",
      appId: 440,
      assetId: "2",
      name: "Strange Hat",
      quantity: 1,
      tradable: true,
      marketable: true,
      tags: [],
      descriptions: ["★ Unusual Effect: Burning Flames"],
      details: {
        game: "tf2",
        level: 1,
        qualityId: 11,
        inventoryPosition: 0,
        originId: 0,
        style: 0,
        flags: 0,
        attributes: {},
      },
    };
    expect(economyOutlineClass(item)).toBe("economy-outline--tf2-strange");
    expect(tf2ItemEffects(item)).toEqual(["strange", "unusual"]);
  });

  it("sorts economy items by TF2 quality and quantity", () => {
    const item = (assetId: string, qualityId: number, quantity: number) => ({
      game: "tf2" as const,
      appId: 440 as const,
      assetId,
      name: assetId,
      quantity,
      tradable: true,
      marketable: true,
      tags: [],
      details: {
        game: "tf2" as const,
        level: 1,
        qualityId,
        inventoryPosition: 0,
        originId: 0,
        style: 0,
        flags: 0,
        attributes: {},
      },
    });
    const items = [item("unique", 6, 2), item("unusual", 5, 1)];
    expect(
      sortEconomyInventoryItems(items, "quality-high", new Map()).map(
        (entry) => entry.assetId,
      ),
    ).toEqual(["unusual", "unique"]);
    expect(
      sortEconomyInventoryItems(items, "quantity-high", new Map()).map(
        (entry) => entry.assetId,
      ),
    ).toEqual(["unique", "unusual"]);
  });
});
