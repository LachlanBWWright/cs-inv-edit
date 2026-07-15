import { describe, expect, it } from "vitest";
import { rarityBorderClass, resolveSelectedInventoryItem, sortRelatedItemsByRarity } from "./inventory-view-utils.js";

describe("rarityBorderClass", () => {
  it("maps common CS2 rarity tiers to distinct border colors", () => {
    expect(rarityBorderClass("Consumer Grade")).toContain("rarity-common");
    expect(rarityBorderClass("Base Grade")).toContain("rarity-common");
    expect(rarityBorderClass("Industrial Grade")).toContain("rarity-uncommon");
    expect(rarityBorderClass("Medium Grade")).toContain("rarity-uncommon");
    expect(rarityBorderClass("Mil-Spec")).toContain("rarity-rare");
    expect(rarityBorderClass("High Grade")).toContain("rarity-rare");
    expect(rarityBorderClass("Distinguished")).toContain("rarity-rare");
    expect(rarityBorderClass("Restricted")).toContain("rarity-mythical");
    expect(rarityBorderClass("Remarkable")).toContain("rarity-mythical");
    expect(rarityBorderClass("Exceptional")).toContain("rarity-mythical");
    expect(rarityBorderClass("Classified")).toContain("rarity-legendary");
    expect(rarityBorderClass("Exotic")).toContain("rarity-legendary");
    expect(rarityBorderClass("Superior")).toContain("rarity-legendary");
    expect(rarityBorderClass("Covert")).toContain("rarity-ancient");
    expect(rarityBorderClass("Extraordinary")).toContain("rarity-ancient");
    expect(rarityBorderClass("Master")).toContain("rarity-ancient");
    expect(rarityBorderClass("Rare Special (★)")).toContain("rarity-exceedingly-rare");
    expect(rarityBorderClass("Rare Special Item")).toContain("rarity-exceedingly-rare");
    expect(rarityBorderClass("Knife")).toContain("rarity-exceedingly-rare");
    expect(rarityBorderClass("Gloves")).toContain("rarity-exceedingly-rare");
    expect(rarityBorderClass("unusual")).toContain("rarity-exceedingly-rare");
    expect(rarityBorderClass("Contraband (Discontinued)")).toContain("rarity-immortal");
    expect(rarityBorderClass("Clandestine")).toContain("rarity-immortal");
  });

  it("normalizes casing and surrounding whitespace", () => {
    expect(rarityBorderClass("  classified  ")).toContain("rarity-legendary");
  });

  it("supports live items_game rarity keys", () => {
    expect(rarityBorderClass("common")).toContain("rarity-common");
    expect(rarityBorderClass("uncommon")).toContain("rarity-uncommon");
    expect(rarityBorderClass("rare")).toContain("rarity-rare");
    expect(rarityBorderClass("mythical")).toContain("rarity-mythical");
    expect(rarityBorderClass("legendary")).toContain("rarity-legendary");
    expect(rarityBorderClass("ancient")).toContain("rarity-ancient");
    expect(rarityBorderClass("immortal")).toContain("rarity-immortal");
  });

  it("falls back to a neutral border for unknown rarities", () => {
    expect(rarityBorderClass("Unknown")).toBe("rarity-outline");
  });
});

describe("sortRelatedItemsByRarity", () => {
  it("sorts collection previews from highest to lowest rarity", () => {
    const sorted = sortRelatedItemsByRarity([{ name: "Common", rarity: "common" }, { name: "Ancient", rarity: "ancient" }, { name: "Rare", rarity: "rare" }]);
    expect(sorted.map((item) => item.name)).toEqual(["Ancient", "Rare", "Common"]);
  });
});

describe("resolveSelectedInventoryItem", () => {
  it("returns the currently selected item when it is still present in the filtered list", () => {
    const items = [{ id: "a" }, { id: "b" }] as Array<{ id: string }>;
    expect(resolveSelectedInventoryItem(items as never[], "b")).toEqual({ id: "b" });
  });

  it("falls back to the first item when the selected item is no longer visible", () => {
    const items = [{ id: "a" }, { id: "b" }] as Array<{ id: string }>;
    expect(resolveSelectedInventoryItem(items as never[], "missing")).toEqual({ id: "a" });
  });
});
