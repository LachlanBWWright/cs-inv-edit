import { render } from "solid-js/web";
import { fromThrowable } from "neverthrow";
import {
  App,
  createSharedDataClient,
  postJsonResult,
  requestJsonResult,
  watchSteamStatusWithRecovery,
  type LocalAgentClient,
  type SafeParseSchema,
} from "@cs-inv-edit/app";
import type {
  ArmorySnapshot,
  ConnectionStatus,
  GameInventorySnapshot,
  HealthStatus,
  InventorySnapshot,
  OperationEvent,
  OperationReceipt,
  ProtocolTraceEntry,
  PurchaseSession,
  SettingsData,
  SteamAccountTradesCollection,
  SteamTradesSnapshot,
  StoreSnapshot,
  TF2FeatureSnapshot,
  CS2FeatureSnapshot,
} from "@cs-inv-edit/contracts";
import { backendSchemas, localAgentPaths } from "@cs-inv-edit/contracts";
import "@cs-inv-edit/app/styles.css";
import { createWasmBackendClient } from "./wasm-backend.js";

const backendBase = "http://127.0.0.1:7331";
const backendMode = new URLSearchParams(window.location.search).get("backend");
const dataServiceUrl =
  (import.meta as ImportMeta & { env?: { VITE_DATA_SERVICE_URL?: string } }).env
    ?.VITE_DATA_SERVICE_URL ?? "http://127.0.0.1:7332";

function createRequestResult<T>(
  path: string,
  schema: SafeParseSchema<T>,
  init?: RequestInit,
) {
  return requestJsonResult<T>(backendBase, path, schema, init);
}

function createPostResult<T>(
  path: string,
  schema: SafeParseSchema<T>,
  input?: unknown,
) {
  return postJsonResult<T>(backendBase, path, schema, input);
}

