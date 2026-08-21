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
import type { ResultAsync } from "neverthrow";
import type { AppError } from "./result-http.js";

export type OperationBackend = Pick<
  AppBackendClient,
  | "applyNameTag"
  | "removeNameTag"
  | "deleteItem"
  | "applyStatTrakSwap"
  | "applyStrangePart"
  | "useItem"
  | "useMultipleItems"
  | "applyToolToItem"
  | "applyToolToBaseItem"
  | "giftItem"
>;

export interface OperationApi {
  applyNameTag(
    input: SetItemNameRequest,
  ): ResultAsync<OperationReceipt, AppError>;
  removeNameTag(
    input: RemoveItemNameRequest,
  ): ResultAsync<OperationReceipt, AppError>;
  deleteItem(input: DeleteItemRequest): ResultAsync<OperationReceipt, AppError>;
  applyStatTrakSwap(
    input: ApplyStatTrakSwapRequest,
  ): ResultAsync<OperationReceipt, AppError>;
  applyStrangePart(
    input: ApplyStrangePartRequest,
  ): ResultAsync<OperationReceipt, AppError>;
  useItem(input: UseItemRequest): ResultAsync<OperationReceipt, AppError>;
  useMultipleItems(
    input: UseMultipleItemsRequest,
  ): ResultAsync<OperationReceipt, AppError>;
  applyToolToItem(
    input: ApplyToolToItemRequest,
  ): ResultAsync<OperationReceipt, AppError>;
  applyToolToBaseItem(
    input: ApplyToolToBaseItemRequest,
  ): ResultAsync<OperationReceipt, AppError>;
  giftItem(input: GiftItemRequest): ResultAsync<OperationReceipt, AppError>;
}

export function createOperationApi(backend: OperationBackend): OperationApi {
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
