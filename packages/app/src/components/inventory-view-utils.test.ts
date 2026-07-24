import { describe, expect, it } from "vitest";
import { compactItemMeta, compactItemName, isActiveTerminal, isOpenableContainer, isTerminal, itemWeaponName, rarityBorderClass, resolveSelectedInventoryItem, sortInventoryItems, sortRelatedItemsByRarity } from "./inventory-view-utils.js";

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

  it("only treats the transformed item as active", () => {
    expect(isActiveTerminal({ name: "Sealed Genesis Terminal" } as never)).toBe(false);
    expect(isActiveTerminal({ name: "Active Genesis Terminal" } as never)).toBe(true);
  });
});

describe("sortRelatedItemsByRarity", () => {
  it("sorts collection previews from highest to lowest rarity", () => {
    const sorted = sortRelatedItemsByRarity([{ name: "Common", rarity: "common" }, { name: "Ancient", rarity: "ancient" }, { name: "Rare", rarity: "rare" }]);
    expect(sorted.map((item) => item.name)).toEqual(["Ancient", "Rare", "Common"]);
  });
});

describe("isOpenableContainer", () => {
  it("keeps the action available when a live description mislabels a capsule", () => {
    const capsule = { id: "capsule", name: "Sticker | Sticker Name", kind: "sticker_item", containerItems: [{ name: "Sticker" }] } as never;
    expect(isOpenableContainer(capsule)).toBe(true);
  });

  it("recognizes keyless graffiti boxes by name", () => {
    const box = { id: "box", name: "Community Graffiti Box 1", kind: "tool_item" } as never;
    expect(isOpenableContainer(box)).toBe(true);
  });
});

describe("isTerminal", () => {
  it("recognizes sealed and uplink terminals by their live display names", () => {
    expect(isTerminal({ name: "Sealed Genesis Terminal" } as never)).toBe(true);
    expect(isTerminal({ name: "Dead Hand Uplink Terminal" } as never)).toBe(true);
    expect(isTerminal({ name: "Kilowatt Case" } as never)).toBe(false);
  });
});

describe("inventory filtering helpers", () => {
  const items = [
    { id: "a", name: "AK-47 | Redline", kind: "weapon_skin", rarity: "Classified", paintWear: 0.22 },
    { id: "b", name: "M4A1-S | Printstream", kind: "weapon_skin", rarity: "Covert", paintWear: 0.08 },
    { id: "c", name: "Sticker", kind: "sticker_item", rarity: "High Grade" },
  ] as never[];

  it("derives the specific weapon from a skin name", () => {
    expect(itemWeaponName(items[0]!)).toBe("AK-47");
    expect(itemWeaponName(items[2]!)).toBeUndefined();
  });

  it("shortens Steam market names and moves type and wear into metadata", () => {
    const skin = { id: "skin", name: "StatTrak™ AK-47 | Redline (Field-Tested)", kind: "weapon_skin", exterior: "Field-Tested" } as const;
    const sticker = { id: "sticker", name: "Sticker | Crown (Foil)", kind: "sticker_item" } as const;
    const graffiti = { id: "graffiti", name: "Sealed Graffiti | Heart (Shark White)", kind: "cs2_econ_item" } as const;
    expect(compactItemName(skin)).toBe("Redline");
    expect(compactItemMeta(skin)).toBe("AK-47 · Field-Tested");
    expect(compactItemName(sticker)).toBe("Crown");
    expect(compactItemMeta(sticker)).toBe("Sticker · Foil");
    expect(compactItemName(graffiti)).toBe("Heart");
    expect(compactItemMeta(graffiti)).toBe("Sealed Graffiti · Shark White");
  });

  it("sorts by float with items lacking floats last", () => {
    expect(sortInventoryItems(items, "float-low").map((item) => item.id)).toEqual(["b", "a", "c"]);
    expect(sortInventoryItems(items, "float-high").map((item) => item.id)).toEqual(["a", "b", "c"]);
  });

  it("sorts by CS2 rarity tier", () => {
    expect(sortInventoryItems(items, "rarity-high").map((item) => item.id)).toEqual(["b", "a", "c"]);
  });

  it("sorts by Steam price and treats unmarketable or unpriced items as zero", () => {
    const pricedItems = [
      { id: "cheap", name: "Cheap", kind: "weapon_skin", marketName: "Cheap", marketable: true },
      { id: "expensive", name: "Expensive", kind: "weapon_skin", marketName: "Expensive", marketable: true },
      { id: "unmarketable", name: "Unmarketable", kind: "tool_item", marketable: false },
    ] as const;
    const prices = new Map([["Cheap", 125], ["Expensive", 5000]]);
    expect(sortInventoryItems([...pricedItems], "price-high", prices).map((item) => item.id)).toEqual(["expensive", "cheap", "unmarketable"]);
    expect(sortInventoryItems([...pricedItems], "price-low", prices).map((item) => item.id)).toEqual(["unmarketable", "cheap", "expensive"]);
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
