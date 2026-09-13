import { ipcMain } from "electron";
import { Result } from "neverthrow";
import {
  requestJsonResult,
  type SafeParseSchema,
} from "@cs-inv-edit/app";
import {
  backendInputSchemas,
  backendSchemas,
  economyGameSchema,
  localAgentPaths,
  steamInventoryServiceAppIdSchema,
} from "@cs-inv-edit/contracts";
import { serializeResult, type IpcResult } from "./ipc-result.js";
import { registerBackendMutationIpcHandlers } from "./backend-mutation-ipc-handlers.js";
import { registerBackendTailIpcHandlers } from "./backend-tail-ipc-handlers.js";

let backendUrl = "http://127.0.0.1:7331";
let backendAuthToken = "";

export function configureBackendConnection(url: string, authToken: string) {
  backendUrl = url;
  backendAuthToken = authToken;
}

function authenticatedInit(init?: RequestInit): RequestInit | undefined {
  if (!backendAuthToken) return init;
  return {
    ...init,
    headers: {
      ...(init?.headers ?? {}),
      Authorization: `Bearer ${backendAuthToken}`,
    },
  };
}

async function requestJson<T>(
  pathName: string,
  schema: SafeParseSchema<T>,
  init?: RequestInit,
): Promise<IpcResult<T>> {
  return serializeResult(
    requestJsonResult<T>(
      backendUrl,
      pathName,
      schema,
      authenticatedInit(init),
    ),
  );
}

function postJson<T>(
  pathName: string,
  schema: SafeParseSchema<T>,
  input?: unknown,
): Promise<IpcResult<T>> {
  const body = Result.fromThrowable(
    () => JSON.stringify(input ?? {}),
    (cause) => ({ message: "Could not serialize IPC request body", cause }),
  )();
  return body.match(
    (serializedBody) =>
      serializeResult(
        requestJsonResult<T>(
          backendUrl,
          pathName,
          schema,
          authenticatedInit({
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: serializedBody,
          }),
        ),
      ),
    (error) => Promise.resolve({ ok: false, error }),
  );
}

function invalidInput(message: string, cause: unknown): IpcResult<never> {
  return { ok: false, error: { message, cause } };
}

