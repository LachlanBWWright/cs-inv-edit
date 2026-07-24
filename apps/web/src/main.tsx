import { render } from "solid-js/web";
import { fromThrowable } from "neverthrow";
import { App, createSharedDataClient, postJsonResult, requestJsonResult, type LocalAgentClient, type SafeParseSchema } from "@cs-inv-edit/app";
import type { ArmorySnapshot, ConnectionStatus, GameInventorySnapshot, HealthStatus, InventorySnapshot, OperationEvent, OperationReceipt, ProtocolTraceEntry, PurchaseSession, SettingsData, SteamAccountTradesCollection, SteamTradesSnapshot, StoreSnapshot } from "@cs-inv-edit/contracts";
import { backendSchemas } from "@cs-inv-edit/contracts";
import "@cs-inv-edit/app/styles.css";
import { createWasmBackendClient } from "./wasmBackend.js";

const backendBase = "http://127.0.0.1:7331";
const backendMode = new URLSearchParams(window.location.search).get("backend");
const dataServiceUrl = (import.meta as ImportMeta & { env?: { VITE_DATA_SERVICE_URL?: string } }).env?.VITE_DATA_SERVICE_URL ?? "http://127.0.0.1:7332";

function createRequestResult<T>(path: string, schema: SafeParseSchema<T>, init?: RequestInit) {
  return requestJsonResult<T>(backendBase, path, schema, init);
}

function createPostResult<T>(path: string, schema: SafeParseSchema<T>, input?: unknown) {
  return postJsonResult<T>(backendBase, path, schema, input);
}

function createHttpBackendClient(): LocalAgentClient {
  return {
    health: () => createRequestResult<HealthStatus>("/health", backendSchemas.health),
    inventory: () => createRequestResult<InventorySnapshot>("/inventory", backendSchemas.inventory),
    refreshInventory: () => createRequestResult<OperationReceipt>("/inventory/refresh", backendSchemas.receipt, { method: "POST" }),
    gameInventory: (game) => createRequestResult<GameInventorySnapshot>(`/games/${game}/inventory`, backendSchemas.gameInventory),
    refreshGameInventory: (game) => createRequestResult<OperationReceipt>(`/games/${game}/inventory/refresh`, backendSchemas.receipt, { method: "POST" }),
    armory: () => createRequestResult<ArmorySnapshot>("/armory", backendSchemas.armory),
    marketPreview: (marketName) => createRequestResult(`/market/preview?marketName=${encodeURIComponent(marketName)}`, backendSchemas.marketPreview),
    refreshArmory: () => createRequestResult<OperationReceipt>("/armory/refresh", backendSchemas.receipt, { method: "POST" }),
    redeemArmory: (input) => createPostResult<OperationReceipt>("/armory/redeem", backendSchemas.receipt, input),
    store: () => createRequestResult<StoreSnapshot>("/store", backendSchemas.store),
    refreshStore: () => createRequestResult<OperationReceipt>("/store/refresh", backendSchemas.receipt, { method: "POST" }),
    trades: () => createRequestResult<SteamTradesSnapshot>("/trades", backendSchemas.trades),
    refreshTrades: () => createRequestResult<SteamTradesSnapshot>("/trades/refresh", backendSchemas.trades, { method: "POST" }),
    tradeAccounts: () => createRequestResult<SteamAccountTradesCollection>("/trade-accounts", backendSchemas.tradeAccounts),
    refreshTradeAccounts: (steamId) => createRequestResult<SteamAccountTradesCollection>(`/trade-accounts${steamId ? `?steamId=${encodeURIComponent(steamId)}` : ""}`, backendSchemas.tradeAccounts, { method: "POST" }),
    createTradeOffer: (input) => createPostResult("/trades/offers", backendSchemas.tradeMutation, input),
    acceptTradeOffer: (id) => createPostResult(`/trades/offers/${encodeURIComponent(id)}/accept`, backendSchemas.tradeMutation, {}),
    counterTradeOffer: (id, input) => createPostResult(`/trades/offers/${encodeURIComponent(id)}/counter`, backendSchemas.tradeMutation, input),
    initializeStorePurchase: (input) => createPostResult<PurchaseSession>("/store/purchases", backendSchemas.purchaseSession, input),
    storePurchase: (id) => createRequestResult<PurchaseSession>(`/store/purchases/${encodeURIComponent(id)}`, backendSchemas.purchaseSession),
    reconcileStorePurchase: (id) => createRequestResult<PurchaseSession>(`/store/purchases/${encodeURIComponent(id)}/reconcile`, backendSchemas.purchaseSession, { method: "POST" }),
    submitOperation: (type, input) => createPostResult<OperationReceipt>(`/operations/${encodeURIComponent(type)}`, backendSchemas.receipt, input),
    operations: () => createRequestResult<OperationReceipt[]>("/operations", backendSchemas.receipts),
    events: () => createRequestResult<OperationEvent[]>("/events", backendSchemas.events),
    protocolTrace: (after) => createRequestResult<ProtocolTraceEntry[]>(`/protocol-trace?after=${after}`, backendSchemas.protocolTrace),
    settings: () => createRequestResult<SettingsData>("/settings", backendSchemas.settings),
    steamStatus: () => createRequestResult<ConnectionStatus>("/steam/status", backendSchemas.connection),
    connectSteam: (input) => createPostResult<ConnectionStatus>("/steam/connect", backendSchemas.connection, input),
    startSteamQR: () => createPostResult<ConnectionStatus>("/steam/qr", backendSchemas.connection, {}),
    watchSteamStatus: (listener) => {
      const socket = new WebSocket("ws://127.0.0.1:7331/steam/status/ws");
      const parse = fromThrowable(JSON.parse, (cause) => cause);
      socket.onmessage = (event) => parse(String(event.data)).map((value) => backendSchemas.connection.safeParse(value)).map((result) => {
        if (result.success) listener(result.data);
      });
      return () => socket.close();
    },
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
const data = createSharedDataClient(dataServiceUrl);

render(() => <App backend={backend} data={data} platform="web" />, document.getElementById("root")!);
