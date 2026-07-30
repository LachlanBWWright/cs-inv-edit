import { z } from "zod";
import type {
  GameInventorySnapshot,
  SettingsData,
  SteamInventoryServiceGames,
} from "./index.js";

const animationModeSchema = z.enum(["none", "countdown", "slot-machine"]);
const tradeUpAnimationModeSchema = z.enum([
  "none",
  "countdown",
  "slot-machine",
  "contract-none",
  "contract-countdown",
  "contract-slot-machine",
]);
export const economyGameSchema = z.enum(["steam", "tf2", "dota2"]);
export const steamInventoryServiceAppIdSchema = z
  .number()
  .int()
  .positive()
  .max(4_294_967_295);
export const steamInventoryServiceGamesSchema: z.ZodType<SteamInventoryServiceGames> =
  z.object({
    games: z.array(
      z.object({
        appId: steamInventoryServiceAppIdSchema,
        name: z.string().min(1),
        playtimeMinutes: z.number().int().nonnegative(),
        lastPlayed: z.number().int().nonnegative(),
        hasMarket: z.boolean(),
      }),
    ),
    refreshedAt: z.string(),
    status: z.enum(["ready", "requires_connection", "error"]),
    message: z.string().optional(),
    diagnostics: z.array(z.string()),
  });