function parseInput<T>(
  schema: SafeParseSchema<T>,
  input: unknown,
  message: string,
): IpcResult<T> {
  const parsed = schema.safeParse(input);
  return parsed.success
    ? { ok: true, value: parsed.data }
    : invalidInput(message, { issues: parsed.error });
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
            cause: { issues: parsed.error.issues },
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
              cause: { issues: parsed.error.issues },
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
              cause: { issues: parsed.error.issues },
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
              cause: { issues: parsed.error.issues },
            },
          };
    },
  );
  ipcMain.handle("backend:armory", async () =>
    requestJson(localAgentPaths.armory, backendSchemas.armory),
  );
  ipcMain.handle("backend:marketPreview", async (_event, marketName: unknown) => {
    const parsed = parseInput(
      backendInputSchemas.textId,
      marketName,
      "Invalid market name IPC argument",
    );
    return parsed.ok
      ? requestJson(
          localAgentPaths.marketPreview(parsed.value),
          backendSchemas.marketPreview,
        )
      : parsed;
  });
  ipcMain.handle("backend:refreshArmory", async () =>
    requestJson(localAgentPaths.refreshArmory, backendSchemas.receipt, {
      method: "POST",
    }),
  );
  ipcMain.handle("backend:redeemArmory", async (_event, input?: unknown) => {
    const parsed = parseInput(
      backendInputSchemas.armoryRedeem,
      input,
      "Invalid armory redemption IPC argument",
    );
    return parsed.ok
      ? postJson(localAgentPaths.redeemArmory, backendSchemas.receipt, parsed.value)
      : parsed;
  });
  ipcMain.handle("backend:store", async () =>
    requestJson(localAgentPaths.store, backendSchemas.store),
  );
  ipcMain.handle("backend:refreshStore", async () =>
    requestJson(localAgentPaths.refreshStore, backendSchemas.receipt, {
      method: "POST",
    }),
  );
  ipcMain.handle("backend:tf2Store", async () =>
    requestJson(localAgentPaths.tf2Store, backendSchemas.store),
  );
  ipcMain.handle("backend:refreshTF2Store", async () =>
    requestJson(localAgentPaths.refreshTf2Store, backendSchemas.receipt, {
      method: "POST",
    }),
  );
  ipcMain.handle(
    "backend:initializeTF2StorePurchase",
    async (_event, input?: unknown) => {
      const parsed = backendSchemas.initializeStorePurchase.safeParse(input);
      return parsed.success
        ? postJson(
            localAgentPaths.initializeTf2StorePurchase,
            backendSchemas.purchaseSession,
            parsed.data,
          )
        : {
            ok: false as const,
            error: {
              message: "Invalid TF2 store purchase IPC argument",
              cause: { issues: parsed.error.issues },
            },
          };
    },
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
    async (_event, steamId?: unknown) => {
      const parsed = parseInput(
        backendInputSchemas.optionalTextId,
        steamId,
        "Invalid Steam ID IPC argument",
      );
      return parsed.ok
        ? requestJson(
            localAgentPaths.refreshTradeAccounts(parsed.value),
            backendSchemas.tradeAccounts,
            { method: "POST" },
          )
        : parsed;
    },
  );
  ipcMain.handle("backend:createTradeOffer", async (_event, input: unknown) => {
    const parsed = parseInput(
      backendInputSchemas.createTradeOffer,
      input,
      "Invalid create-trade-offer IPC argument",
    );
    return parsed.ok
      ? postJson(
          localAgentPaths.createTradeOffer,
          backendSchemas.tradeMutation,
          parsed.value,
        )
      : parsed;
  });
  ipcMain.handle("backend:acceptTradeOffer", async (_event, id: unknown) => {
    const parsed = parseInput(
      backendInputSchemas.textId,
      id,
      "Invalid trade-offer ID IPC argument",
    );
    return parsed.ok
      ? postJson(
          localAgentPaths.acceptTradeOffer(parsed.value),
          backendSchemas.tradeMutation,
          {},
        )
      : parsed;
  });
  ipcMain.handle(
    "backend:counterTradeOffer",
    async (_event, id: unknown, input: unknown) => {
      const parsedId = parseInput(
        backendInputSchemas.textId,
        id,
        "Invalid trade-offer ID IPC argument",
      );
      const parsedInput = parseInput(
        backendInputSchemas.createTradeOffer,
        input,
        "Invalid counter-trade IPC argument",
      );
      return parsedId.ok && parsedInput.ok
        ? postJson(
            localAgentPaths.counterTradeOffer(parsedId.value),
            backendSchemas.tradeMutation,
            parsedInput.value,
          )
        : parsedId.ok
          ? parsedInput
          : parsedId;
    },
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
              cause: { issues: parsed.error.issues },
            },
          };
    },
  );
  ipcMain.handle("backend:storePurchase", async (_event, id: unknown) => {
    const parsed = parseInput(
      backendInputSchemas.textId,
      id,
      "Invalid store purchase ID IPC argument",
    );
    return parsed.ok
      ? requestJson(
          localAgentPaths.storePurchase(parsed.value),
          backendSchemas.purchaseSession,
        )
      : parsed;
  });
  ipcMain.handle(
    "backend:reconcileStorePurchase",
    async (_event, id: unknown) => {
      const parsed = parseInput(
        backendInputSchemas.textId,
        id,
        "Invalid store purchase ID IPC argument",
      );
      return parsed.ok
        ? requestJson(
            localAgentPaths.reconcileStorePurchase(parsed.value),
            backendSchemas.purchaseSession,
            { method: "POST" },
          )
        : parsed;
    },
  );
  registerBackendTailIpcHandlers(
    (pathName, schema, init) => requestJson(pathName, schema, init),
    (pathName, schema, input) => postJson(pathName, schema, input),
    (schema, input, message) => parseInput(schema, input, message),
  );
  registerBackendMutationIpcHandlers((pathName, input) =>
    postJson(pathName, backendSchemas.receipt, input),
  );
}
