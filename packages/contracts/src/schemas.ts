import { z } from "zod";
import type {
  ArmorySnapshot,
  ConnectionStatus,
  GameInventorySnapshot,
  HealthStatus,
  InventorySnapshot,
  OperationEvent,
  OperationReceipt,
  PriceScanResult,
  ProtocolTraceEntry,
  PurchaseSession,
  SettingsData,
  SteamAccountTradesCollection,
  SteamInventoryServiceGames,
  SteamTradeMutationResult,
  SteamTradesSnapshot,
  StoreSnapshot,
  TF2FeatureSnapshot,
  TF2InspectedItem,
} from "./index.js";

export const relatedItemSchema: z.ZodType<
  import("./inventory.js").RelatedItemDto
> = z.lazy(() =>
  z.object({
    defindex: z.number().optional(),
    paintKit: z.number().optional(),
    name: z.string(),
    marketName: z.string().optional(),
    listingName: z.string().optional(),
    kind: z.string().optional(),
    rarity: z.string().optional(),
    imageUrl: z.string().optional(),
    price: z.string().optional(),
    paintWear: z.number().optional(),
    wearMin: z.number().optional(),
    wearMax: z.number().optional(),
    items: z.array(relatedItemSchema).optional(),
  }),
);
const priceQuoteSchema = z.object({
  source: z.string(),
  marketName: z.string(),
  currency: z.string(),
  amountMinor: z.number().int().nonnegative().optional(),
  displayPrice: z.string(),
  priceMultiplier: z.number().positive(),
  adjustedAmountMinor: z.number().int().nonnegative().optional(),
  adjustedDisplayPrice: z.string().optional(),
  listingCount: z.number().int().nonnegative().optional(),
  url: z.string().url().optional(),
  observedAt: z.string(),
});
export const priceScanResultSchema: z.ZodType<PriceScanResult> = z.object({
  currency: z.string(),
  items: z.array(
    z.object({ marketName: z.string(), quotes: z.array(priceQuoteSchema) }),
  ),
  listings: z.array(priceQuoteSchema),
  errors: z.array(z.object({ source: z.string(), message: z.string() })),
  scannedAt: z.string(),
  servedAt: z.string().optional(),
  cacheState: z.enum(["fresh", "stale"]).optional(),
});
const appliedItemSchema = z.object({
  kind: z.enum(["sticker", "charm", "patch"]),
  slot: z.number().optional(),
  id: z.number().optional(),
  name: z.string(),
  imageUrl: z.string().optional(),
  wear: z.number().optional(),
});
const itemDebugSchema = z.object({
  gcId: z.string().optional(),
  gcOriginalId: z.string().optional(),
  gcDefIndex: z.number().optional(),
  gcInventory: z.number().optional(),
  gcQuantity: z.number().optional(),
  gcQuality: z.number().optional(),
  gcRarity: z.number().optional(),
  gcPaintKit: z.number().optional(),
  descriptionMatched: z.boolean(),
  marketDescriptionUsed: z.boolean(),
  attributes: z.record(z.string(), z.number()).optional(),
});
export const inventoryItemSchema = z.object({
  id: z.string(),
  name: z.string(),
  marketName: z.string().optional(),
  marketPrice: z.string().optional(),
  marketSalePrice: z.string().optional(),
  marketSellListings: z.number().optional(),
  customName: z.string().optional(),
  imageUrl: z.string().optional(),
  inspectUrl: z
    .string()
    .regex(/^steam:\/\/rungame\/730\/[^/]*\/\+csgo_econ_action_preview%20/i)
    .optional(),
  kind: z.enum([
    "weapon_skin",
    "sticker_item",
    "container",
    "storage_unit",
    "tool_item",
    "cs2_econ_item",
    "unknown",
  ]),
  defindex: z.number().optional(),
  paintWear: z.number().optional(),
  paintWearMin: z.number().optional(),
  paintWearMax: z.number().optional(),
  storageCount: z.number().optional(),
  graffitiCharges: z.number().int().nonnegative().optional(),
  casketId: z.string().optional(),
  collection: z.string().optional(),
  collectionItems: z.array(relatedItemSchema).optional(),
  tradeUpItems: z.array(relatedItemSchema).optional(),
  containerItems: z.array(relatedItemSchema).optional(),
  terminalOffers: z
    .array(
      z.object({
        fauxItemId: z.string(),
        generationTime: z.number().optional(),
        purchasePrice: z.number().optional(),
        item: relatedItemSchema,
      }),
    )
    .optional(),
  terminalPointsRemaining: z.number().optional(),
  exterior: z.string().optional(),
  rarity: z.string().optional(),
  storageLocation: z.string().optional(),
  toolType: z.string().optional(),
  requiredKeyDefIndexes: z.array(z.number()).optional(),
  stickers: z
    .array(
      z.object({
        slot: z.number().optional(),
        stickerId: z.number().optional(),
        wear: z.number().optional(),
      }),
    )
    .optional(),
  appliedItems: z.array(appliedItemSchema).optional(),
  isStatTrak: z.boolean().optional(),
  isSouvenir: z.boolean().optional(),
  tradable: z.boolean().optional(),
  marketable: z.boolean().optional(),
  tradableAfter: z.string().optional(),
  unsupportedFields: z.array(z.string()).optional(),
  diagnostics: z.array(z.string()).optional(),
  hasCustomName: z.boolean().optional(),
  isNameTagTool: z.boolean().optional(),
  debug: itemDebugSchema.optional(),
});

