import { z } from "zod";
import {
  zArmorySnapshot,
  zInventoryItem,
  zInventorySnapshot,
  zRelatedItem,
  zConnectionStatus,
  zCreateSteamTradeOfferRequest,
  zInitializeStorePurchaseRequest,
  zPurchaseSession,
  zSteamAccountTradesCollection,
  zSteamTradeMutationResult,
  zSteamTradesSnapshot,
  zStoreSnapshot,
} from "./generated/zod.gen.js";
import { zPriceResult } from "./generated-data/zod.gen.js";

export const relatedItemSchema = zRelatedItem;
export const priceScanResultSchema = zPriceResult;
export const inventoryItemSchema = zInventoryItem;

export { zHealthStatus as healthStatusSchema } from "./generated/zod.gen.js";
export const inventorySnapshotSchema = zInventorySnapshot;
export const armorySnapshotSchema = zArmorySnapshot;
export const storeSnapshotSchema = z.preprocess(
  (value) =>
    value && typeof value === "object" && "offers" in value
      ? { ...value, offers: value.offers ?? [] }
      : value,
  zStoreSnapshot,
);
export const steamTradesSnapshotSchema = zSteamTradesSnapshot;
export const steamAccountTradesCollectionSchema = zSteamAccountTradesCollection;
export const createSteamTradeOfferRequestSchema =
  zCreateSteamTradeOfferRequest.refine(
    (input) => input.itemsToGive.length + input.itemsToReceive.length > 0,
    "At least one trade asset is required",
  );
export const steamTradeMutationResultSchema = zSteamTradeMutationResult;
export const initializeStorePurchaseRequestSchema =
  zInitializeStorePurchaseRequest;
export const purchaseSessionSchema = zPurchaseSession;
export const connectionStatusSchema = zConnectionStatus;
export const steamAccountProfilesSchema = z.array(
  z.object({
    accountName: z.string(),
    steamId: z.string().optional(),
    avatarUrl: z.string().optional(),
    signedIn: z.boolean(),
    lastSignedInAt: z.string(),
  }),
);
