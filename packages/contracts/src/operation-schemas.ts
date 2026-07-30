import { z } from "zod";
import type {
  CS2FeatureSnapshot,
  OperationEvent,
  OperationReceipt,
  ProtocolTraceEntry,
  TF2FeatureSnapshot,
  TF2InspectedItem,
} from "./index.js";
import { inventoryItemSchema, relatedItemSchema } from "./inventory-schemas.js";

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
export const cs2FeatureSnapshotSchema: z.ZodType<CS2FeatureSnapshot> = z.object({
  status: z.enum(["waiting", "ready", "requires_connection"]),
  refreshedAt: z.string().optional(),
  equipSlots: z.array(z.object({ classId: z.number().int(), slotId: z.number().int(), itemId: z.string(), definitionId: z.number().int() })),
  matches: z.array(z.record(z.string(), z.unknown())),
  profile: z.record(z.string(), z.unknown()).optional(),
  premier: z.record(z.string(), z.unknown()).optional(),
  deepStats: z.record(z.string(), z.unknown()).optional(),
  searchStats: z.record(z.string(), z.unknown()).optional(),
  inspectedItem: z.record(z.string(), z.unknown()).optional(),
  inspectedAt: z.string().optional(),
  rentals: z.array(z.record(z.string(), z.unknown())),
  quests: z.array(z.record(z.string(), z.unknown())),
  recurringMissions: z.array(z.record(z.string(), z.unknown())),
  seasonalOperations: z.array(z.record(z.string(), z.unknown())),
  xpShop: z.record(z.string(), z.unknown()).optional(),
  recurringSchema: z.record(z.string(), z.unknown()).optional(),
  activity: z.array(z.object({ kind: z.string(), id: z.string().optional(), timestamp: z.number().optional(), data: z.record(z.string(), z.unknown()) })),
  diagnostics: z.array(z.string()),
});


