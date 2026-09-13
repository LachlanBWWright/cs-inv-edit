import { ipcMain } from "electron";
import type { SafeParseSchema } from "@cs-inv-edit/app";
import { backendInputSchemas, backendSchemas, localAgentPaths } from "@cs-inv-edit/contracts";
import type { IpcResult } from "./ipc-result.js";

type RequestJson = <T>(
  pathName: string,
  schema: SafeParseSchema<T>,
  init?: RequestInit,
)=> Promise<IpcResult<T>>;
type PostJson = <T>(
  pathName: string,
  schema: SafeParseSchema<T>,
  input?: unknown,
)=> Promise<IpcResult<T>>;
type ParseInput = <T>(
  schema: SafeParseSchema<T>,
  input: unknown,
  message: string,
)=> IpcResult<T>;

export function registerBackendTailIpcHandlers(
  requestJson: RequestJson,
  postJson: PostJson,
  parseInput: ParseInput,
) {
  ipcMain.handle("backend:submitOperation", async (_event, type: unknown, input?: unknown) => {
    const parsed = parseInput(
      backendInputSchemas.textId,
      type,
      "Invalid operation type IPC argument",
    );
    return parsed.ok
      ? postJson(localAgentPaths.submitOperation(parsed.value), backendSchemas.receipt, input ?? {})
      : parsed;
  });
  ipcMain.handle("backend:operations", async () =>
    requestJson(localAgentPaths.operations, backendSchemas.receipts),
  );
  ipcMain.handle("backend:events", async () =>
    requestJson(localAgentPaths.events, backendSchemas.events),
  );
  ipcMain.handle("backend:protocolTrace", async (_event, after: unknown) => {
    const parsed = parseInput(
      backendInputSchemas.nonNegativeInteger,
      after,
      "Invalid protocol trace cursor IPC argument",
    );
    return parsed.ok
      ? requestJson(
          localAgentPaths.protocolTrace(parsed.value),
          backendSchemas.protocolTrace,
        )
      : parsed;
  });
  ipcMain.handle("backend:settings", async () =>
    requestJson(localAgentPaths.settings, backendSchemas.settings),
  );
  ipcMain.handle("backend:steamStatus", async () =>
    requestJson(localAgentPaths.steamStatus, backendSchemas.connection),
  );
  ipcMain.handle("backend:connectSteam", async (_event, input?: unknown) => {
    const parsed = parseInput(
      backendInputSchemas.jsonObject,
      input ?? {},
      "Invalid Steam connection IPC argument",
    );
    return parsed.ok
      ? postJson(localAgentPaths.connectSteam, backendSchemas.connection, parsed.value)
      : parsed;
  });
  ipcMain.handle("backend:startSteamQR", async () =>
    postJson(localAgentPaths.startSteamQr, backendSchemas.connection, {}),
  );
  ipcMain.handle("backend:submitSteamGuard", async (_event, input?: unknown) => {
    const parsed = parseInput(
      backendInputSchemas.jsonObject,
      input ?? {},
      "Invalid Steam Guard IPC argument",
    );
    return parsed.ok
      ? postJson(localAgentPaths.submitSteamGuard, backendSchemas.connection, parsed.value)
      : parsed;
  });
  ipcMain.handle("backend:disconnectSteam", async () =>
    requestJson(localAgentPaths.disconnectSteam, backendSchemas.connection, {
      method: "POST",
    }),
  );
}
