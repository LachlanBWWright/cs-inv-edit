export type ConnectionState = "disconnected" | "connecting" | "connected" | "error";

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
}

export interface InventorySnapshot {
  items: InventoryItemDto[];
  refreshedAt: string;
}

export interface OperationReceipt {
  operationId: string;
  type: string;
  state: "queued" | "awaiting_gc_confirmation" | "completed" | "failed";
  createdAt: string;
}

export interface BackendEvent {
  type: "connection" | "inventory" | "operation" | "log";
  payload: unknown;
  createdAt: string;
}
