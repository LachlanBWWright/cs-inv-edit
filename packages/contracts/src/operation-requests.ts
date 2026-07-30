export interface SetItemNameRequest {
  subjectItemId: string;
  toolItemId: string;
  name: string;
}

export interface OpenContainerRequest {
  itemId: string;
  keyItemId?: string;
  pointsRemaining?: number;
  volatileLimit?: number;
}

export interface RemoveItemNameRequest {
  itemId: string;
}

export interface DeleteItemRequest {
  itemId: string;
}

export interface ApplyStatTrakSwapRequest {
  toolItemId: string;
  item1ItemId: string;
  item2ItemId: string;
}

export interface ApplyStrangePartRequest {
  strangePartItemId: string;
  itemItemId: string;
}

export interface UseItemRequest {
  itemId: string;
  targetSteamId?: string;
  giftPotentialTargets?: number[];
  duelClassLock?: number;
  initiatorSteamId?: string;
}

export interface UseMultipleItemsRequest {
  itemIds: string[];
}

export interface ApplyToolToItemRequest {
  toolItemId: string;
  subjectItemId: string;
}

export interface ApplyToolToBaseItemRequest {
  toolItemId: string;
  baseitemDefIndex: number;
}

export interface GiftItemRequest {
  itemId: string;
  receiverAccountId: number;
  giftMessage?: string;
}

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
