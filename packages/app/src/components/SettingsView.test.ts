import { describe, expect, it } from "vitest";
import type { SettingsData } from "@cs-inv-edit/contracts";
import { settingsEqual } from "./SettingsView.js";

const settings: SettingsData = {
  backendUrl: "http://127.0.0.1:7331",
  validationMode: true,
  sacrificialAccountMode: true,
  armoryPurchasePacingSeconds: 5,
  animations: { container: "slot-machine", tradeUp: "slot-machine", armory: "slot-machine" },
  featureFlags: {
    enableStorageMutations: true,
    enableContainerOpening: true,
    enableInventoryDebug: false,
    showStorageUnitItems: false,
    enableTradeups: false,
    enableStickerExtract: false,
    enableNameTags: false,
    enableItemDeletion: false,
    enableStatTrakSwap: false,
    enableStrangeParts: false,
    enableItemUse: false,
    enableToolApplication: false,
    enableGifting: false,
    enableArmoryRedemption: true,
    enableTf2Inventory: true,
    enableTf2Loadouts: false,
    enableTf2ItemUse: false,
    enableTf2Tools: false,
    enableTf2Crafting: false,
    enableTf2Unboxing: false,
    enableTf2Customization: false,
    enableDota2Inventory: false,
    enableSteamInventory: true,
  },
};

describe("settings changes", () => {
  it("detects a feature flag change without depending on object identity", () => {
    expect(settingsEqual(settings, { ...settings, featureFlags: { ...settings.featureFlags } })).toBe(true);
    expect(settingsEqual(settings, { ...settings, featureFlags: { ...settings.featureFlags, enableArmoryRedemption: false } })).toBe(false);
  });
});
