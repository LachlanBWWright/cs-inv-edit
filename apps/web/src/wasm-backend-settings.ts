import type { FeatureFlags, SettingsData } from "@cs-inv-edit/contracts";

const defaultFeatureFlags: FeatureFlags = {
  enableStorageMutations: true,
  enableContainerOpening: true,
  enableInventoryDebug: false,
  showStorageUnitItems: false,
  enableTradeups: false,
  enableStickerExtract: false,
  enableNameTags: true,
  enableItemDeletion: false,
  enableStatTrakSwap: false,
  enableStrangeParts: false,
  enableItemUse: false,
  enableToolApplication: false,
  enableGifting: false,
  enableTf2Inventory: true,
  enableTf2Store: true,
  enableTf2Loadouts: false,
  enableTf2ItemUse: false,
  enableTf2Tools: false,
  enableTf2Crafting: false,
  enableTf2Unboxing: false,
  enableTf2Customization: false,
  enableDota2Inventory: false,
  enableSteamInventory: true,
  enableStoreRead: false,
  enableStorePurchases: true,
};

export const defaultWasmSettings: SettingsData = {
  backendUrl: window.location.origin,
  validationMode: true,
  sacrificialAccountMode: true,
  featureFlags: defaultFeatureFlags,
  animations: {
    container: "slot-machine",
    tradeUp: "slot-machine",
    armory: "slot-machine",
    terminal: "slot-machine",
  },
  armoryPurchasePacingSeconds: 5,
};
