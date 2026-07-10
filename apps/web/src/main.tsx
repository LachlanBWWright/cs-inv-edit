import { render } from "solid-js/web";
import type { ResultAsync } from "neverthrow";
import { App, postJsonResult, requestJsonResult, type AppBackendClient, type AppError } from "@cs-inv-edit/app";
import type { ConnectionStatus, HealthStatus, InventorySnapshot, OperationEvent, OperationReceipt, SettingsData } from "@cs-inv-edit/contracts";
import "@cs-inv-edit/app/styles.css";

const backendBase = "http://127.0.0.1:7331";

function toPromise<T>(result: ResultAsync<T, AppError>): Promise<T> {
  return result.match(
    (value) => value,
    (error) => {
      console.error(error.message, error.cause);
      throw error;
    },
  );
}

function createRequestResult<T>(path: string, init?: RequestInit) {
  return requestJsonResult<T>(backendBase, path, init);
}

function createPostResult<T>(path: string, input?: unknown) {
  return postJsonResult<T>(backendBase, path, input);
}

const backend: AppBackendClient = {
  health: () => toPromise(createRequestResult<HealthStatus>("/health")),
  inventory: () => toPromise(createRequestResult<InventorySnapshot>("/inventory")),
  refreshInventory: () => toPromise(createRequestResult<OperationReceipt>("/inventory/refresh", { method: "POST" })),
  submitOperation: (type, input) => toPromise(createPostResult<OperationReceipt>(`/operations/${encodeURIComponent(type)}`, input)),
  operations: () => toPromise(createRequestResult<OperationReceipt[]>("/operations")),
  events: () => toPromise(createRequestResult<OperationEvent[]>("/events")),
  settings: () => toPromise(createRequestResult<SettingsData>("/settings")),
  steamStatus: () => toPromise(createRequestResult<ConnectionStatus>("/steam/status")),
  connectSteam: (input) => toPromise(createPostResult<ConnectionStatus>("/steam/connect", input)),
  submitSteamGuard: (input) => toPromise(createPostResult<ConnectionStatus>("/steam/guard", input)),
  disconnectSteam: () => toPromise(createRequestResult<ConnectionStatus>("/steam/disconnect", { method: "POST" })),
  applyNameTag: (input) => toPromise(createPostResult<OperationReceipt>("/nametags/apply", input)),
  removeNameTag: (input) => toPromise(createPostResult<OperationReceipt>("/nametags/remove", input)),
  deleteItem: (input) => toPromise(createPostResult<OperationReceipt>("/items/delete", input)),
  applyStatTrakSwap: (input) => toPromise(createPostResult<OperationReceipt>("/stattrak/swap", input)),
  applyStrangePart: (input) => toPromise(createPostResult<OperationReceipt>("/strange-parts/apply", input)),
  useItem: (input) => toPromise(createPostResult<OperationReceipt>("/items/use", input)),
  useMultipleItems: (input) => toPromise(createPostResult<OperationReceipt>("/items/use-multiple", input)),
  applyToolToItem: (input) => toPromise(createPostResult<OperationReceipt>("/tools/apply", input)),
  applyToolToBaseItem: (input) => toPromise(createPostResult<OperationReceipt>("/tools/apply-base", input)),
  giftItem: (input) => toPromise(createPostResult<OperationReceipt>("/gifts/send", input)),
};

render(() => <App backend={backend} platform="web" />, document.getElementById("root")!);
