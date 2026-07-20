export interface FeatureFlags {
  enableStorageMutations: boolean;
  enableContainerOpening: boolean;
  enableInventoryDebug: boolean;
  showStorageUnitItems: boolean;
  enableProtocolConsole?: boolean;
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
  enableStoreRead?: boolean;
  enableStorePurchases?: boolean;
  enableTf2Inventory: boolean;
  enableDota2Inventory: boolean;
  enableSteamInventory: boolean;
}

export type EconomyGame = "steam" | "tf2" | "dota2";

export interface EconomyTagDto {
  category: string;
  internalName: string;
  name: string;
}

interface EconomyInventoryItemBase {
  contextId?: string;
  assetId: string;
  classId?: string;
  instanceId?: string;
  definitionId?: number;
  name: string;
  marketName?: string;
  imageUrl?: string;
  quantity: number;
  type?: string;
  rarity?: string;
  quality?: string;
  tradable: boolean;
  marketable: boolean;
  tags: EconomyTagDto[];
  descriptions?: string[];
}

export interface EconomyItemDetailsBase {
  level: number;
  qualityId: number;
  inventoryPosition: number;
  originId: number;
  style: number;
  flags: number;
  customName?: string;
  customDescription?: string;
  attributes: Record<string, number>;
  attributeBytes?: Record<string, string>;
  equippedStates?: { class: number; slot: number }[];
  interiorItemId?: string;
}

export interface TF2ItemDetails extends EconomyItemDetailsBase {
  game: "tf2";
  schemaQuality?: string;
  equipSlot?: string;
  usableClasses?: string[];
  capabilities?: Record<string, string>;
  hero?: never;
  slot?: never;
}

export interface Dota2ItemDetails extends EconomyItemDetailsBase {
  game: "dota2";
  hero?: string;
  slot?: string;
  schemaQuality?: never;
  equipSlot?: never;
  usableClasses?: never;
  capabilities?: never;
}

export interface SteamItemDetails extends EconomyItemDetailsBase {
  game: "steam";
  hero?: never;
  slot?: never;
  schemaQuality?: never;
  equipSlot?: never;
  usableClasses?: never;
  capabilities?: never;
}

export type EconomyInventoryItemDto =
  | (EconomyInventoryItemBase & { game: "steam"; appId: 753; details: SteamItemDetails })
  | (EconomyInventoryItemBase & { game: "tf2"; appId: 440; details: TF2ItemDetails })
  | (EconomyInventoryItemBase & { game: "dota2"; appId: 570; details: Dota2ItemDetails });

interface GameInventorySnapshotBase {
  refreshedAt: string;
  status: "ready" | "requires_connection" | "loading" | "error";
  message?: string;
  error?: string;
  schemaRevision?: string;
  diagnostics: string[];
}

export type GameInventorySnapshot =
  | (GameInventorySnapshotBase & { game: "steam"; appId: 753; items: Extract<EconomyInventoryItemDto, { game: "steam" }>[] })
  | (GameInventorySnapshotBase & { game: "tf2"; appId: 440; items: Extract<EconomyInventoryItemDto, { game: "tf2" }>[] })
  | (GameInventorySnapshotBase & { game: "dota2"; appId: 570; items: Extract<EconomyInventoryItemDto, { game: "dota2" }>[] });

export interface SettingsData {
  backendUrl: string;
  validationMode: boolean;
  sacrificialAccountMode: boolean;
  featureFlags: FeatureFlags;
  animations: AnimationSettings;
  armoryPurchasePacingSeconds: number;
}

export type RevealAnimationMode = "none" | "countdown" | "slot-machine";
export type TradeUpAnimationMode = RevealAnimationMode | "contract-none" | "contract-countdown" | "contract-slot-machine";

export interface AnimationSettings {
  container: RevealAnimationMode;
  tradeUp: TradeUpAnimationMode;
  armory: RevealAnimationMode;
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

export interface OpenContainerRequest {
  itemId: string;
  keyItemId?: string;
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
