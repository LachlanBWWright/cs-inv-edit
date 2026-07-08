import type {
  ApplyStatTrakSwapRequest,
  ApplyStrangePartRequest,
  ApplyToolToBaseItemRequest,
  ApplyToolToItemRequest,
  DeleteItemRequest,
  GiftItemRequest,
  OperationReceipt,
  RemoveItemNameRequest,
  SetItemNameRequest,
  UseItemRequest,
  UseMultipleItemsRequest,
} from "@cs-inv-edit/contracts";
import type { AppBackendClient } from "./backend.js";

export interface OperationApi {
  applyNameTag(input: SetItemNameRequest): Promise<OperationReceipt>;
  removeNameTag(input: RemoveItemNameRequest): Promise<OperationReceipt>;
  deleteItem(input: DeleteItemRequest): Promise<OperationReceipt>;
  applyStatTrakSwap(input: ApplyStatTrakSwapRequest): Promise<OperationReceipt>;
  applyStrangePart(input: ApplyStrangePartRequest): Promise<OperationReceipt>;
  useItem(input: UseItemRequest): Promise<OperationReceipt>;
  useMultipleItems(input: UseMultipleItemsRequest): Promise<OperationReceipt>;
  applyToolToItem(input: ApplyToolToItemRequest): Promise<OperationReceipt>;
  applyToolToBaseItem(input: ApplyToolToBaseItemRequest): Promise<OperationReceipt>;
  giftItem(input: GiftItemRequest): Promise<OperationReceipt>;
}

export function createOperationApi(backend: AppBackendClient): OperationApi {
  return {
    applyNameTag: (input) => backend.applyNameTag(input),
    removeNameTag: (input) => backend.removeNameTag(input),
    deleteItem: (input) => backend.deleteItem(input),
    applyStatTrakSwap: (input) => backend.applyStatTrakSwap(input),
    applyStrangePart: (input) => backend.applyStrangePart(input),
    useItem: (input) => backend.useItem(input),
    useMultipleItems: (input) => backend.useMultipleItems(input),
    applyToolToItem: (input) => backend.applyToolToItem(input),
    applyToolToBaseItem: (input) => backend.applyToolToBaseItem(input),
    giftItem: (input) => backend.giftItem(input),
  };
}
