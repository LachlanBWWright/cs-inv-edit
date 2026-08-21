import { z } from "zod";
import {
  zOperationEvent,
  zOperationReceipt,
  zProtocolTraceEntry,
  zCs2FeatureSnapshot,
  zTf2FeatureSnapshot,
} from "./generated/zod.gen.js";
export const operationReceiptSchema = zOperationReceipt;
export const operationReceiptsSchema = z.array(operationReceiptSchema);
export const operationEventSchema = zOperationEvent;
export const operationEventsSchema = z.array(operationEventSchema);
export const protocolTraceSchema = z.array(zProtocolTraceEntry);
export const tf2FeatureSnapshotSchema = zTf2FeatureSnapshot;
export const cs2FeatureSnapshotSchema = zCs2FeatureSnapshot;