const economyItemBaseShape = {
  contextId: z.string().optional(),
  assetId: z.string(),
  classId: z.string().optional(),
  instanceId: z.string().optional(),
  definitionId: z.number().int().nonnegative().optional(),
  name: z.string(),
  marketName: z.string().optional(),
  imageUrl: z.string().url().optional(),
  inspectUrl: z.string().regex(/^steam:\/\/(?:run|rungame)\/440\//i).optional(),
  quantity: z.number().int().positive(),
  type: z.string().optional(),
  rarity: z.string().optional(),
  quality: z.string().optional(),
  tradable: z.boolean(),
  marketable: z.boolean(),
  tradableAfter: z.string().optional(),
  tags: z.preprocess(
    (value) => value ?? [],
    z.array(
      z.object({
        category: z.string(),
        internalName: z.string(),
        name: z.string(),
      }),
    ),
  ),
  descriptions: z.array(z.string()).optional(),
};
const economyDetailsBaseShape = {
  level: z.number().int().nonnegative(),
  qualityId: z.number().int().nonnegative(),
  inventoryPosition: z.number().int().nonnegative(),
  originId: z.number().int().nonnegative(),
  style: z.number().int().nonnegative(),
  flags: z.number().int().nonnegative(),
  customName: z.string().optional(),
  customDescription: z.string().optional(),
  attributes: z.record(z.string(), z.number().int().nonnegative()),
  attributeBytes: z
    .record(z.string(), z.string().regex(/^[0-9a-f]*$/))
    .optional(),
  equippedStates: z
    .array(
      z.object({
        class: z.number().int().nonnegative(),
        slot: z.number().int().nonnegative(),
      }),
    )
    .optional(),
  interiorItemId: z.string().regex(/^\d+$/).optional(),
};
const tf2EconomyItemSchema = z.object({
  ...economyItemBaseShape,
  game: z.literal("tf2"),
  appId: z.literal(440),
  details: z.object({
    ...economyDetailsBaseShape,
    game: z.literal("tf2"),
    schemaQuality: z.string().optional(),
    equipSlot: z.string().optional(),
    usableClasses: z.array(z.string()).optional(),
    capabilities: z.record(z.string(), z.string()).optional(),
    itemKind: z
      .enum([
        "item",
        "weapon",
        "cosmetic",
        "tool",
        "container",
        "crafting_material",
        "taunt",
        "paint_can",
        "key",
        "strangifier",
        "killstreak_kit",
      ])
      .optional(),
    itemClass: z.string().optional(),
    craftClass: z.string().optional(),
    craftMaterialType: z.string().optional(),
    toolType: z.string().optional(),
    description: z.string().optional(),
    collection: z.string().optional(),
    equipRegions: z.array(z.string()).optional(),
    schemaTags: z.array(z.string()).optional(),
    minLevel: z.number().int().nonnegative().optional(),
    maxLevel: z.number().int().nonnegative().optional(),
    properName: z.boolean().optional(),
    baseItem: z.boolean().optional(),
    hidden: z.boolean().optional(),
    staticAttributes: z.record(z.string(), z.string()).optional(),
    rarity: z.string().optional(),
    equipConflicts: z.array(z.string()).optional(),
    loadoutSlots: z.record(z.string(), z.string()).optional(),
    prefabChain: z.array(z.string()).optional(),
    containerItems: z
      .array(
        z.object({
          defIndex: z.number().int().nonnegative().optional(),
          name: z.string(),
          rarity: z.string().optional(),
          poolKind: z.enum(["primary", "bonus", "unresolved"]),
          imageUrl: z.string().optional(),
        }),
      )
      .optional(),
    decodedAttributes: z
      .array(
        z.object({
          defIndex: z.number().int().nonnegative(),
          name: z.string(),
          value: z.string(),
          effectType: z.string().optional(),
          hidden: z.boolean().optional(),
          attributeClass: z.string().optional(),
        }),
      )
      .optional(),
  }),
});
const dota2EconomyItemSchema = z.object({
  ...economyItemBaseShape,
  game: z.literal("dota2"),
  appId: z.literal(570),
  details: z.object({
    ...economyDetailsBaseShape,
    game: z.literal("dota2"),
    hero: z.string().optional(),
    slot: z.string().optional(),
  }),
});
const steamEconomyItemSchema = z.object({
  ...economyItemBaseShape,
  game: z.literal("steam"),
  appId: z.literal(753),
  details: z.object({ ...economyDetailsBaseShape, game: z.literal("steam") }),
});
const steamInventoryServiceItemSchema = z.object({
  ...economyItemBaseShape,
  game: z.literal("steam-service"),
  appId: z.number().int().positive(),
  details: z.object({
    ...economyDetailsBaseShape,
    game: z.literal("steam-service"),
    serviceItemId: z.string().min(1),
    serviceDefinitionId: z.string().min(1),
    acquiredAt: z.string().optional(),
    stateChangedAt: z.string().optional(),
    serviceState: z.string().optional(),
    serviceOrigin: z.string().optional(),
    dynamicProperties: z.record(z.string(), z.string()).optional(),
  }),
});
const snapshotBaseShape = {
  refreshedAt: z.string(),
  status: z.enum(["ready", "requires_connection", "loading", "error"]),
  message: z.string().optional(),
  error: z.string().optional(),
  schemaRevision: z.string().optional(),
  diagnostics: z.array(z.string()),
};
export const gameInventorySnapshotSchema: z.ZodType<GameInventorySnapshot> =
  z.discriminatedUnion("game", [
    z.object({
      ...snapshotBaseShape,
      game: z.literal("steam"),
      appId: z.literal(753),
      items: z.array(steamEconomyItemSchema),
    }),
    z.object({
      ...snapshotBaseShape,
      game: z.literal("steam-service"),
      appId: z.number().int().positive(),
      items: z.array(steamInventoryServiceItemSchema),
    }),
    z.object({
      ...snapshotBaseShape,
      game: z.literal("tf2"),
      appId: z.literal(440),
      items: z.array(tf2EconomyItemSchema),
    }),
    z.object({
      ...snapshotBaseShape,
      game: z.literal("dota2"),
      appId: z.literal(570),
      items: z.array(dota2EconomyItemSchema),
    }),
  ]);
export const settingsDataSchema: z.ZodType<SettingsData> = z.object({
  backendUrl: z.string(),
  validationMode: z.boolean(),
  sacrificialAccountMode: z.boolean(),
  armoryPurchasePacingSeconds: z.number().int().min(1).max(60),
  featureFlags: z.object({
    enableStorageMutations: z.boolean(),
    enableContainerOpening: z.boolean(),
    enableInventoryDebug: z.boolean(),
    showStorageUnitItems: z.boolean().default(false),
    enableProtocolConsole: z.boolean().default(true),
    enableTradeups: z.boolean(),
    enableStickerExtract: z.boolean(),
    enableNameTags: z.boolean(),
    enableItemDeletion: z.boolean(),
    enableStatTrakSwap: z.boolean(),
    enableStrangeParts: z.boolean(),
    enableItemUse: z.boolean(),
    enableToolApplication: z.boolean(),
    enableGifting: z.boolean(),
    enableArmoryRead: z.boolean().optional(),
    enableArmoryRedemption: z.boolean().optional(),
    enableStoreRead: z.boolean().optional(),
    enableStorePurchases: z.boolean().optional(),
    enableCs2Loadouts: z.boolean().default(false),
    enableSteamInventory: z.boolean().default(true),
    enableSteamTradeMutations: z.boolean().default(false),
    enableTf2Inventory: z.boolean().default(true),
    enableTf2Loadouts: z.boolean().default(false),
    enableTf2ItemUse: z.boolean().default(false),
    enableTf2Tools: z.boolean().default(false),
    enableTf2Crafting: z.boolean().default(false),
    enableTf2Unboxing: z.boolean().default(false),
    enableTf2Customization: z.boolean().default(false),
    enableDota2Inventory: z.boolean().default(false),
  }),
  animations: z.object({
    container: animationModeSchema,
    tradeUp: tradeUpAnimationModeSchema,
    armory: animationModeSchema,
    terminal: animationModeSchema.default("slot-machine"),
  }),
});


