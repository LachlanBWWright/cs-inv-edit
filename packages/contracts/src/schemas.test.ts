import { describe, expect, it } from "vitest";
import { gameInventorySnapshotSchema, settingsDataSchema } from "./schemas.js";

const item = {
  game: "tf2",
  appId: 440,
  assetId: "1",
  name: "Mann Co. Cap",
  quantity: 1,
  tradable: true,
  marketable: true,
  tags: [],
  details: { game: "tf2", level: 1, qualityId: 6, inventoryPosition: 1, originId: 0, style: 0, flags: 0, attributes: {} },
} as const;

describe("gameInventorySnapshotSchema", () => {
  it("accepts a consistent TF2 snapshot", () => {
    expect(gameInventorySnapshotSchema.safeParse({
      game: "tf2", appId: 440, items: [item], refreshedAt: "now", status: "ready", diagnostics: [],
    }).success).toBe(true);
  });

  it("rejects a mismatched game and AppID", () => {
    expect(gameInventorySnapshotSchema.safeParse({
      game: "tf2", appId: 570, items: [], refreshedAt: "now", status: "ready", diagnostics: [],
    }).success).toBe(false);
  });

  it("rejects items from another inventory", () => {
    expect(gameInventorySnapshotSchema.safeParse({
      game: "dota2", appId: 570, items: [item], refreshedAt: "now", status: "ready", diagnostics: [],
    }).success).toBe(false);
  });
});

it("migrates older settings payloads with multi-game flags disabled", () => {
  const parsed = settingsDataSchema.safeParse({
    backendUrl: "http://127.0.0.1:7331",
    validationMode: true,
    sacrificialAccountMode: false,
    armoryPurchasePacingSeconds: 5,
    animations: { container: "none", tradeUp: "none", armory: "none" },
    featureFlags: {
      enableStorageMutations: false, enableContainerOpening: false, enableInventoryDebug: false, enableTradeups: false,
      enableStickerExtract: false, enableNameTags: false, enableItemDeletion: false, enableStatTrakSwap: false,
      enableStrangeParts: false, enableItemUse: false, enableToolApplication: false, enableGifting: false,
    },
  });
  expect(parsed.success).toBe(true);
  if (parsed.success) expect(parsed.data.featureFlags).toMatchObject({ enableTf2Inventory: false, enableDota2Inventory: false });
});
