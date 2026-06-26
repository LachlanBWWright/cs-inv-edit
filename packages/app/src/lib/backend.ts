import type {
  ConnectionStatus,
  FeatureFlags,
  HealthStatus,
  InventorySnapshot,
  OperationEvent,
  OperationReceipt,
  SettingsData,
} from "@cs-inv-edit/contracts";

export interface AppBackendClient {
  health(): Promise<HealthStatus>;
  inventory(): Promise<InventorySnapshot>;
  refreshInventory(): Promise<OperationReceipt>;
  submitOperation(type: string, input?: unknown): Promise<OperationReceipt>;
  operations(): Promise<OperationReceipt[]>;
  events(): Promise<OperationEvent[]>;
  settings(): Promise<SettingsData>;
  connectSteam?(input?: unknown): Promise<ConnectionStatus>;
  submitSteamGuard?(input?: unknown): Promise<ConnectionStatus>;
  disconnectSteam?(): Promise<ConnectionStatus>;
}
