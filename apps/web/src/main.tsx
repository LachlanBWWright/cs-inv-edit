import { render } from "solid-js/web";
import { App, postJsonResult, requestJsonResult, type AppBackendClient, type AppError } from "@cs-inv-edit/app";
import type { ArmorySnapshot, ConnectionStatus, HealthStatus, InventorySnapshot, OperationEvent, OperationReceipt, SettingsData } from "@cs-inv-edit/contracts";
import "@cs-inv-edit/app/styles.css";
import { createWasmBackendClient } from "./wasmBackend.js";

const backendBase = "http://127.0.0.1:7331";
const backendMode = new URLSearchParams(window.location.search).get("backend");

function createRequestResult<T>(path: string, init?: RequestInit) {
  return requestJsonResult<T>(backendBase, path, init);
}

function createPostResult<T>(path: string, input?: unknown) {
  return postJsonResult<T>(backendBase, path, input);
}

function createHttpBackendClient(): AppBackendClient {
  return {
    health: () => createRequestResult<HealthStatus>("/health"),
    inventory: () => createRequestResult<InventorySnapshot>("/inventory"),
    refreshInventory: () => createRequestResult<OperationReceipt>("/inventory/refresh", { method: "POST" }),
    armory: () => createRequestResult<ArmorySnapshot>("/armory"),
    refreshArmory: () => createRequestResult<OperationReceipt>("/armory/refresh", { method: "POST" }),
    redeemArmory: (input) => createPostResult<OperationReceipt>("/armory/redeem", input),
    submitOperation: (type, input) => createPostResult<OperationReceipt>(`/operations/${encodeURIComponent(type)}`, input),
    operations: () => createRequestResult<OperationReceipt[]>("/operations"),
    events: () => createRequestResult<OperationEvent[]>("/events"),
    settings: () => createRequestResult<SettingsData>("/settings"),
    steamStatus: () => createRequestResult<ConnectionStatus>("/steam/status"),
    connectSteam: (input) => createPostResult<ConnectionStatus>("/steam/connect", input),
    submitSteamGuard: (input) => createPostResult<ConnectionStatus>("/steam/guard", input),
    disconnectSteam: () => createRequestResult<ConnectionStatus>("/steam/disconnect", { method: "POST" }),
    applyNameTag: (input) => createPostResult<OperationReceipt>("/nametags/apply", input),
    removeNameTag: (input) => createPostResult<OperationReceipt>("/nametags/remove", input),
    deleteItem: (input) => createPostResult<OperationReceipt>("/items/delete", input),
    applyStatTrakSwap: (input) => createPostResult<OperationReceipt>("/stattrak/swap", input),
    applyStrangePart: (input) => createPostResult<OperationReceipt>("/strange-parts/apply", input),
    useItem: (input) => createPostResult<OperationReceipt>("/items/use", input),
    useMultipleItems: (input) => createPostResult<OperationReceipt>("/items/use-multiple", input),
    applyToolToItem: (input) => createPostResult<OperationReceipt>("/tools/apply", input),
    applyToolToBaseItem: (input) => createPostResult<OperationReceipt>("/tools/apply-base", input),
    giftItem: (input) => createPostResult<OperationReceipt>("/gifts/send", input),
  };
}

const backend = backendMode === "wasm" ? createWasmBackendClient() : createHttpBackendClient();

render(() => <App backend={backend} platform="web" />, document.getElementById("root")!);
