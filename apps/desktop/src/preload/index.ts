import { contextBridge, ipcRenderer } from "electron";
import { ResultAsync, err, ok } from "neverthrow";
import type { AppError } from "@cs-inv-edit/app";

type IpcResult<T> = { ok: true; value: T } | { ok: false; error: AppError };

const invokeResult = <T>(channel: string, ...args: unknown[]) =>
  ResultAsync.fromPromise(ipcRenderer.invoke(channel, ...args) as Promise<IpcResult<T>>, (cause) => ({ message: `Electron IPC failed for ${channel}`, cause }))
    .andThen((result) => result.ok ? ok(result.value) : err(result.error));

const api = {
  health: () => invokeResult("backend:health"),
  inventory: () => invokeResult("backend:inventory"),
  refreshInventory: () => invokeResult("backend:refreshInventory"),
  armory: () => invokeResult("backend:armory"),
  refreshArmory: () => invokeResult("backend:refreshArmory"),
  redeemArmory: (input: unknown) => invokeResult("backend:redeemArmory", input),
  submitOperation: (type: string, input?: unknown) => invokeResult("backend:submitOperation", type, input),
  operations: () => invokeResult("backend:operations"),
  events: () => invokeResult("backend:events"),
  settings: () => invokeResult("backend:settings"),
  steamStatus: () => invokeResult("backend:steamStatus"),
  connectSteam: (input?: unknown) => invokeResult("backend:connectSteam", input),
  submitSteamGuard: (input?: unknown) => invokeResult("backend:submitSteamGuard", input),
  disconnectSteam: () => invokeResult("backend:disconnectSteam"),
  applyNameTag: (input: unknown) => invokeResult("backend:applyNameTag", input),
  removeNameTag: (input: unknown) => invokeResult("backend:removeNameTag", input),
  deleteItem: (input: unknown) => invokeResult("backend:deleteItem", input),
  applyStatTrakSwap: (input: unknown) => invokeResult("backend:applyStatTrakSwap", input),
  applyStrangePart: (input: unknown) => invokeResult("backend:applyStrangePart", input),
  useItem: (input: unknown) => invokeResult("backend:useItem", input),
  useMultipleItems: (input: unknown) => invokeResult("backend:useMultipleItems", input),
  applyToolToItem: (input: unknown) => invokeResult("backend:applyToolToItem", input),
  applyToolToBaseItem: (input: unknown) => invokeResult("backend:applyToolToBaseItem", input),
  giftItem: (input: unknown) => invokeResult("backend:giftItem", input),
};

contextBridge.exposeInMainWorld("cs2", api);

export type DesktopApi = typeof api;
