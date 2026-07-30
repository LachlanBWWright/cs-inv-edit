import { z } from "zod";
import type {
  ArmorySnapshot,
  ConnectionStatus,
  HealthStatus,
  InventorySnapshot,
  PriceScanResult,
  PurchaseSession,
  SteamAccountTradesCollection,
  SteamTradeMutationResult,
  SteamTradesSnapshot,
  StoreSnapshot,
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


