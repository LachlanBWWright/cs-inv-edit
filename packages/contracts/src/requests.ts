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
  enableTf2Loadouts: boolean;
  enableTf2ItemUse: boolean;
  enableTf2Tools: boolean;
  enableTf2Crafting: boolean;
  enableTf2Unboxing: boolean;
  enableTf2Customization: boolean;
  enableDota2Inventory: boolean;
  enableSteamInventory: boolean;
  enableSteamTradeMutations?: boolean;
}

export interface SteamTradeMutationAssetRequest { appId: number; contextId: string; assetId: string; amount: number; }
export interface CreateSteamTradeOfferRequest {
  partnerSteamId: string; message?: string;
  itemsToGive: SteamTradeMutationAssetRequest[]; itemsToReceive: SteamTradeMutationAssetRequest[];
  tradeToken?: string;
}

export type EconomyGame = "steam" | "tf2" | "dota2";

export type TF2OperationRequest =
  | { type: "tf2.loadout.equip"; game: "tf2"; itemId: string; classId: number; slotId: number }
  | { type: "tf2.backpack.sort"; game: "tf2"; sortType: number }
  | { type: "tf2.items.use"; game: "tf2"; itemId: string; confirmed?: boolean }
  | { type: "tf2.tools.strange-part"; game: "tf2"; toolItemId: string; targetItemId: string; confirmed?: boolean }
  | { type: "tf2.tools.strange-restriction"; game: "tf2"; toolItemId: string; targetItemId: string; attributeIndex: number; confirmed?: boolean }
  | { type: "tf2.tools.strange-transfer"; game: "tf2"; toolItemId: string; sourceItemId: string; destinationItemId: string; confirmed?: boolean }
  | { type: "tf2.crafting.craft"; game: "tf2"; itemIds: string[]; recipeId?: number; confirmed?: boolean }
  | { type: "tf2.containers.open"; game: "tf2"; itemId: string; keyItemId?: string; confirmed?: boolean };

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
  tradableAfter?: string;
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
  itemKind?: "item" | "weapon" | "cosmetic" | "tool" | "container" | "crafting_material" | "taunt" | "paint_can" | "key" | "strangifier" | "killstreak_kit";
  itemClass?: string;
  craftClass?: string;
  craftMaterialType?: string;
  toolType?: string;
  description?: string;
  collection?: string;
  equipRegions?: string[];
  schemaTags?: string[];
  minLevel?: number;
  maxLevel?: number;
  properName?: boolean;
  baseItem?: boolean;
  hidden?: boolean;
  staticAttributes?: Record<string, string>;
  rarity?: string;
  equipConflicts?: string[];
  loadoutSlots?: Record<string, string>;
  prefabChain?: string[];
  containerItems?: TF2RelatedItem[];
  decodedAttributes?: TF2Attribute[];
  hero?: never;
  slot?: never;
}

export interface TF2RelatedItem {
  defIndex?: number;
  name: string;
  rarity?: string;
  poolKind: "primary" | "bonus" | "unresolved";
  imageUrl?: string;
}

export interface TF2Attribute {
  defIndex: number;
  name: string;
  value: string;
  effectType?: string;
  hidden?: boolean;
  attributeClass?: string;
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
  terminal: RevealAnimationMode;
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
