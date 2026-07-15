import type {
  ApplyStatTrakSwapRequest,
  ApplyStrangePartRequest,
  ApplyToolToBaseItemRequest,
  ApplyToolToItemRequest,
  ConnectionStatus,
	ArmorySnapshot,
	ArmoryRedeemRequest,
  DeleteItemRequest,
  GiftItemRequest,
  EconomyGame,
  GameInventorySnapshot,
  HealthStatus,
  InventorySnapshot,
  OperationEvent,
  OperationReceipt,
  RemoveItemNameRequest,
  SetItemNameRequest,
  SettingsData,
  UseItemRequest,
  UseMultipleItemsRequest,
} from "@cs-inv-edit/contracts";
import type { ResultAsync } from "neverthrow";
import type { AppError } from "./result-http.js";

type BackendResult<T> = ResultAsync<T, AppError>;

export interface AppBackendClient {
  health(): BackendResult<HealthStatus>;
  inventory(): BackendResult<InventorySnapshot>;
  refreshInventory(): BackendResult<OperationReceipt>;
  gameInventory(game: EconomyGame): BackendResult<GameInventorySnapshot>;
  refreshGameInventory(game: EconomyGame): BackendResult<OperationReceipt>;
  armory(): BackendResult<ArmorySnapshot>;
  refreshArmory(): BackendResult<OperationReceipt>;
  redeemArmory(input: ArmoryRedeemRequest): BackendResult<OperationReceipt>;
  submitOperation(type: string, input?: unknown): BackendResult<OperationReceipt>;
  operations(): BackendResult<OperationReceipt[]>;
  events(): BackendResult<OperationEvent[]>;
  settings(): BackendResult<SettingsData>;
  steamStatus?(): BackendResult<ConnectionStatus>;
  connectSteam?(input?: unknown): BackendResult<ConnectionStatus>;
  startSteamQR?(): BackendResult<ConnectionStatus>;
  watchSteamStatus?(listener: (status: ConnectionStatus) => void): () => void;
  submitSteamGuard?(input?: unknown): BackendResult<ConnectionStatus>;
  disconnectSteam?(): BackendResult<ConnectionStatus>;
  applyNameTag(input: SetItemNameRequest): BackendResult<OperationReceipt>;
  removeNameTag(input: RemoveItemNameRequest): BackendResult<OperationReceipt>;
  deleteItem(input: DeleteItemRequest): BackendResult<OperationReceipt>;
  applyStatTrakSwap(input: ApplyStatTrakSwapRequest): BackendResult<OperationReceipt>;
  applyStrangePart(input: ApplyStrangePartRequest): BackendResult<OperationReceipt>;
  useItem(input: UseItemRequest): BackendResult<OperationReceipt>;
  useMultipleItems(input: UseMultipleItemsRequest): BackendResult<OperationReceipt>;
  applyToolToItem(input: ApplyToolToItemRequest): BackendResult<OperationReceipt>;
  applyToolToBaseItem(input: ApplyToolToBaseItemRequest): BackendResult<OperationReceipt>;
  giftItem(input: GiftItemRequest): BackendResult<OperationReceipt>;
}