function createHttpBackendClient(): LocalAgentClient {
  return {
    health: () =>
      createRequestResult<HealthStatus>(
        localAgentPaths.health,
        backendSchemas.health,
      ),
    inventory: () =>
      createRequestResult<InventorySnapshot>(
        localAgentPaths.inventory,
        backendSchemas.inventory,
      ),
    refreshInventory: () =>
      createRequestResult<OperationReceipt>(
        localAgentPaths.refreshInventory,
        backendSchemas.receipt,
        { method: "POST" },
      ),
    gameInventory: (game) =>
      createRequestResult<GameInventorySnapshot>(
        localAgentPaths.gameInventory(game),
        backendSchemas.gameInventory,
      ),
    refreshGameInventory: (game) =>
      createRequestResult<OperationReceipt>(
        localAgentPaths.refreshGameInventory(game),
        backendSchemas.receipt,
        { method: "POST" },
      ),
    tf2Features: () =>
      createRequestResult<TF2FeatureSnapshot>(
        localAgentPaths.tf2Features,
        backendSchemas.tf2Features,
      ),
    cs2Features: () =>
      createRequestResult<CS2FeatureSnapshot>(
        localAgentPaths.cs2Features,
        backendSchemas.cs2Features,
      ),
    steamInventoryService: (appId) =>
      createRequestResult<GameInventorySnapshot>(
        localAgentPaths.steamInventoryService(appId),
        backendSchemas.gameInventory,
      ),
    steamInventoryServiceGames: () =>
      createRequestResult(
        localAgentPaths.steamInventoryServiceGames,
        backendSchemas.steamInventoryServiceGames,
      ),
    refreshSteamInventoryService: (appId) =>
      createRequestResult<OperationReceipt>(
        localAgentPaths.refreshSteamInventoryService(appId),
        backendSchemas.receipt,
        { method: "POST" },
      ),
    armory: () =>
      createRequestResult<ArmorySnapshot>(
        localAgentPaths.armory,
        backendSchemas.armory,
      ),
    marketPreview: (marketName) =>
      createRequestResult(
        localAgentPaths.marketPreview(marketName),
        backendSchemas.marketPreview,
      ),
    refreshArmory: () =>
      createRequestResult<OperationReceipt>(
        localAgentPaths.refreshArmory,
        backendSchemas.receipt,
        { method: "POST" },
      ),
    redeemArmory: (input) =>
      createPostResult<OperationReceipt>(
        localAgentPaths.redeemArmory,
        backendSchemas.receipt,
        input,
      ),
    store: () =>
      createRequestResult<StoreSnapshot>(
        localAgentPaths.store,
        backendSchemas.store,
      ),
    refreshStore: () =>
      createRequestResult<OperationReceipt>(
        localAgentPaths.refreshStore,
        backendSchemas.receipt,
        { method: "POST" },
      ),
    tf2Store: () =>
      createRequestResult<StoreSnapshot>(
        localAgentPaths.tf2Store,
        backendSchemas.store,
      ),
    refreshTF2Store: () =>
      createRequestResult<OperationReceipt>(
        localAgentPaths.refreshTf2Store,
        backendSchemas.receipt,
        { method: "POST" },
      ),
    initializeTF2StorePurchase: (input) =>
      createPostResult<PurchaseSession>(
        localAgentPaths.initializeTf2StorePurchase,
        backendSchemas.purchaseSession,
        input,
      ),
    trades: () =>
      createRequestResult<SteamTradesSnapshot>(
        localAgentPaths.trades,
        backendSchemas.trades,
      ),
    refreshTrades: () =>
      createRequestResult<SteamTradesSnapshot>(
        localAgentPaths.refreshTrades,
        backendSchemas.trades,
        { method: "POST" },
      ),
    tradeAccounts: () =>
      createRequestResult<SteamAccountTradesCollection>(
        localAgentPaths.tradeAccounts,
        backendSchemas.tradeAccounts,
      ),
    refreshTradeAccounts: (steamId) =>
      createRequestResult<SteamAccountTradesCollection>(
        localAgentPaths.refreshTradeAccounts(steamId),
        backendSchemas.tradeAccounts,
        { method: "POST" },
      ),
    createTradeOffer: (input) =>
      createPostResult(
        localAgentPaths.createTradeOffer,
        backendSchemas.tradeMutation,
        input,
      ),
    acceptTradeOffer: (id) =>
      createPostResult(
        localAgentPaths.acceptTradeOffer(id),
        backendSchemas.tradeMutation,
        {},
      ),
    counterTradeOffer: (id, input) =>
      createPostResult(
        localAgentPaths.counterTradeOffer(id),
        backendSchemas.tradeMutation,
        input,
      ),
    initializeStorePurchase: (input) =>
      createPostResult<PurchaseSession>(
        localAgentPaths.initializeStorePurchase,
        backendSchemas.purchaseSession,
        input,
      ),
    storePurchase: (id) =>
      createRequestResult<PurchaseSession>(
        localAgentPaths.storePurchase(id),
        backendSchemas.purchaseSession,
      ),
    reconcileStorePurchase: (id) =>
      createRequestResult<PurchaseSession>(
        localAgentPaths.reconcileStorePurchase(id),
        backendSchemas.purchaseSession,
        { method: "POST" },
      ),
    submitOperation: (type, input) =>
      createPostResult<OperationReceipt>(
        localAgentPaths.submitOperation(type),
        backendSchemas.receipt,
        input,
      ),
    operations: () =>
      createRequestResult<OperationReceipt[]>(
        localAgentPaths.operations,
        backendSchemas.receipts,
      ),
    events: () =>
      createRequestResult<OperationEvent[]>(
        localAgentPaths.events,
        backendSchemas.events,
      ),
    protocolTrace: (after) =>
      createRequestResult<ProtocolTraceEntry[]>(
        localAgentPaths.protocolTrace(after),
        backendSchemas.protocolTrace,
      ),
    settings: () =>
      createRequestResult<SettingsData>(
        localAgentPaths.settings,
        backendSchemas.settings,
      ),
    steamStatus: () =>
      createRequestResult<ConnectionStatus>(
        localAgentPaths.steamStatus,
        backendSchemas.connection,
      ),
    connectSteam: (input) =>
      createPostResult<ConnectionStatus>(
        localAgentPaths.connectSteam,
        backendSchemas.connection,
        input,
      ),
    startSteamQR: () =>
      createPostResult<ConnectionStatus>(
        localAgentPaths.startSteamQr,
        backendSchemas.connection,
        {},
      ),
    watchSteamStatus: (listener) => {
      const parse = fromThrowable(JSON.parse, (cause) => cause);
      return watchSteamStatusWithRecovery({
        socketUrl: `ws://127.0.0.1:7331${localAgentPaths.steamStatusWebSocket}`,
        readStatus: () =>
          createRequestResult<ConnectionStatus>(
            localAgentPaths.steamStatus,
            backendSchemas.connection,
          ),
        listener,
        parseMessage: (message) =>
          parse(message)
            .map((value) => backendSchemas.connection.safeParse(value))
            .match(
              (result) => (result.success ? result.data : undefined),
              () => undefined,
            ),
      });
    },
    submitSteamGuard: (input) =>
      createPostResult<ConnectionStatus>(
        localAgentPaths.submitSteamGuard,
        backendSchemas.connection,
        input,
      ),
    disconnectSteam: () =>
      createRequestResult<ConnectionStatus>(
        localAgentPaths.disconnectSteam,
        backendSchemas.connection,
        { method: "POST" },
      ),
    applyNameTag: (input) =>
      createPostResult<OperationReceipt>(
        localAgentPaths.applyNameTag,
        backendSchemas.receipt,
        input,
      ),
    removeNameTag: (input) =>
      createPostResult<OperationReceipt>(
        localAgentPaths.removeNameTag,
        backendSchemas.receipt,
        input,
      ),
    deleteItem: (input) =>
      createPostResult<OperationReceipt>(
        localAgentPaths.deleteItem,
        backendSchemas.receipt,
        input,
      ),
    applyStatTrakSwap: (input) =>
      createPostResult<OperationReceipt>(
        localAgentPaths.applyStatTrakSwap,
        backendSchemas.receipt,
        input,
      ),
    applyStrangePart: (input) =>
      createPostResult<OperationReceipt>(
        localAgentPaths.applyStrangePart,
        backendSchemas.receipt,
        input,
      ),
    useItem: (input) =>
      createPostResult<OperationReceipt>(
        localAgentPaths.useItem,
        backendSchemas.receipt,
        input,
      ),
    useMultipleItems: (input) =>
      createPostResult<OperationReceipt>(
        localAgentPaths.useMultipleItems,
        backendSchemas.receipt,
        input,
      ),
    applyToolToItem: (input) =>
      createPostResult<OperationReceipt>(
        localAgentPaths.applyToolToItem,
        backendSchemas.receipt,
        input,
      ),
    applyToolToBaseItem: (input) =>
      createPostResult<OperationReceipt>(
        localAgentPaths.applyToolToBaseItem,
        backendSchemas.receipt,
        input,
      ),
    giftItem: (input) =>
      createPostResult<OperationReceipt>(
        localAgentPaths.sendGift,
        backendSchemas.receipt,
        input,
      ),
  };
}

const backend =
  backendMode === "wasm"
    ? createWasmBackendClient()
    : createHttpBackendClient();
const data = createSharedDataClient(dataServiceUrl);

render(
  () => <App backend={backend} data={data} platform="web" />,
  document.getElementById("root")!,
);
