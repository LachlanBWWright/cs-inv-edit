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
  enableCs2Loadouts?: boolean;
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

export interface SteamTradeMutationAssetRequest {
  appId: number;
  contextId: string;
  assetId: string;
  amount: number;
}
export interface CreateSteamTradeOfferRequest {
  partnerSteamId: string;
  message?: string;
  itemsToGive: SteamTradeMutationAssetRequest[];
  itemsToReceive: SteamTradeMutationAssetRequest[];
  tradeToken?: string;
}

export type EconomyGame = "steam" | "tf2" | "dota2";
export type EconomyInventorySource = EconomyGame | "steam-service";

export type TF2OperationRequest =
  | {
      type: "tf2.loadout.equip";
      game: "tf2";
      itemId: string;
      classId: number;
      slotId: number;
    }
  | {
      type: "tf2.loadout.set-preset-item";
      game: "tf2";
      itemId: string;
      classId: number;
      presetId: number;
      slotId: number;
    }
  | {
      type: "tf2.loadout.select-preset";
      game: "tf2";
      classId: number;
      presetId: number;
    }
  | { type: "tf2.backpack.sort"; game: "tf2"; sortType: number }
  | { type: "tf2.items.use"; game: "tf2"; itemId: string; confirmed?: boolean }
  | {
      type: "tf2.tools.strange-part";
      game: "tf2";
      toolItemId: string;
      targetItemId: string;
      confirmed?: boolean;
    }
  | {
      type: "tf2.tools.strange-restriction";
      game: "tf2";
      toolItemId: string;
      targetItemId: string;
      attributeIndex: number;
      confirmed?: boolean;
    }
  | {
      type: "tf2.tools.strange-transfer";
      game: "tf2";
      toolItemId: string;
      sourceItemId: string;
      destinationItemId: string;
      confirmed?: boolean;
    }
  | {
      type: "tf2.tools.strange-remove";
      game: "tf2";
      itemId: string;
      scoreType: number;
      confirmed?: boolean;
    }
  | {
      type: "tf2.tools.strange-reset";
      game: "tf2";
      itemId: string;
      confirmed?: boolean;
    }
  | { type: "tf2.matches.load"; game: "tf2"; matchGroup: number }
  | {
      type: "tf2.inspect.resolve";
      game: "tf2";
      paramS?: string;
      paramA: string;
      paramD: string;
      paramM?: string;
    }
  | { type: "tf2.market.refresh"; game: "tf2"; currency: number }
  | {
      type: "tf2.crafting.craft";
      game: "tf2";
      itemIds: string[];
      recipeId?: number;
      confirmed?: boolean;
    }
  | {
      type: "tf2.containers.open";
      game: "tf2";
      itemId: string;
      keyItemId?: string;
      confirmed?: boolean;
    };

export interface TF2InspectedItem {
  id: string;
  originalId?: string;
  definitionId: number;
  quantity: number;
  level: number;
  qualityId: number;
  flags: number;
  originId: number;
  customName?: string;
  customDescription?: string;
  style: number;
  attributes: { definitionId: number; value?: string; valueBytes?: string }[];
  equippedStates: { classId: number; slotId: number }[];
  interiorItem?: TF2InspectedItem;
}

export interface TF2FeatureSnapshot {
  status: "waiting" | "ready" | "disabled" | "requires_connection";
  refreshedAt?: string;
  presetItems: { classId: number; presetId: number; slotId: number; itemId: string }[];
  classPresets: { classId: number; activePresetId: number }[];
  matches: Record<string, unknown>[];
  ladder: Record<string, unknown>[];
  ratings: Record<string, unknown>[];
  quests: Record<string, unknown>[];
  questNodes: Record<string, unknown>[];
  questRewards: Record<string, unknown>[];
  matchmaking?: Record<string, unknown>;
  dataCenterPing?: Record<string, unknown>;
  dailyStats?: Record<string, unknown>;
  activity: { kind: string; id?: string; timestamp?: number; data: Record<string, unknown> }[];
  market: { definitionId: number; qualityId: number; sellListings: number; priceMinor: number }[];
  inspectedItem?: TF2InspectedItem;
  inspectedAt?: string;
  marketAt?: string;
  currency?: string;
  diagnostics: string[];
}

