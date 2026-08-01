import type {
  ApplyStatTrakSwapRequest,
  ApplyStrangePartRequest,
  ApplyToolToBaseItemRequest,
  ApplyToolToItemRequest,
  GiftItemRequest,
  ItemIdRequest,
  OpenContainerRequest,
  SetItemNameRequest,
  UseItemRequest,
  UseMultipleItemsRequest,
} from "./generated/types.gen.js";

export type {
  ApplyStatTrakSwapRequest,
  ApplyStrangePartRequest,
  ApplyToolToBaseItemRequest,
  ApplyToolToItemRequest,
  GiftItemRequest,
  OpenContainerRequest,
  SetItemNameRequest,
  UseItemRequest,
  UseMultipleItemsRequest,
};
export type RemoveItemNameRequest = ItemIdRequest;
export type DeleteItemRequest = ItemIdRequest;

export interface TradeUpPreview {
  valid: boolean;
  message: string;
  selectedCount: number;
}

export interface BackendEvent {
  type: "connection" | "inventory" | "operation" | "log";
  payload: unknown;
  createdAt: string;
}
