import { ipcMain } from "electron";
import {
  postJsonResult,
  requestJsonResult,
  type SafeParseSchema,
} from "@cs-inv-edit/app";
import {
  backendSchemas,
  economyGameSchema,
  localAgentPaths,
  steamInventoryServiceAppIdSchema,
} from "@cs-inv-edit/contracts";
import { serializeResult, type IpcResult } from "./ipc-result.js";

export const backendUrl = "http://127.0.0.1:7331";

async function requestJson<T>(
  pathName: string,
  schema: SafeParseSchema<T>,
  init?: RequestInit,
): Promise<IpcResult<T>> {
  return serializeResult(
    requestJsonResult<T>(backendUrl, pathName, schema, init),
  );
}

function postJson<T>(
  pathName: string,
  schema: SafeParseSchema<T>,
  input?: unknown,
): Promise<IpcResult<T>> {
  return serializeResult(
    postJsonResult<T>(backendUrl, pathName, schema, input),
  );
}

function registerReceiptMutation(channel: string, pathName: string) {
  ipcMain.handle(channel, (_event, input?: unknown) =>
    postJson(pathName, backendSchemas.receipt, input),
  );
}

export function registerBackendIpcHandlers() {
  ipcMain.handle("backend:health", async () =>
    requestJson(localAgentPaths.health, backendSchemas.health),
  );
  ipcMain.handle("backend:inventory", async () =>
    requestJson(localAgentPaths.inventory, backendSchemas.inventory),
  );
  ipcMain.handle("backend:refreshInventory", async () =>
    requestJson(localAgentPaths.refreshInventory, backendSchemas.receipt, {
      method: "POST",
    }),
  );
  ipcMain.handle("backend:gameInventory", async (_event, game: unknown) => {
    const parsed = economyGameSchema.safeParse(game);
    return parsed.success
      ? requestJson(
          localAgentPaths.gameInventory(parsed.data),
          backendSchemas.gameInventory,
        )
      : {
          ok: false as const,
          error: {
            message: "Invalid economy game IPC argument",
            cause: parsed.error,
          },
        };
  });
  ipcMain.handle("backend:tf2Features", async () =>
    requestJson(localAgentPaths.tf2Features, backendSchemas.tf2Features),
  );
  ipcMain.handle("backend:cs2Features", async () =>
    requestJson(localAgentPaths.cs2Features, backendSchemas.cs2Features),
  );
  ipcMain.handle(
    "backend:refreshGameInventory",
    async (_event, game: unknown) => {
      const parsed = economyGameSchema.safeParse(game);
      return parsed.success
        ? requestJson(
            localAgentPaths.refreshGameInventory(parsed.data),
            backendSchemas.receipt,
            { method: "POST" },
          )
        : {
            ok: false as const,
            error: {
              message: "Invalid economy game IPC argument",
              cause: parsed.error,
            },
          };
    },
  );
  ipcMain.handle(
    "backend:steamInventoryService",
    async (_event, appId: unknown) => {
      const parsed = steamInventoryServiceAppIdSchema.safeParse(appId);
      return parsed.success
        ? requestJson(
            localAgentPaths.steamInventoryService(parsed.data),
            backendSchemas.gameInventory,
          )
        : {
            ok: false as const,
            error: {
              message: "Invalid Steam Inventory Service AppID",
              cause: parsed.error,
            },
          };
    },
  );
  ipcMain.handle("backend:steamInventoryServiceGames", () =>
    requestJson(
      localAgentPaths.steamInventoryServiceGames,
      backendSchemas.steamInventoryServiceGames,
    ),
  );
  ipcMain.handle(
    "backend:refreshSteamInventoryService",
    async (_event, appId: unknown) => {
      const parsed = steamInventoryServiceAppIdSchema.safeParse(appId);
      return parsed.success
        ? requestJson(
            localAgentPaths.refreshSteamInventoryService(parsed.data),
            backendSchemas.receipt,
            { method: "POST" },
          )
        : {
            ok: false as const,
            error: {
              message: "Invalid Steam Inventory Service AppID",
              cause: parsed.error,
            },
          };
    },
  );
  ipcMain.handle("backend:armory", async () =>
    requestJson(localAgentPaths.armory, backendSchemas.armory),
  );
  ipcMain.handle("backend:marketPreview", async (_event, marketName: string) =>
    requestJson(
      localAgentPaths.marketPreview(marketName),
      backendSchemas.marketPreview,
    ),
  );
  ipcMain.handle("backend:refreshArmory", async () =>
    requestJson(localAgentPaths.refreshArmory, backendSchemas.receipt, {
      method: "POST",
    }),
  );
  ipcMain.handle("backend:redeemArmory", async (_event, input?: unknown) =>
    postJson(localAgentPaths.redeemArmory, backendSchemas.receipt, input),
  );
  ipcMain.handle("backend:store", async () =>
    requestJson(localAgentPaths.store, backendSchemas.store),
  );
  ipcMain.handle("backend:refreshStore", async () =>
    requestJson(localAgentPaths.refreshStore, backendSchemas.receipt, {
      method: "POST",
    }),
  );
  ipcMain.handle("backend:trades", async () =>
    requestJson(localAgentPaths.trades, backendSchemas.trades),
  );
  ipcMain.handle("backend:refreshTrades", async () =>
    requestJson(localAgentPaths.refreshTrades, backendSchemas.trades, {
      method: "POST",
    }),
  );
  ipcMain.handle("backend:tradeAccounts", async () =>
    requestJson(localAgentPaths.tradeAccounts, backendSchemas.tradeAccounts),
  );
  ipcMain.handle(
    "backend:refreshTradeAccounts",
    async (_event, steamId?: string) =>
      requestJson(
        localAgentPaths.refreshTradeAccounts(steamId),
        backendSchemas.tradeAccounts,
        { method: "POST" },
      ),
  );
  ipcMain.handle("backend:createTradeOffer", async (_event, input: unknown) =>
    postJson(
      localAgentPaths.createTradeOffer,
      backendSchemas.tradeMutation,
      input,
    ),
  );
  ipcMain.handle("backend:acceptTradeOffer", async (_event, id: string) =>
    postJson(
      localAgentPaths.acceptTradeOffer(id),
      backendSchemas.tradeMutation,
      {},
    ),
  );
  ipcMain.handle(
    "backend:counterTradeOffer",
    async (_event, id: string, input: unknown) =>
      postJson(
        localAgentPaths.counterTradeOffer(id),
        backendSchemas.tradeMutation,
        input,
      ),
  );
  ipcMain.handle(
    "backend:initializeStorePurchase",
    async (_event, input?: unknown) => {
      const parsed = backendSchemas.initializeStorePurchase.safeParse(input);
      return parsed.success
        ? postJson(
            localAgentPaths.initializeStorePurchase,
            backendSchemas.purchaseSession,
            parsed.data,
          )
        : {
            ok: false as const,
            error: {
              message: "Invalid store purchase IPC argument",
              cause: parsed.error,
            },
          };
    },
  );
  ipcMain.handle("backend:storePurchase", async (_event, id: string) =>
    requestJson(
      localAgentPaths.storePurchase(id),
      backendSchemas.purchaseSession,
    ),
  );
  ipcMain.handle("backend:reconcileStorePurchase", async (_event, id: string) =>
    requestJson(
      localAgentPaths.reconcileStorePurchase(id),
      backendSchemas.purchaseSession,
      { method: "POST" },
    ),
  );
  ipcMain.handle(
    "backend:submitOperation",
    async (_event, type: string, input?: unknown) =>
      requestJson(localAgentPaths.submitOperation(type), backendSchemas.receipt, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(input ?? {}),
      }),
  );
  ipcMain.handle("backend:operations", async () =>
    requestJson(localAgentPaths.operations, backendSchemas.receipts),
  );
  ipcMain.handle("backend:events", async () =>
    requestJson(localAgentPaths.events, backendSchemas.events),
  );
  ipcMain.handle("backend:protocolTrace", async (_event, after: number) =>
    requestJson(
      localAgentPaths.protocolTrace(after),
      backendSchemas.protocolTrace,
    ),
  );
  ipcMain.handle("backend:settings", async () =>
    requestJson(localAgentPaths.settings, backendSchemas.settings),
  );
  ipcMain.handle("backend:steamStatus", async () =>
    requestJson(localAgentPaths.steamStatus, backendSchemas.connection),
  );
  ipcMain.handle("backend:connectSteam", async (_event, input?: unknown) =>
    postJson(localAgentPaths.connectSteam, backendSchemas.connection, input),
  );
  ipcMain.handle("backend:startSteamQR", async () =>
    postJson(localAgentPaths.startSteamQr, backendSchemas.connection, {}),
  );
  ipcMain.handle("backend:submitSteamGuard", async (_event, input?: unknown) =>
    postJson(localAgentPaths.submitSteamGuard, backendSchemas.connection, input),
  );
  ipcMain.handle("backend:disconnectSteam", async () =>
    requestJson(localAgentPaths.disconnectSteam, backendSchemas.connection, {
      method: "POST",
    }),
  );
  const receiptMutations = {
    applyNameTag: localAgentPaths.applyNameTag,
    removeNameTag: localAgentPaths.removeNameTag,
    deleteItem: localAgentPaths.deleteItem,
    applyStatTrakSwap: localAgentPaths.applyStatTrakSwap,
    applyStrangePart: localAgentPaths.applyStrangePart,
    useItem: localAgentPaths.useItem,
    useMultipleItems: localAgentPaths.useMultipleItems,
    applyToolToItem: localAgentPaths.applyToolToItem,
    applyToolToBaseItem: localAgentPaths.applyToolToBaseItem,
    giftItem: localAgentPaths.sendGift,
  };
  for (const [operation, pathName] of Object.entries(receiptMutations)) {
    registerReceiptMutation(`backend:${operation}`, pathName);
  }
}
