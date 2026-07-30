import {
  armorySnapshotSchema,
  connectionStatusSchema,
  createSteamTradeOfferRequestSchema,
  healthStatusSchema,
  initializeStorePurchaseRequestSchema,
  inventorySnapshotSchema,
  priceScanResultSchema,
  purchaseSessionSchema,
  relatedItemSchema,
  steamAccountTradesCollectionSchema,
  steamTradeMutationResultSchema,
  steamTradesSnapshotSchema,
  storeSnapshotSchema,
} from "./inventory-schemas.js";
import {
  cs2FeatureSnapshotSchema,
  operationEventsSchema,
  operationReceiptSchema,
  operationReceiptsSchema,
  protocolTraceSchema,
  tf2FeatureSnapshotSchema,
} from "./operation-schemas.js";
import {
  gameInventorySnapshotSchema,
  settingsDataSchema,
  steamInventoryServiceGamesSchema,
} from "./game-schemas.js";

export * from "./game-schemas.js";
export * from "./inventory-schemas.js";
export * from "./operation-schemas.js";

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
  cs2Features: cs2FeatureSnapshotSchema,
  settings: settingsDataSchema,
  connection: connectionStatusSchema,
  gameInventory: gameInventorySnapshotSchema,
  steamInventoryServiceGames: steamInventoryServiceGamesSchema,
  marketPreview: relatedItemSchema,
  priceScan: priceScanResultSchema,
} as const;
