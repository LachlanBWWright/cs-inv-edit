export interface AppBackendClient {
  health(): Promise<HealthStatus>;
  inventory(): Promise<InventorySnapshot>;
  refreshInventory(): Promise<InventorySnapshot>;
  submitOperation(type: string, input?: unknown): Promise<OperationReceipt>;
  events(): Promise<BackendEvent[]>;
  getSettings(): Promise<FeatureSettings>;
  updateSettings(settings: FeatureSettings): Promise<FeatureSettings>;
  connectSteam(input?: unknown): Promise<ConnectionStatus>;
  submitSteamGuard(input?: unknown): Promise<ConnectionStatus>;
  disconnectSteam(): Promise<ConnectionStatus>;
}

export interface ConnectionStatus {
  state: "disconnected" | "connecting" | "connected" | "error";
  detail?: string;
}

export interface HealthStatus {
  status: "ok";
  service: string;
  version: string;
  time: string;
}

export interface InventoryItemDto {
  id: string;
  name: string;
  kind: "weapon_skin" | "sticker_item" | "container" | "storage_unit" | "unknown";
  defindex?: number;
  paintWear?: number;
  storageCount?: number;
  casketId?: string;
  stickers?: Array<{
    id?: string;
    name?: string;
    slot?: number;
  }>;
}

export interface InventorySnapshot {
  items: InventoryItemDto[];
  refreshedAt: string;
}

export interface OperationReceipt {
  operationId: string;
  type: string;
  state: "queued" | "validating" | "encoded" | "sent" | "awaiting_gc_confirmation" | "reconciling_inventory" | "completed" | "failed" | "blocked_by_feature_flag" | "requires_validation";
  createdAt: string;
  message?: string;
  encoded?: {
    appid?: number;
    emsg?: number;
    bodyHash?: string;
  };
}

export interface BackendEvent {
  type: "connection" | "inventory" | "operation" | "log";
  payload: unknown;
  createdAt: string;
}

export interface FeatureSettings {
  enableStorageMutations: boolean;
  enableTradeups: boolean;
  enableStickerExtract: boolean;
  enableStickerRemove: boolean;
  enableStickerApply: boolean;
  validationMode: boolean;
  sacrificialAccountMode: boolean;
}

export const defaultFeatureSettings: FeatureSettings = {
  enableStorageMutations: true,
  enableTradeups: false,
  enableStickerExtract: false,
  enableStickerRemove: false,
  enableStickerApply: false,
  validationMode: true,
  sacrificialAccountMode: true,
};
