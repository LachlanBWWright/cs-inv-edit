import { describe, expect, it } from "vitest";
import { availableModes, enabledModeOrDefault, isAppMode, isEconomyInventoryScreen, isInventoryScreen, modeForScreen, type AppMode } from "./view.js";

describe("application mode", () => {
  it("validates persisted mode identifiers", () => {
    expect(isAppMode("trades")).toBe(true);
    expect(isAppMode("steam-inventory")).toBe(true);
    expect(isAppMode("account")).toBe(false);
    expect(isAppMode("unknown")).toBe(false);
    expect(isAppMode(null)).toBe(false);
  });
  it("includes inventory selection stubs and Armory", () => {
    const modes = ["inventory", "inventory-storage", "inventory-tradeup", "armory", "store", "steam-inventory", "tf2-inventory", "dota2-inventory"] satisfies AppMode[];
    expect(modes).toHaveLength(8);
  });

  it("recognizes every inventory submode", () => {
    expect(isInventoryScreen("inventory-storage")).toBe(true);
    expect(isInventoryScreen("inventory-tradeup")).toBe(true);
    expect(isInventoryScreen("armory")).toBe(false);
    expect(modeForScreen("inventory-storage")).toBe("inventory-storage");
  });

  it("keeps Armory selected instead of falling back to Inventory", () => {
    expect(modeForScreen("armory")).toBe("armory");
  });
});

describe("availableModes", () => {
  it("hides both optional games when flags are absent or disabled", () => {
    expect(availableModes()).toEqual(["inventory", "inventory-storage", "inventory-tradeup", "trades", "armory", "store"]);
    expect(availableModes({ enableTf2Inventory: false, enableDota2Inventory: false })).not.toContain("tf2-inventory");
  });

  it("enables TF2 and Dota independently", () => {
    expect(availableModes({ enableTf2Inventory: true, enableDota2Inventory: false })).toContain("tf2-inventory");
    expect(availableModes({ enableTf2Inventory: true, enableDota2Inventory: false })).not.toContain("dota2-inventory");
    expect(availableModes({ enableTf2Inventory: false, enableDota2Inventory: true })).toContain("dota2-inventory");
  });

  it("enables the Steam Community inventory independently", () => {
    expect(availableModes({ enableSteamInventory: true, enableTf2Inventory: false, enableDota2Inventory: false })).toContain("steam-inventory");
  });

  it("returns an active disabled game mode atomically to Inventory", () => {
    expect(enabledModeOrDefault("tf2-inventory", { enableTf2Inventory: false, enableDota2Inventory: true })).toBe("inventory");
    expect(enabledModeOrDefault("dota2-inventory", { enableTf2Inventory: false, enableDota2Inventory: true })).toBe("dota2-inventory");
  });
});

describe("isEconomyInventoryScreen", () => {
  it("recognizes only the feature-gated read-only game inventories", () => {
    expect(isEconomyInventoryScreen("tf2-inventory")).toBe(true);
    expect(isEconomyInventoryScreen("dota2-inventory")).toBe(true);
    expect(isEconomyInventoryScreen("steam-inventory")).toBe(true);
    expect(isEconomyInventoryScreen("inventory")).toBe(false);
    expect(isEconomyInventoryScreen("armory")).toBe(false);
  });
});
