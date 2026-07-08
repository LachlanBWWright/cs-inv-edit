import { render } from "solid-js/web";
import type { ResultAsync } from "neverthrow";
import { App, postJsonResult, requestJsonResult, type AppBackendClient, type AppError } from "@cs-inv-edit/app";
import type { ConnectionStatus, FeatureFlags, HealthStatus, InventorySnapshot, OperationEvent, OperationReceipt, SettingsData } from "@cs-inv-edit/contracts";
import "@cs-inv-edit/app/styles.css";

const backendBase = "http://127.0.0.1:7331";

function toPromise<T>(result: ResultAsync<T, AppError>, fallback: T): Promise<T> {
  return result.match(
    (value) => value,
    (error) => {
      console.error(error.message, error.cause);
      return fallback;
    },
  );
}

function createFailedReceipt(type: string, message: string): OperationReceipt {
  return {
    operationId: "",
    type,
    state: "failed",
    createdAt: new Date().toISOString(),
    message,
  };
}

function createFallbackSettings(): SettingsData {
  const featureFlags: FeatureFlags = {
    enableStorageMutations: false,
    enableTradeups: false,
    enableStickerExtract: false,
    enableStickerRemove: false,
    enableStickerApply: false,
    enableNameTags: false,
    enableItemDeletion: false,
    enableStatTrakSwap: false,
    enableStrangeParts: false,
    enableItemUse: false,
    enableToolApplication: false,
    enableGifting: false,
  };

  return {
    backendUrl: backendBase,
    validationMode: false,
    sacrificialAccountMode: false,
    featureFlags,
  };
}

function createFallbackHealth(): HealthStatus {
  return {
    status: "error",
    service: "web",
    version: "0.0.0",
    time: new Date().toISOString(),
  };
}

function createFallbackInventory(): InventorySnapshot {
  return {
    items: [],
    refreshedAt: new Date().toISOString(),
  };
}

function createFallbackOperations(): OperationReceipt[] {
  return [];
}

function createFallbackEvents(): OperationEvent[] {
  return [];
}

function createRequestResult<T>(path: string, init?: RequestInit) {
  return requestJsonResult<T>(backendBase, path, init);
}

function createPostResult<T>(path: string, input?: unknown) {
  return postJsonResult<T>(backendBase, path, input);
}

const backend: AppBackendClient = {
  health: () => toPromise(createRequestResult<HealthStatus>("/health"), createFallbackHealth()),
  inventory: () => toPromise(createRequestResult<InventorySnapshot>("/inventory"), createFallbackInventory()),
  refreshInventory: () => toPromise(createRequestResult<OperationReceipt>("/inventory/refresh", { method: "POST" }), createFailedReceipt("inventory.refresh", "Failed to refresh inventory")),
  submitOperation: (type, input) => toPromise(createPostResult<OperationReceipt>(`/operations/${encodeURIComponent(type)}`, input), createFailedReceipt(type, "Failed to submit operation")),
  operations: () => toPromise(createRequestResult<OperationReceipt[]>("/operations"), createFallbackOperations()),
  events: () => toPromise(createRequestResult<OperationEvent[]>("/events"), createFallbackEvents()),
  settings: () => toPromise(createRequestResult<SettingsData>("/settings"), createFallbackSettings()),
  steamStatus: () => toPromise(createRequestResult<ConnectionStatus>("/steam/status"), { state: "disconnected" }),
  connectSteam: (input) => toPromise(createPostResult<ConnectionStatus>("/steam/connect", input), { state: "error", detail: "Connection failed" }),
  submitSteamGuard: (input) => toPromise(createPostResult<ConnectionStatus>("/steam/guard", input), { state: "error", detail: "Steam guard failed" }),
  disconnectSteam: () => toPromise(createRequestResult<ConnectionStatus>("/steam/disconnect", { method: "POST" }), { state: "error", detail: "Disconnect failed" }),
  applyNameTag: (input) => toPromise(createPostResult<OperationReceipt>("/nametags/apply", input), createFailedReceipt("nametags.apply", "Failed to apply name tag")),
  removeNameTag: (input) => toPromise(createPostResult<OperationReceipt>("/nametags/remove", input), createFailedReceipt("nametags.remove", "Failed to remove name tag")),
  deleteItem: (input) => toPromise(createPostResult<OperationReceipt>("/items/delete", input), createFailedReceipt("items.delete", "Failed to delete item")),
  applyStatTrakSwap: (input) => toPromise(createPostResult<OperationReceipt>("/stattrak/swap", input), createFailedReceipt("stattrak.swap", "Failed to apply StatTrak swap")),
  applyStrangePart: (input) => toPromise(createPostResult<OperationReceipt>("/strange-parts/apply", input), createFailedReceipt("strange-parts.apply", "Failed to apply strange part")),
  useItem: (input) => toPromise(createPostResult<OperationReceipt>("/items/use", input), createFailedReceipt("items.use", "Failed to use item")),
  useMultipleItems: (input) => toPromise(createPostResult<OperationReceipt>("/items/use-multiple", input), createFailedReceipt("items.use-multiple", "Failed to use multiple items")),
  applyToolToItem: (input) => toPromise(createPostResult<OperationReceipt>("/tools/apply", input), createFailedReceipt("tools.apply", "Failed to apply tool to item")),
  applyToolToBaseItem: (input) => toPromise(createPostResult<OperationReceipt>("/tools/apply-base", input), createFailedReceipt("tools.apply-base", "Failed to apply tool to base item")),
  giftItem: (input) => toPromise(createPostResult<OperationReceipt>("/gifts/send", input), createFailedReceipt("gifts.send", "Failed to send gift")),
};

render(() => <App backend={backend} platform="web" />, document.getElementById("root")!);
