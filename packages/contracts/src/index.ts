export type ConnectionState = "disconnected" | "connecting" | "awaiting_guard" | "connected" | "error";

export interface HealthStatus {
  status: "ok" | "error";
  service: string;
  version: string;
  time: string;
}

export interface StickerDto {
  slot?: number;
  stickerId?: number;
  wear?: number;
}

export interface InventoryItemDto {
  id: string;
  name: string;
  kind: "weapon_skin" | "sticker_item" | "container" | "storage_unit" | "tool_item" | "unknown";
  defindex?: number;
  paintWear?: number;
  storageCount?: number;
  casketId?: string;
  stickers?: StickerDto[];
  unsupportedFields?: string[];
}

export interface InventorySnapshot {
  items: InventoryItemDto[];
  refreshedAt: string;
}

export interface ConnectionStatus {
  state: ConnectionState;
  detail?: string;
}

export interface OperationReceipt {
  operationId: string;
  type: string;
  state: "queued" | "validating" | "encoded" | "sent" | "awaiting_gc_confirmation" | "reconciling_inventory" | "completed" | "failed" | "blocked_by_feature_flag" | "requires_validation";
  createdAt: string;
  message?: string;
}

export interface OperationEvent {
  operationId: string;
  type: string;
  state: OperationReceipt["state"];
  message?: string;
  createdAt: string;
}

export interface FeatureFlags {
  enableStorageMutations: boolean;
  enableTradeups: boolean;
  enableStickerExtract: boolean;
  enableStickerRemove: boolean;
  enableStickerApply: boolean;
  enableNameTags: boolean;
  enableItemDeletion: boolean;
  enableStatTrakSwap: boolean;
  enableStrangeParts: boolean;
  enableItemUse: boolean;
  enableToolApplication: boolean;
  enableGifting: boolean;
}

export interface SettingsData {
  backendUrl: string;
  validationMode: boolean;
  sacrificialAccountMode: boolean;
  featureFlags: FeatureFlags;
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

export interface SetItemNameRequest {
  subjectItemId: string;
  toolItemId: string;
  name: string;
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
