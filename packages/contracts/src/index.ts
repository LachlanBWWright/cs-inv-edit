export type ConnectionState = "disconnected" | "connecting" | "awaiting_guard" | "needs_steam_guard" | "connected" | "error";

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
  marketName?: string;
  marketPrice?: string;
  marketSalePrice?: string;
  marketSellListings?: number;
  customName?: string;
  imageUrl?: string;
  kind: "weapon_skin" | "sticker_item" | "container" | "storage_unit" | "tool_item" | "cs2_econ_item" | "unknown";
  defindex?: number;
  paintWear?: number;
  storageCount?: number;
  casketId?: string;
  collection?: string;
  collectionItems?: RelatedItemDto[];
  containerItems?: RelatedItemDto[];
  exterior?: string;
  rarity?: string;
  storageLocation?: string;
  toolType?: string;
  stickers?: StickerDto[];
  unsupportedFields?: string[];
  hasCustomName?: boolean;
  isNameTagTool?: boolean;
  debug?: ItemDebugDto;
}

export interface RelatedItemDto {
  name: string;
  marketName?: string;
  rarity?: string;
}

export interface ItemDebugDto {
  gcId?: string;
  gcOriginalId?: string;
  gcDefIndex?: number;
  gcInventory?: number;
  gcQuantity?: number;
  gcQuality?: number;
  gcRarity?: number;
  gcPaintKit?: number;
  descriptionMatched: boolean;
  marketDescriptionUsed: boolean;
  attributes?: Record<string, number>;
}

export interface InventorySnapshot {
  items: InventoryItemDto[];
  refreshedAt: string;
  status?: "ready" | "requires_connection" | "loading" | "error";
  message?: string;
  error?: string;
  diagnostics?: string[];
}

export interface ArmoryOfferDto {
  campaignId: number;
  redeemId: number;
  expectedCost: number;
  generationTime: number;
}

export interface ArmorySnapshot {
  balance: number;
  generationTime: number;
  itemIds: string[];
  offers: ArmoryOfferDto[];
  refreshedAt: string;
  status: "ready" | "requires_connection" | "loading" | "error";
  message?: string;
  diagnostics?: string[];
}

export interface ArmoryRedeemRequest {
  campaignId: number;
  redeemId: number;
  expectedCost: number;
  redeemableBalance: number;
  generationTime: number;
}

export interface ConnectionStatus {
  state: ConnectionState;
  detail?: string;
  steamId?: string;
  accountName?: string;
  avatarUrl?: string;
  diagnostics?: string[];
}

export interface OperationReceipt {
  operationId: string;
  type: string;
  state: "queued" | "validating" | "encoded" | "sent" | "awaiting_gc_confirmation" | "reconciling_inventory" | "completed" | "failed" | "blocked_by_feature_flag" | "requires_validation";
  createdAt: string;
  message?: string;
  result?: OperationResult;
}

export interface OperationResult {
  openedItem?: InventoryItemDto;
  consumedItemId?: string;
  requestEMsg?: number;
  requestMethod?: string;
  requestBodyHex?: string;
  confirmation?: string;
  responseEMsg?: number;
  responseBodyHex?: string;
  beforeItemCount?: number;
  afterItemCount?: number;
  diagnostics?: string[];
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
  enableContainerOpening: boolean;
  enableInventoryDebug: boolean;
  enableTradeups: boolean;
  enableStickerExtract: boolean;
  enableNameTags: boolean;
  enableItemDeletion: boolean;
  enableStatTrakSwap: boolean;
  enableStrangeParts: boolean;
  enableItemUse: boolean;
  enableToolApplication: boolean;
  enableGifting: boolean;
  enableArmoryRead?: boolean;
  enableArmoryRedemption?: boolean;
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