export const healthStatusSchema: z.ZodType<HealthStatus> = z.object({
  status: z.enum(["ok", "error"]),
  service: z.string(),
  version: z.string(),
  time: z.string(),
});
export const inventorySnapshotSchema: z.ZodType<InventorySnapshot> = z.object({
  items: z.array(inventoryItemSchema),
  collections: z
    .array(z.object({ name: z.string(), items: z.array(relatedItemSchema) }))
    .optional(),
  refreshedAt: z.string(),
  status: z
    .enum(["ready", "requires_connection", "loading", "error"])
    .optional(),
  message: z.string().optional(),
  error: z.string().optional(),
  diagnostics: z.array(z.string()).optional(),
});
export const armorySnapshotSchema: z.ZodType<ArmorySnapshot> = z.object({
  balance: z.number(),
  generationTime: z.number(),
  itemIds: z.array(z.string()),
  offers: z.array(
    z.object({
      campaignId: z.number(),
      redeemId: z.number(),
      expectedCost: z.number(),
      generationTime: z.number(),
      itemName: z.string().optional(),
      name: z.string().optional(),
      category: z.string().optional(),
      items: z.array(relatedItemSchema).optional(),
    }),
  ),
  refreshedAt: z.string(),
  status: z.enum(["ready", "requires_connection", "loading", "error"]),
  message: z.string().optional(),
  diagnostics: z.array(z.string()).optional(),
});
const storeOfferSchema = z.object({
  id: z.string(),
  itemLink: z.string(),
  defIndex: z.number().int().nonnegative(),
  name: z.string(),
  description: z.string().optional(),
  imageUrl: z.string().optional(),
  category: z.string().optional(),
  rarity: z.string().optional(),
  currency: z.string(),
  amountMinor: z.number().int().nonnegative(),
  formattedPrice: z.string(),
  saleAmountMinor: z.number().int().nonnegative().optional(),
  formattedSalePrice: z.string().optional(),
  requiresSupplementalData: z.boolean(),
  supplementalDataKind: z.string().optional(),
  purchasable: z.boolean(),
  unsupportedReason: z.string().optional(),
  items: z.array(relatedItemSchema).optional(),
});
export const storeSnapshotSchema: z.ZodType<StoreSnapshot> = z.object({
  status: z.enum(["ready", "requires_connection", "loading", "error"]),
  priceSheetVersion: z.number().int().nonnegative().optional(),
  currency: z.string().optional(),
  offers: z.preprocess((value) => value ?? [], z.array(storeOfferSchema)),
  refreshedAt: z.string(),
  message: z.string().optional(),
  diagnostics: z.array(z.string()).optional(),
});
const steamTradeItemSchema = z.object({
  appId: z.number().int().nonnegative(),
  contextId: z.string(),
  assetId: z.string(),
  amount: z.number().int().nonnegative(),
  name: z.string(),
  marketName: z.string().optional(),
  type: z.string().optional(),
  imageUrl: z.string().url().optional(),
  tradable: z.boolean(),
  marketable: z.boolean(),
});
const steamTradeSchema = z.object({
  id: z.string(),
  direction: z.enum(["received", "sent", "history"]),
  partnerSteamId: z.string(),
  partnerName: z.string().optional(),
  partnerAvatarUrl: z.string().url().optional(),
  partnerProfileUrl: z.string().url().optional(),
  message: z.string().optional(),
  state: z.string(),
  createdAt: z.string().optional(),
  updatedAt: z.string().optional(),
  expiresAt: z.string().optional(),
  itemsToGive: z.array(steamTradeItemSchema),
  itemsToReceive: z.array(steamTradeItemSchema),
});
export const steamTradesSnapshotSchema: z.ZodType<SteamTradesSnapshot> =
  z.object({
    status: z.enum([
      "ready",
      "requires_connection",
      "requires_reauthentication",
      "loading",
      "error",
    ]),
    received: z.array(steamTradeSchema),
    sent: z.array(steamTradeSchema),
    history: z.array(steamTradeSchema),
    refreshedAt: z.string(),
    message: z.string().optional(),
  });