export interface CS2FeatureSnapshot {
  status: "waiting" | "ready" | "requires_connection";
  refreshedAt?: string;
  equipSlots: { classId: number; slotId: number; itemId: string; definitionId: number }[];
  matches: Record<string, unknown>[];
  profile?: Record<string, unknown>;
  premier?: Record<string, unknown>;
  deepStats?: Record<string, unknown>;
  searchStats?: Record<string, unknown>;
  inspectedItem?: Record<string, unknown>;
  inspectedAt?: string;
  rentals: Record<string, unknown>[];
  quests: Record<string, unknown>[];
  recurringMissions: Record<string, unknown>[];
  seasonalOperations: Record<string, unknown>[];
  xpShop?: Record<string, unknown>;
  recurringSchema?: Record<string, unknown>;
  activity: { kind: string; id?: string; timestamp?: number; data: Record<string, unknown> }[];
  diagnostics: string[];
}

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
  inspectUrl?: string;
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
  itemKind?:
    | "item"
    | "weapon"
    | "cosmetic"
    | "tool"
    | "container"
    | "crafting_material"
    | "taunt"
    | "paint_can"
    | "key"
    | "strangifier"
    | "killstreak_kit";
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

export interface SteamInventoryServiceItemDetails extends EconomyItemDetailsBase {
  game: "steam-service";
  serviceItemId: string;
  serviceDefinitionId: string;
  acquiredAt?: string;
  stateChangedAt?: string;
  serviceState?: string;
  serviceOrigin?: string;
  dynamicProperties?: Record<string, string>;
  hero?: never;
  slot?: never;
  schemaQuality?: never;
  equipSlot?: never;
  usableClasses?: never;
  capabilities?: never;
}

export interface SteamInventoryServiceGame {
  appId: number;
  name: string;
  playtimeMinutes: number;
  lastPlayed: number;
  hasMarket: boolean;
}

export interface SteamInventoryServiceGames {
  games: SteamInventoryServiceGame[];
  refreshedAt: string;
  status: "ready" | "requires_connection" | "error";
  message?: string;
  diagnostics: string[];
}

export type EconomyInventoryItemDto =
  | (EconomyInventoryItemBase & {
      game: "steam";
      appId: 753;
      details: SteamItemDetails;
    })
  | (EconomyInventoryItemBase & {
      game: "steam-service";
      appId: number;
      details: SteamInventoryServiceItemDetails;
    })
  | (EconomyInventoryItemBase & {
      game: "tf2";
      appId: 440;
      details: TF2ItemDetails;
    })
  | (EconomyInventoryItemBase & {
      game: "dota2";
      appId: 570;
      details: Dota2ItemDetails;
    });

interface GameInventorySnapshotBase {
  refreshedAt: string;
  status: "ready" | "requires_connection" | "loading" | "error";
  message?: string;
  error?: string;
  schemaRevision?: string;
  diagnostics: string[];
}

export type GameInventorySnapshot =
  | (GameInventorySnapshotBase & {
      game: "steam";
      appId: 753;
      items: Extract<EconomyInventoryItemDto, { game: "steam" }>[];
    })
  | (GameInventorySnapshotBase & {
      game: "steam-service";
      appId: number;
      items: Extract<EconomyInventoryItemDto, { game: "steam-service" }>[];
    })
  | (GameInventorySnapshotBase & {
      game: "tf2";
      appId: 440;
      items: Extract<EconomyInventoryItemDto, { game: "tf2" }>[];
    })
  | (GameInventorySnapshotBase & {
      game: "dota2";
      appId: 570;
      items: Extract<EconomyInventoryItemDto, { game: "dota2" }>[];
    });

export interface SettingsData {
  backendUrl: string;
  validationMode: boolean;
  sacrificialAccountMode: boolean;
  featureFlags: FeatureFlags;
  animations: AnimationSettings;
  armoryPurchasePacingSeconds: number;
}

import type { AnimationSettings } from "./settings-contracts.js";
