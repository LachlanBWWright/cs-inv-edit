import { contextBridge, ipcRenderer } from "electron";
import { ResultAsync, err, ok, fromThrowable } from "neverthrow";
import type { AppError } from "@cs-inv-edit/app";
import { backendSchemas } from "@cs-inv-edit/contracts";
import type { SafeParseSchema } from "@cs-inv-edit/app";
import { watchSteamStatusWithRecovery } from "@cs-inv-edit/app";

type IpcResult<T> = { ok: true; value: T } | { ok: false; error: AppError };

const invokeResult = <T>(
  schema: SafeParseSchema<T>,
  channel: string,
  ...args: unknown[]
) =>
  ResultAsync.fromPromise(
    ipcRenderer.invoke(channel, ...args) as Promise<unknown>,
    (cause) => ({ message: `Electron IPC failed for ${channel}`, cause }),
  ).andThen((payload) => {
    if (!payload || typeof payload !== "object" || !("ok" in payload))
      return err({
        message: `Invalid Electron IPC envelope for ${channel}`,
        cause: payload,
      });
    const result = payload as IpcResult<unknown>;
    if (!result.ok) return err(result.error);
    const parsed = schema.safeParse(result.value);
    return parsed.success
      ? ok(parsed.data)
      : err({
          message: `Invalid Electron IPC payload for ${channel}`,
          cause: parsed.error,
        });
  });

const api = {
  health: () => invokeResult(backendSchemas.health, "backend:health"),
  inventory: () => invokeResult(backendSchemas.inventory, "backend:inventory"),
  refreshInventory: () =>
    invokeResult(backendSchemas.receipt, "backend:refreshInventory"),
  gameInventory: (game: "steam" | "tf2" | "dota2") =>
    invokeResult(backendSchemas.gameInventory, "backend:gameInventory", game),
  refreshGameInventory: (game: "steam" | "tf2" | "dota2") =>
    invokeResult(backendSchemas.receipt, "backend:refreshGameInventory", game),
  tf2Features: () =>
    invokeResult(backendSchemas.tf2Features, "backend:tf2Features"),
  steamInventoryService: (appId: number) =>
    invokeResult(
      backendSchemas.gameInventory,
      "backend:steamInventoryService",
      appId,
    ),
  steamInventoryServiceGames: () =>
    invokeResult(
      backendSchemas.steamInventoryServiceGames,
      "backend:steamInventoryServiceGames",
    ),
  refreshSteamInventoryService: (appId: number) =>
    invokeResult(
      backendSchemas.receipt,
      "backend:refreshSteamInventoryService",
      appId,
    ),
  armory: () => invokeResult(backendSchemas.armory, "backend:armory"),
  marketPreview: (marketName: string) =>
    invokeResult(
      backendSchemas.marketPreview,
      "backend:marketPreview",
      marketName,
    ),
  refreshArmory: () =>
    invokeResult(backendSchemas.receipt, "backend:refreshArmory"),
  redeemArmory: (input: unknown) =>
    invokeResult(backendSchemas.receipt, "backend:redeemArmory", input),
  store: () => invokeResult(backendSchemas.store, "backend:store"),
  refreshStore: () =>
    invokeResult(backendSchemas.receipt, "backend:refreshStore"),
  trades: () => invokeResult(backendSchemas.trades, "backend:trades"),
  refreshTrades: () =>
    invokeResult(backendSchemas.trades, "backend:refreshTrades"),
  tradeAccounts: () =>
    invokeResult(backendSchemas.tradeAccounts, "backend:tradeAccounts"),
  refreshTradeAccounts: (steamId?: string) =>
    invokeResult(
      backendSchemas.tradeAccounts,
      "backend:refreshTradeAccounts",
      steamId,
    ),
  createTradeOffer: (input: unknown) =>
    invokeResult(
      backendSchemas.tradeMutation,
      "backend:createTradeOffer",
      input,
    ),
  acceptTradeOffer: (id: string) =>
    invokeResult(backendSchemas.tradeMutation, "backend:acceptTradeOffer", id),
  counterTradeOffer: (id: string, input: unknown) =>
    invokeResult(
      backendSchemas.tradeMutation,
      "backend:counterTradeOffer",
      id,
      input,
    ),
  initializeStorePurchase: (input: unknown) =>
    invokeResult(
      backendSchemas.purchaseSession,
      "backend:initializeStorePurchase",
      input,
    ),
  storePurchase: (id: string) =>
    invokeResult(backendSchemas.purchaseSession, "backend:storePurchase", id),
  reconcileStorePurchase: (id: string) =>
    invokeResult(
      backendSchemas.purchaseSession,
      "backend:reconcileStorePurchase",
      id,
    ),
  submitOperation: (type: string, input?: unknown) =>
    invokeResult(
      backendSchemas.receipt,
      "backend:submitOperation",
      type,
      input,
    ),
  operations: () => invokeResult(backendSchemas.receipts, "backend:operations"),
  events: () => invokeResult(backendSchemas.events, "backend:events"),
  protocolTrace: (after: number) =>
    invokeResult(backendSchemas.protocolTrace, "backend:protocolTrace", after),
  settings: () => invokeResult(backendSchemas.settings, "backend:settings"),
  steamStatus: () =>
    invokeResult(backendSchemas.connection, "backend:steamStatus"),
  connectSteam: (input?: unknown) =>
    invokeResult(backendSchemas.connection, "backend:connectSteam", input),
  startSteamQR: () =>
    invokeResult(backendSchemas.connection, "backend:startSteamQR"),
  watchSteamStatus: (listener: (status: unknown) => void) => {
    const parse = fromThrowable(JSON.parse, (cause) => cause);
    return watchSteamStatusWithRecovery({
      socketUrl: "ws://127.0.0.1:7331/steam/status/ws",
      readStatus: api.steamStatus,
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
  submitSteamGuard: (input?: unknown) =>
    invokeResult(backendSchemas.connection, "backend:submitSteamGuard", input),
  disconnectSteam: () =>
    invokeResult(backendSchemas.connection, "backend:disconnectSteam"),
  applyNameTag: (input: unknown) =>
    invokeResult(backendSchemas.receipt, "backend:applyNameTag", input),
  removeNameTag: (input: unknown) =>
    invokeResult(backendSchemas.receipt, "backend:removeNameTag", input),
  deleteItem: (input: unknown) =>
    invokeResult(backendSchemas.receipt, "backend:deleteItem", input),
  applyStatTrakSwap: (input: unknown) =>
    invokeResult(backendSchemas.receipt, "backend:applyStatTrakSwap", input),
  applyStrangePart: (input: unknown) =>
    invokeResult(backendSchemas.receipt, "backend:applyStrangePart", input),
  useItem: (input: unknown) =>
    invokeResult(backendSchemas.receipt, "backend:useItem", input),
  useMultipleItems: (input: unknown) =>
    invokeResult(backendSchemas.receipt, "backend:useMultipleItems", input),
  applyToolToItem: (input: unknown) =>
    invokeResult(backendSchemas.receipt, "backend:applyToolToItem", input),
  applyToolToBaseItem: (input: unknown) =>
    invokeResult(backendSchemas.receipt, "backend:applyToolToBaseItem", input),
  giftItem: (input: unknown) =>
    invokeResult(backendSchemas.receipt, "backend:giftItem", input),
};

contextBridge.exposeInMainWorld("cs2", api);

export type DesktopApi = typeof api;
