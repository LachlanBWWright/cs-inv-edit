import { render } from "solid-js/web";
import { App, postJsonResult, requestJsonResult, type AppBackendClient, type AppError, type SafeParseSchema } from "@cs-inv-edit/app";
import type { ArmorySnapshot, ConnectionStatus, HealthStatus, InventorySnapshot, OperationEvent, OperationReceipt, SettingsData } from "@cs-inv-edit/contracts";
import { backendSchemas } from "@cs-inv-edit/contracts";
import "@cs-inv-edit/app/styles.css";
import { createWasmBackendClient } from "./wasmBackend.js";

const backendBase = "http://127.0.0.1:7331";
const backendMode = new URLSearchParams(window.location.search).get("backend");

function createRequestResult<T>(path: string, schema: SafeParseSchema<T>, init?: RequestInit) {
  return requestJsonResult<T>(backendBase, path, schema, init);
}

function createPostResult<T>(path: string, schema: SafeParseSchema<T>, input?: unknown) {
  return postJsonResult<T>(backendBase, path, schema, input);
}

function createHttpBackendClient(): AppBackendClient {
  return {
    health: () => createRequestResult<HealthStatus>("/health", backendSchemas.health),
    inventory: () => createRequestResult<InventorySnapshot>("/inventory", backendSchemas.inventory),
    refreshInventory: () => createRequestResult<OperationReceipt>("/inventory/refresh", backendSchemas.receipt, { method: "POST" }),
    armory: () => createRequestResult<ArmorySnapshot>("/armory", backendSchemas.armory),
    refreshArmory: () => createRequestResult<OperationReceipt>("/armory/refresh", backendSchemas.receipt, { method: "POST" }),
    redeemArmory: (input) => createPostResult<OperationReceipt>("/armory/redeem", backendSchemas.receipt, input),
    submitOperation: (type, input) => createPostResult<OperationReceipt>(`/operations/${encodeURIComponent(type)}`, backendSchemas.receipt, input),
    operations: () => createRequestResult<OperationReceipt[]>("/operations", backendSchemas.receipts),
    events: () => createRequestResult<OperationEvent[]>("/events", backendSchemas.events),
    settings: () => createRequestResult<SettingsData>("/settings", backendSchemas.settings),
    steamStatus: () => createRequestResult<ConnectionStatus>("/steam/status", backendSchemas.connection),
    connectSteam: (input) => createPostResult<ConnectionStatus>("/steam/connect", backendSchemas.connection, input),
    submitSteamGuard: (input) => createPostResult<ConnectionStatus>("/steam/guard", backendSchemas.connection, input),
    disconnectSteam: () => createRequestResult<ConnectionStatus>("/steam/disconnect", backendSchemas.connection, { method: "POST" }),
    applyNameTag: (input) => createPostResult<OperationReceipt>("/nametags/apply", backendSchemas.receipt, input),
    removeNameTag: (input) => createPostResult<OperationReceipt>("/nametags/remove", backendSchemas.receipt, input),
    deleteItem: (input) => createPostResult<OperationReceipt>("/items/delete", backendSchemas.receipt, input),
    applyStatTrakSwap: (input) => createPostResult<OperationReceipt>("/stattrak/swap", backendSchemas.receipt, input),
    applyStrangePart: (input) => createPostResult<OperationReceipt>("/strange-parts/apply", backendSchemas.receipt, input),
    useItem: (input) => createPostResult<OperationReceipt>("/items/use", backendSchemas.receipt, input),
    useMultipleItems: (input) => createPostResult<OperationReceipt>("/items/use-multiple", backendSchemas.receipt, input),
    applyToolToItem: (input) => createPostResult<OperationReceipt>("/tools/apply", backendSchemas.receipt, input),
    applyToolToBaseItem: (input) => createPostResult<OperationReceipt>("/tools/apply-base", backendSchemas.receipt, input),
    giftItem: (input) => createPostResult<OperationReceipt>("/gifts/send", backendSchemas.receipt, input),
  };
}

const backend = backendMode === "wasm" ? createWasmBackendClient() : createHttpBackendClient();

render(() => <App backend={backend} platform="web" />, document.getElementById("root")!);