export const steamAccountTradesCollectionSchema: z.ZodType<SteamAccountTradesCollection> =
  z.object({
    accounts: z.array(
      z.object({
        steamId: z.string(),
        accountName: z.string(),
        avatarUrl: z.string().url().optional(),
        snapshot: steamTradesSnapshotSchema,
      }),
    ),
    refreshedAt: z.string(),
  });
const steamTradeMutationAssetSchema = z.object({
  appId: z.number().int().positive(),
  contextId: z.string().min(1),
  assetId: z.string().regex(/^\d+$/),
  amount: z.number().int().positive(),
});
export const createSteamTradeOfferRequestSchema = z
  .object({
    partnerSteamId: z.string().regex(/^7656119\d{10}$/),
    message: z.string().max(128).optional(),
    itemsToGive: z.array(steamTradeMutationAssetSchema).max(256),
    itemsToReceive: z.array(steamTradeMutationAssetSchema).max(256),
    tradeToken: z.string().max(64).optional(),
  })
  .refine(
    (input) => input.itemsToGive.length + input.itemsToReceive.length > 0,
    "At least one trade asset is required",
  );
export const steamTradeMutationResultSchema: z.ZodType<SteamTradeMutationResult> =
  z.object({
    status: z.enum([
      "submitted",
      "accepted",
      "blocked_by_feature_flag",
      "requires_connection",
      "requires_refresh",
      "error",
    ]),
    tradeOfferId: z.string().optional(),
    needsMobileConfirmation: z.boolean().optional(),
    message: z.string().optional(),
  });
