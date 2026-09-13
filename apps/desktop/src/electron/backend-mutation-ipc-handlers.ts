import { ipcMain } from "electron";
import type { SafeParseSchema } from "@cs-inv-edit/app";
import {
  backendInputSchemas,
  localAgentPaths,
} from "@cs-inv-edit/contracts";
import type { IpcResult } from "./ipc-result.js";

type PostJson = (
  pathName: string,
  input?: unknown,
) => Promise<IpcResult<unknown>>;

function parseInput(
  schema: SafeParseSchema<unknown>,
  input: unknown,
  message: string,
): IpcResult<unknown> {
  const parsed = schema.safeParse(input);
  return parsed.success
    ? { ok: true, value: parsed.data }
    : { ok: false, error: { message, cause: { issues: parsed.error } } };
}

function registerReceiptMutation(
  channel: string,
  pathName: string,
  schema: SafeParseSchema<unknown>,
  postJson: PostJson,
) {
  ipcMain.handle(channel, (_event, input?: unknown) => {
    const parsed = parseInput(
      schema,
      input,
      `Invalid IPC argument for ${channel}`,
    );
    return parsed.ok
      ? postJson(pathName, parsed.value)
      : Promise.resolve(parsed);
  });
}

export function registerBackendMutationIpcHandlers(postJson: PostJson) {
  const receiptMutations = {
    applyNameTag: [localAgentPaths.applyNameTag, backendInputSchemas.setItemName],
    removeNameTag: [localAgentPaths.removeNameTag, backendInputSchemas.itemId],
    deleteItem: [localAgentPaths.deleteItem, backendInputSchemas.itemId],
    applyStatTrakSwap: [
      localAgentPaths.applyStatTrakSwap,
      backendInputSchemas.applyStatTrakSwap,
    ],
    applyStrangePart: [
      localAgentPaths.applyStrangePart,
      backendInputSchemas.applyStrangePart,
    ],
    useItem: [localAgentPaths.useItem, backendInputSchemas.useItem],
    useMultipleItems: [
      localAgentPaths.useMultipleItems,
      backendInputSchemas.useMultipleItems,
    ],
    applyToolToItem: [
      localAgentPaths.applyToolToItem,
      backendInputSchemas.applyToolToItem,
    ],
    applyToolToBaseItem: [
      localAgentPaths.applyToolToBaseItem,
      backendInputSchemas.applyToolToBaseItem,
    ],
    giftItem: [localAgentPaths.sendGift, backendInputSchemas.giftItem],
  } as const;
  for (const [operation, [pathName, schema]] of Object.entries(receiptMutations)) {
    registerReceiptMutation(
      `backend:${operation}`,
      pathName,
      schema,
      (path, input) => postJson(path, input),
    );
  }
}
