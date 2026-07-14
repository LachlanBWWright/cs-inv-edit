import { z } from "zod";
import type { ArmorySnapshot, ConnectionStatus, HealthStatus, InventorySnapshot, OperationEvent, OperationReceipt, SettingsData } from "./index.js";

const relatedItemSchema = z.object({ name: z.string(), marketName: z.string().optional(), rarity: z.string().optional() });
const appliedItemSchema = z.object({ kind: z.enum(["sticker", "charm", "patch"]), slot: z.number().optional(), id: z.number().optional(), name: z.string(), imageUrl: z.string().optional() });
const itemDebugSchema = z.object({
  gcId: z.string().optional(), gcOriginalId: z.string().optional(), gcDefIndex: z.number().optional(), gcInventory: z.number().optional(), gcQuantity: z.number().optional(), gcQuality: z.number().optional(), gcRarity: z.number().optional(), gcPaintKit: z.number().optional(),
  descriptionMatched: z.boolean(), marketDescriptionUsed: z.boolean(), attributes: z.record(z.string(), z.number()).optional(),
});
export const inventoryItemSchema = z.object({
  id: z.string(), name: z.string(), marketName: z.string().optional(), marketPrice: z.string().optional(), marketSalePrice: z.string().optional(), marketSellListings: z.number().optional(), customName: z.string().optional(), imageUrl: z.string().optional(),
  kind: z.enum(["weapon_skin", "sticker_item", "container", "storage_unit", "tool_item", "cs2_econ_item", "unknown"]), defindex: z.number().optional(), paintWear: z.number().optional(), storageCount: z.number().optional(), casketId: z.string().optional(), collection: z.string().optional(),
  collectionItems: z.array(relatedItemSchema).optional(), containerItems: z.array(relatedItemSchema).optional(), exterior: z.string().optional(), rarity: z.string().optional(), storageLocation: z.string().optional(), toolType: z.string().optional(),
  stickers: z.array(z.object({ slot: z.number().optional(), stickerId: z.number().optional(), wear: z.number().optional() })).optional(), appliedItems: z.array(appliedItemSchema).optional(), isStatTrak: z.boolean().optional(), isSouvenir: z.boolean().optional(), tradable: z.boolean().optional(), tradableAfter: z.string().optional(), unsupportedFields: z.array(z.string()).optional(), diagnostics: z.array(z.string()).optional(), hasCustomName: z.boolean().optional(), isNameTagTool: z.boolean().optional(), debug: itemDebugSchema.optional(),
});

export const healthStatusSchema: z.ZodType<HealthStatus> = z.object({ status: z.enum(["ok", "error"]), service: z.string(), version: z.string(), time: z.string() });
export const inventorySnapshotSchema: z.ZodType<InventorySnapshot> = z.object({ items: z.array(inventoryItemSchema), refreshedAt: z.string(), status: z.enum(["ready", "requires_connection", "loading", "error"]).optional(), message: z.string().optional(), error: z.string().optional(), diagnostics: z.array(z.string()).optional() });
export const armorySnapshotSchema: z.ZodType<ArmorySnapshot> = z.object({ balance: z.number(), generationTime: z.number(), itemIds: z.array(z.string()), offers: z.array(z.object({ campaignId: z.number(), redeemId: z.number(), expectedCost: z.number(), generationTime: z.number(), itemName: z.string().optional(), name: z.string().optional(), category: z.string().optional(), items: z.array(relatedItemSchema).optional() })), refreshedAt: z.string(), status: z.enum(["ready", "requires_connection", "loading", "error"]), message: z.string().optional(), diagnostics: z.array(z.string()).optional() });
export const connectionStatusSchema: z.ZodType<ConnectionStatus> = z.object({ state: z.enum(["disconnected", "connecting", "awaiting_guard", "needs_steam_guard", "connected", "error"]), detail: z.string().optional(), steamId: z.string().optional(), accountName: z.string().optional(), avatarUrl: z.string().optional(), diagnostics: z.array(z.string()).optional() });
export const steamAccountProfilesSchema = z.array(z.object({ accountName: z.string(), steamId: z.string().optional(), avatarUrl: z.string().optional(), signedIn: z.boolean(), lastSignedInAt: z.string() }));

const operationStateSchema = z.enum(["queued", "validating", "encoded", "sent", "awaiting_gc_confirmation", "reconciling_inventory", "completed", "failed", "blocked_by_feature_flag", "requires_validation", "requires_connection"]);
const operationResultSchema = z.object({ openedItem: inventoryItemSchema.optional(), consumedItemId: z.string().optional(), requestEMsg: z.number().optional(), requestMethod: z.string().optional(), requestBodyHex: z.string().optional(), confirmation: z.string().optional(), responseEMsg: z.number().optional(), responseBodyHex: z.string().optional(), beforeItemCount: z.number().optional(), afterItemCount: z.number().optional(), diagnostics: z.array(z.string()).optional() });
export const operationReceiptSchema: z.ZodType<OperationReceipt> = z.object({ operationId: z.string(), type: z.string(), state: operationStateSchema, createdAt: z.string(), message: z.string().optional(), result: operationResultSchema.optional() });
export const operationReceiptsSchema = z.array(operationReceiptSchema);
export const operationEventSchema: z.ZodType<OperationEvent> = z.object({ operationId: z.string(), type: z.string(), state: operationStateSchema, message: z.string().optional(), createdAt: z.string() });
export const operationEventsSchema = z.array(operationEventSchema);

const animationModeSchema = z.enum(["none", "countdown", "slot-machine"]);
export const settingsDataSchema: z.ZodType<SettingsData> = z.object({
  backendUrl: z.string(), validationMode: z.boolean(), sacrificialAccountMode: z.boolean(),
  featureFlags: z.object({ enableStorageMutations: z.boolean(), enableContainerOpening: z.boolean(), enableInventoryDebug: z.boolean(), enableTradeups: z.boolean(), enableStickerExtract: z.boolean(), enableNameTags: z.boolean(), enableItemDeletion: z.boolean(), enableStatTrakSwap: z.boolean(), enableStrangeParts: z.boolean(), enableItemUse: z.boolean(), enableToolApplication: z.boolean(), enableGifting: z.boolean(), enableArmoryRead: z.boolean().optional(), enableArmoryRedemption: z.boolean().optional() }),
  animations: z.object({ container: animationModeSchema, tradeUp: animationModeSchema, armory: animationModeSchema }),
});

export const backendSchemas = {
  health: healthStatusSchema, inventory: inventorySnapshotSchema, armory: armorySnapshotSchema,
  receipt: operationReceiptSchema, receipts: operationReceiptsSchema, events: operationEventsSchema,
  settings: settingsDataSchema, connection: connectionStatusSchema,
} as const;