export const initializeStorePurchaseRequestSchema = z.object({
  offerId: z.string().min(1),
  quantity: z.number().int().min(1).max(100),
  expectedPriceSheetVersion: z.number().int().nonnegative(),
  expectedAmountMinor: z.number().int().nonnegative(),
  supplementalData: z.string().optional(),
  expectedTerminalOfferItemId: z.string().regex(/^\d+$/).optional(),
});
export const purchaseSessionSchema: z.ZodType<PurchaseSession> = z.object({
  id: z.string(),
  status: z.enum([
    "initializing",
    "awaiting_steam_authorization",
    "awaiting_user",
    "finalizing",
    "completed",
    "cancelled",
    "failed",
    "expired",
  ]),
  offerId: z.string(),
  defIndex: z.number().int().nonnegative(),
  name: z.string(),
  quantity: z.number().int().positive(),
  currency: z.string(),
  amountMinor: z.number().int().nonnegative(),
  formattedAmount: z.string(),
  transactionId: z.string().optional(),
  orderId: z.string().optional(),
  checkoutUrl: z.string().optional(),
  purchasedItemIds: z.array(z.string()).optional(),
  createdAt: z.string(),
  expiresAt: z.string().optional(),
  message: z.string().optional(),
  diagnostics: z.array(z.string()).optional(),
  errorCode: z.string().optional(),
  errorResult: z.number().int().optional(),
});
export const connectionStatusSchema: z.ZodType<ConnectionStatus> = z.object({
  state: z.enum([
    "disconnected",
    "connecting",
    "awaiting_guard",
    "needs_steam_guard",
    "awaiting_qr",
    "connected",
    "error",
  ]),
  detail: z.string().optional(),
  steamId: z.string().optional(),
  accountName: z.string().optional(),
  avatarUrl: z.string().optional(),
  diagnostics: z.array(z.string()).optional(),
  qrChallengeUrl: z.string().optional(),
});
export const steamAccountProfilesSchema = z.array(
  z.object({
    accountName: z.string(),
    steamId: z.string().optional(),
    avatarUrl: z.string().optional(),
    signedIn: z.boolean(),
    lastSignedInAt: z.string(),
  }),
);

const operationStateSchema = z.enum([
  "queued",
  "validating",
  "encoded",
  "sent",
  "awaiting_gc_confirmation",
  "reconciling_inventory",
  "completed",
  "failed",
  "blocked_by_feature_flag",
  "requires_validation",
  "requires_connection",
]);
const operationResultSchema = z.object({
  kind: z
    .enum(["inventory_award", "terminal_unsealed", "terminal_offer"])
    .optional(),
  openedItem: inventoryItemSchema.optional(),
  terminalItemId: z.string().optional(),
  terminalDefIndex: z.number().optional(),
  offerItemId: z.string().optional(),
  offer: relatedItemSchema.optional(),
  pointsRemaining: z.number().optional(),
  terminalOffer: z
    .object({
      fauxItemId: z.string(),
      generationTime: z.number().optional(),
      purchasePrice: z.number().optional(),
      item: relatedItemSchema,
    })
    .optional(),
  consumedItemId: z.string().optional(),
  requestEMsg: z.number().optional(),
  requestMethod: z.string().optional(),
  requestBodyHex: z.string().optional(),
  confirmation: z.string().optional(),
  responseEMsg: z.number().optional(),
  responseBodyHex: z.string().optional(),
  beforeItemCount: z.number().optional(),
  afterItemCount: z.number().optional(),
  diagnostics: z.array(z.string()).optional(),
});
export const operationReceiptSchema: z.ZodType<OperationReceipt> = z.object({
  operationId: z.string(),
  type: z.string(),
  state: operationStateSchema,
  createdAt: z.string(),
  message: z.string().optional(),
  result: operationResultSchema.optional(),
});
export const operationReceiptsSchema = z.array(operationReceiptSchema);
export const operationEventSchema: z.ZodType<OperationEvent> = z.object({
  operationId: z.string(),
  type: z.string(),
  state: operationStateSchema,
  message: z.string().optional(),
  createdAt: z.string(),
});
export const operationEventsSchema = z.array(operationEventSchema);
export const protocolTraceSchema: z.ZodType<ProtocolTraceEntry[]> = z.array(
  z.object({
    id: z.number(),
    timestamp: z.string(),
    direction: z.enum(["sent", "received"]),
    layer: z.string(),
    appId: z.number().optional(),
    emsg: z.number(),
    name: z.string(),
    protobuf: z.boolean(),
    bodyBytes: z.number(),
    bodyHex: z.string(),
    decoded: z.unknown().optional(),
    decodeError: z.string().optional(),
  }),
);
const tf2InspectedItemSchema: z.ZodType<TF2InspectedItem> = z.lazy(() =>
  z.object({
    id: z.string(),
    originalId: z.string().optional(),
    definitionId: z.number().int(),
    quantity: z.number().int(),
    level: z.number().int(),
    qualityId: z.number().int(),
    flags: z.number().int(),
    originId: z.number().int(),
    customName: z.string().optional(),
    customDescription: z.string().optional(),
    style: z.number().int(),
    attributes: z.array(z.object({ definitionId: z.number().int(), value: z.string().optional(), valueBytes: z.string().optional() })),
    equippedStates: z.array(z.object({ classId: z.number().int(), slotId: z.number().int() })),
    interiorItem: tf2InspectedItemSchema.optional(),
  }),
);

