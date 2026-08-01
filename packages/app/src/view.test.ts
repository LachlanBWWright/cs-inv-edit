import { describe, expect, it } from "vitest";
import {
  availableModes,
  enabledModeOrDefault,
  isAppMode,
  isEconomyInventoryScreen,
  isInventoryScreen,
  modeForScreen,
  type AppMode,
} from "./view.js";

describe("application mode", () => {
  it("validates persisted mode identifiers", () => {
    expect(isAppMode("trades")).toBe(true);
    expect(isAppMode("steam-inventory")).toBe(true);
    expect(isAppMode("steam-service-inventory")).toBe(true);
    expect(isAppMode("cs2-features")).toBe(true);
    expect(isAppMode("cs2-loadouts")).toBe(true);
    expect(isAppMode("tf2-matches")).toBe(true);
    expect(isAppMode("tf2-campaigns")).toBe(true);
    expect(isAppMode("tf2-store")).toBe(true);
    expect(isAppMode("account")).toBe(false);
    expect(isAppMode("unknown")).toBe(false);
    expect(isAppMode(null)).toBe(false);
  });
  it("includes Inventory and Armory without separate workflow stubs", () => {
    const modes = [
      "inventory",
      "cs2-features",
      "cs2-loadouts",
      "armory",
      "store",
      "steam-inventory",
      "steam-service-inventory",
      "tf2-inventory",
      "dota2-inventory",
    ] satisfies AppMode[];
    expect(modes).toHaveLength(9);
  });

  it("recognizes Inventory as the unified item-management screen", () => {
    expect(isInventoryScreen("inventory")).toBe(true);
    expect(isInventoryScreen("armory")).toBe(false);
    expect(isAppMode("inventory-storage")).toBe(false);
    expect(isAppMode("inventory-tradeup")).toBe(false);
  });

  it("keeps Armory selected instead of falling back to Inventory", () => {
    expect(modeForScreen("armory")).toBe("armory");
  });
});

describe("availableModes", () => {
  it("keeps default modes when optional inventories are absent", () => {
    expect(availableModes()).toEqual([
      "inventory",
      "cs2-features",
      "trades",
      "armory",
      "store",
      "tf2-store",
    ]);
    expect(
      availableModes({
        enableTf2Inventory: false,
        enableDota2Inventory: false,
      }),
    ).not.toContain("tf2-inventory");
  });

  it("shows CS2 Loadouts only when its operation flag is enabled", () => {
    expect(availableModes()).not.toContain("cs2-loadouts");
    expect(
      availableModes({
        enableCs2Loadouts: true,
        enableTf2Inventory: false,
        enableDota2Inventory: false,
      }),
    ).toContain("cs2-loadouts");
  });

  it("enables TF2 and Dota independently", () => {
    expect(
      availableModes({ enableTf2Inventory: true, enableDota2Inventory: false }),
    ).toContain("tf2-inventory");
    expect(
      availableModes({ enableTf2Inventory: true, enableDota2Inventory: false }),
    ).not.toContain("dota2-inventory");
    expect(
      availableModes({ enableTf2Inventory: false, enableDota2Inventory: true }),
    ).toContain("dota2-inventory");
  });

  it("shows the TF2 store by default and allows its flag to hide it", () => {
    expect(availableModes()).toContain("tf2-store");
    expect(
      availableModes({
        enableTf2Inventory: true,
        enableTf2Store: false,
        enableDota2Inventory: false,
      }),
    ).not.toContain("tf2-store");
  });

  it("enables the Steam Community inventory independently", () => {
    expect(
      availableModes({
        enableSteamInventory: true,
        enableTf2Inventory: false,
        enableDota2Inventory: false,
      }),
    ).toContain("steam-inventory");
    expect(
      availableModes({
        enableSteamInventory: true,
        enableTf2Inventory: false,
        enableDota2Inventory: false,
      }),
    ).toContain("steam-service-inventory");
  });

  it("returns an active disabled game mode atomically to Inventory", () => {
    expect(
      enabledModeOrDefault("cs2-loadouts", {
        enableCs2Loadouts: false,
        enableTf2Inventory: false,
        enableDota2Inventory: false,
      }),
    ).toBe("inventory");
    expect(
      enabledModeOrDefault("tf2-inventory", {
        enableTf2Inventory: false,
        enableDota2Inventory: true,
      }),
    ).toBe("inventory");
    expect(
      enabledModeOrDefault("dota2-inventory", {
        enableTf2Inventory: false,
        enableDota2Inventory: true,
      }),
    ).toBe("dota2-inventory");
  });
});

describe("isEconomyInventoryScreen", () => {
  it("recognizes only the feature-gated read-only game inventories", () => {
    expect(isEconomyInventoryScreen("tf2-inventory")).toBe(true);
    expect(isEconomyInventoryScreen("dota2-inventory")).toBe(true);
    expect(isEconomyInventoryScreen("steam-inventory")).toBe(true);
    expect(isEconomyInventoryScreen("steam-service-inventory")).toBe(true);
    expect(isEconomyInventoryScreen("inventory")).toBe(false);
    expect(isEconomyInventoryScreen("armory")).toBe(false);
  });
});
