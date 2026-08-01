import { describe, expect, it } from "vitest";
import {
  gameInventorySnapshotSchema,
  healthStatusSchema,
  settingsDataSchema,
  storeSnapshotSchema,
} from "./schemas.js";

it("validates generated health responses", () => {
  expect(
    healthStatusSchema.safeParse({
      status: "ok",
      service: "cs2-backend",
      version: "0.0.0",
      time: "2026-08-01T00:00:00Z",
    }).success,
  ).toBe(true);
  expect(
    healthStatusSchema.safeParse({
      status: "available",
      service: "cs2-backend",
      version: "0.0.0",
      time: "not-a-timestamp",
    }).success,
  ).toBe(false);
});

const item = {
  game: "tf2",
  appId: 440,
  assetId: "1",
  name: "Mann Co. Cap",
  quantity: 1,
  tradable: true,
  marketable: true,
  tags: [],
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
} as const;

describe("gameInventorySnapshotSchema", () => {
  it("accepts Steam Community items from AppID 753", () => {
    expect(
      gameInventorySnapshotSchema.safeParse({
        game: "steam",
        appId: 753,
        items: [
          {
            ...item,
            game: "steam",
            appId: 753,
            details: { ...item.details, game: "steam" },
          },
        ],
        refreshedAt: "now",
        status: "ready",
        diagnostics: [],
      }).success,
    ).toBe(true);
  });
  it("accepts a consistent TF2 snapshot", () => {
    expect(
      gameInventorySnapshotSchema.safeParse({
        game: "tf2",
        appId: 440,
        items: [item],
        refreshedAt: "now",
        status: "ready",
        diagnostics: [],
      }).success,
    ).toBe(true);
  });

  it("normalizes legacy null item tags without discarding owned items", () => {
    const parsed = gameInventorySnapshotSchema.safeParse({
      game: "tf2",
      appId: 440,
      items: [{ ...item, tags: null }],
      refreshedAt: "now",
      status: "ready",
      diagnostics: [],
    });
    expect(parsed.success).toBe(true);
    if (parsed.success) expect(parsed.data.items[0]?.tags).toEqual([]);
  });

  it("rejects a mismatched game and AppID", () => {
    expect(
      gameInventorySnapshotSchema.safeParse({
        game: "tf2",
        appId: 570,
        items: [],
        refreshedAt: "now",
        status: "ready",
        diagnostics: [],
      }).success,
    ).toBe(false);
  });

  it("rejects items from another inventory", () => {
    expect(
      gameInventorySnapshotSchema.safeParse({
        game: "dota2",
        appId: 570,
        items: [item],
        refreshedAt: "now",
        status: "ready",
        diagnostics: [],
      }).success,
    ).toBe(false);
  });
});

it("normalizes a legacy null store offer list", () => {
  const parsed = storeSnapshotSchema.safeParse({
    status: "requires_connection",
    offers: null,
    refreshedAt: "2026-08-01T00:00:00Z",
  });
  expect(parsed.success).toBe(true);
  if (parsed.success) expect(parsed.data.offers).toEqual([]);
});

it("migrates older settings payloads with multi-game flags disabled", () => {
  const parsed = settingsDataSchema.safeParse({
    backendUrl: "http://127.0.0.1:7331",
    validationMode: true,
    sacrificialAccountMode: false,
    armoryPurchasePacingSeconds: 5,
    animations: {
      container: "none",
      tradeUp: "none",
      armory: "none",
      terminal: "none",
    },
    featureFlags: {
      enableStorageMutations: false,
      enableContainerOpening: false,
      enableInventoryDebug: false,
      enableTradeups: false,
      enableStickerExtract: false,
      enableNameTags: false,
      enableItemDeletion: false,
      enableStatTrakSwap: false,
      enableStrangeParts: false,
      enableItemUse: false,
      enableToolApplication: false,
      enableGifting: false,
    },
  });
  expect(parsed.success).toBe(true);
  if (parsed.success)
    expect(parsed.data.featureFlags).toMatchObject({
      showStorageUnitItems: false,
      enableSteamInventory: true,
      enableTf2Inventory: true,
      enableDota2Inventory: false,
    });
});