export const tf2FeatureSnapshotSchema: z.ZodType<TF2FeatureSnapshot> = z.object({
  status: z.enum(["waiting", "ready", "disabled", "requires_connection"]),
  refreshedAt: z.string().optional(),
  presetItems: z.array(z.object({ classId: z.number().int(), presetId: z.number().int(), slotId: z.number().int(), itemId: z.string() })),
  classPresets: z.array(z.object({ classId: z.number().int(), activePresetId: z.number().int() })),
  matches: z.array(z.record(z.string(), z.unknown())),
  ladder: z.array(z.record(z.string(), z.unknown())),
  ratings: z.array(z.record(z.string(), z.unknown())),
  quests: z.array(z.record(z.string(), z.unknown())),
  questNodes: z.array(z.record(z.string(), z.unknown())),
  questRewards: z.array(z.record(z.string(), z.unknown())),
  matchmaking: z.record(z.string(), z.unknown()).optional(),
  dataCenterPing: z.record(z.string(), z.unknown()).optional(),
  dailyStats: z.record(z.string(), z.unknown()).optional(),
  activity: z.array(z.object({ kind: z.string(), id: z.string().optional(), timestamp: z.number().optional(), data: z.record(z.string(), z.unknown()) })),
  market: z.array(z.object({ definitionId: z.number().int(), qualityId: z.number().int(), sellListings: z.number().int(), priceMinor: z.number().int() })),
  inspectedItem: tf2InspectedItemSchema.optional(),
  inspectedAt: z.string().optional(),
  marketAt: z.string().optional(),
  currency: z.string().optional(),
  diagnostics: z.array(z.string()),
});

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

export const backendSchemas = {
  health: healthStatusSchema,
  inventory: inventorySnapshotSchema,
  armory: armorySnapshotSchema,
  store: storeSnapshotSchema,
  trades: steamTradesSnapshotSchema,
  tradeAccounts: steamAccountTradesCollectionSchema,
  tradeMutation: steamTradeMutationResultSchema,
  createTradeOffer: createSteamTradeOfferRequestSchema,
  purchaseSession: purchaseSessionSchema,
  initializeStorePurchase: initializeStorePurchaseRequestSchema,
  receipt: operationReceiptSchema,
  receipts: operationReceiptsSchema,
  events: operationEventsSchema,
  protocolTrace: protocolTraceSchema,
  tf2Features: tf2FeatureSnapshotSchema,
  settings: settingsDataSchema,
  connection: connectionStatusSchema,
  gameInventory: gameInventorySnapshotSchema,
  steamInventoryServiceGames: steamInventoryServiceGamesSchema,
  marketPreview: relatedItemSchema,
  priceScan: priceScanResultSchema,
} as const;
