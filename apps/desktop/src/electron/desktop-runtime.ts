import { app, BrowserWindow, ipcMain, shell } from "electron";
import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { Result, ResultAsync } from "neverthrow";
import {
  postJsonResult,
  requestJsonResult,
  type SafeParseSchema,
} from "@cs-inv-edit/app";
import {
  backendSchemas,
  economyGameSchema,
  steamInventoryServiceAppIdSchema,
} from "@cs-inv-edit/contracts";
import {
  serializeResult,
  type IpcResult,
} from "./ipc-result.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const backendURL = "http://127.0.0.1:7331";
export let backend: ChildProcessWithoutNullStreams | undefined;

function backendPath() {
  const defaultPath = app.isPackaged
    ? path.join(process.resourcesPath, "bin", "cs2-backend")
    : path.resolve(__dirname, "../../../../bin/cs2-backend");
  return process.env.CS2_BACKEND_BIN ?? defaultPath;
}

export function startBackend() {
  if (backend) return;
  const binaryPath = backendPath();
  if (!existsSync(binaryPath)) {
    console.error(`Missing backend binary at ${binaryPath}`);
    return;
  }

  backend = spawn(binaryPath, [], {
    env: { ...process.env, CS2_BACKEND_ADDR: "127.0.0.1:7331" },
    stdio: "pipe",
  });

  backend.stdout.on("data", (data) => console.log(`[backend] ${data}`.trim()));
  backend.stderr.on("data", (data) =>
    console.error(`[backend] ${data}`.trim()),
  );
  backend.on("exit", (code) => {
    console.log(`[backend] exited with ${code}`);
    backend = undefined;
  });
}

export async function waitForBackend(attempts = 30): Promise<boolean> {
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    const healthy = await ResultAsync.fromPromise(
      fetch(`${backendURL}/health`),
      () => false,
    ).match(
      (response) => response.ok,
      () => false,
    );
    if (healthy) return true;
    await new Promise((resolve) => setTimeout(resolve, 500));
  }

  return false;
}

export async function createWindow() {
  const win = new BrowserWindow({
    width: 1180,
    height: 760,
    title: "CS Inventory Control",
    webPreferences: {
      preload: path.resolve(__dirname, "../preload/index.js"),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  win.webContents.setWindowOpenHandler(({ url }) => {
    if (isAllowedExternalURL(url)) {
      void ResultAsync.fromPromise(
        shell.openExternal(url),
        () => undefined,
      ).match(
        () => undefined,
        () => undefined,
      );
    }
    return { action: "deny" };
  });

  if (process.env.VITE_DEV_SERVER_URL) {
    await win.loadURL(process.env.VITE_DEV_SERVER_URL);
  } else {
    await win.loadFile(path.resolve(__dirname, "../renderer/index.html"));
  }
}

function isAllowedExternalURL(raw: string): boolean {
  return Result.fromThrowable(
    () => new URL(raw),
    () => undefined,
  )().match(
    (url) => {
      if (url.protocol === "steam:")
        return (
          /^steam:\/\/rungame\/730\/[^/]*\/\+csgo_econ_action_preview%20/i.test(raw) ||
          /^steam:\/\/(?:run|rungame)\/440\/[^/]*\/\+tf_econ_item_preview%20/i.test(raw)
        );
      if (
        url.protocol !== "https:" ||
        url.username !== "" ||
        url.password !== "" ||
        url.hostname === ""
      )
        return false;
      const host = url.hostname.toLowerCase();
      if (/^[\d.:]+$/.test(host)) return false;
      return (
        host === "steampowered.com" ||
        host.endsWith(".steampowered.com") ||
        host === "steamcommunity.com" ||
        host.endsWith(".steamcommunity.com")
      );
    },
    () => false,
  );
}

async function requestJson<T>(
  pathName: string,
  schema: SafeParseSchema<T>,
  init?: RequestInit,
): Promise<IpcResult<T>> {
  return serializeResult(
    requestJsonResult<T>(backendURL, pathName, schema, init),
  );
}

function postJson<T>(
  pathName: string,
  schema: SafeParseSchema<T>,
  input?: unknown,
): Promise<IpcResult<T>> {
  return serializeResult(
    postJsonResult<T>(backendURL, pathName, schema, input),
  );
}

ipcMain.handle("backend:health", async () =>
  requestJson("/health", backendSchemas.health),
);
ipcMain.handle("backend:inventory", async () =>
  requestJson("/inventory", backendSchemas.inventory),
);
ipcMain.handle("backend:refreshInventory", async () =>
  requestJson("/inventory/refresh", backendSchemas.receipt, { method: "POST" }),
);
ipcMain.handle("backend:gameInventory", async (_event, game: unknown) => {
  const parsed = economyGameSchema.safeParse(game);
  return parsed.success
    ? requestJson(
        `/games/${parsed.data}/inventory`,
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
  requestJson("/games/tf2/features", backendSchemas.tf2Features),
);
ipcMain.handle("backend:cs2Features", async () =>
  requestJson("/games/cs2/features", backendSchemas.cs2Features),
);
ipcMain.handle(
  "backend:refreshGameInventory",
  async (_event, game: unknown) => {
    const parsed = economyGameSchema.safeParse(game);
    return parsed.success
      ? requestJson(
          `/games/${parsed.data}/inventory/refresh`,
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
          `/steam-inventory-service/${parsed.data}`,
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
    "/steam-inventory-service/games",
    backendSchemas.steamInventoryServiceGames,
  ),
);
ipcMain.handle(
  "backend:refreshSteamInventoryService",
  async (_event, appId: unknown) => {
    const parsed = steamInventoryServiceAppIdSchema.safeParse(appId);
    return parsed.success
      ? requestJson(
          `/steam-inventory-service/${parsed.data}/refresh`,
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
  requestJson("/armory", backendSchemas.armory),
);
ipcMain.handle("backend:marketPreview", async (_event, marketName: string) =>
  requestJson(
    `/market/preview?marketName=${encodeURIComponent(marketName)}`,
    backendSchemas.marketPreview,
  ),
);
ipcMain.handle("backend:refreshArmory", async () =>
  requestJson("/armory/refresh", backendSchemas.receipt, { method: "POST" }),
);
ipcMain.handle("backend:redeemArmory", async (_event, input?: unknown) =>
  postJson("/armory/redeem", backendSchemas.receipt, input),
);
ipcMain.handle("backend:store", async () =>
  requestJson("/store", backendSchemas.store),
);
ipcMain.handle("backend:refreshStore", async () =>
  requestJson("/store/refresh", backendSchemas.receipt, { method: "POST" }),
);
ipcMain.handle("backend:trades", async () =>
  requestJson("/trades", backendSchemas.trades),
);
ipcMain.handle("backend:refreshTrades", async () =>
  requestJson("/trades/refresh", backendSchemas.trades, { method: "POST" }),
);
ipcMain.handle("backend:tradeAccounts", async () =>
  requestJson("/trade-accounts", backendSchemas.tradeAccounts),
);
ipcMain.handle(
  "backend:refreshTradeAccounts",
  async (_event, steamId?: string) =>
    requestJson(
      `/trade-accounts${steamId ? `?steamId=${encodeURIComponent(steamId)}` : ""}`,
      backendSchemas.tradeAccounts,
      { method: "POST" },
    ),
);
ipcMain.handle("backend:createTradeOffer", async (_event, input: unknown) =>
  postJson("/trades/offers", backendSchemas.tradeMutation, input),
);
ipcMain.handle("backend:acceptTradeOffer", async (_event, id: string) =>
  postJson(
    `/trades/offers/${encodeURIComponent(id)}/accept`,
    backendSchemas.tradeMutation,
    {},
  ),
);
ipcMain.handle(
  "backend:counterTradeOffer",
  async (_event, id: string, input: unknown) =>
    postJson(
      `/trades/offers/${encodeURIComponent(id)}/counter`,
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
          "/store/purchases",
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
    `/store/purchases/${encodeURIComponent(id)}`,
    backendSchemas.purchaseSession,
  ),
);
ipcMain.handle("backend:reconcileStorePurchase", async (_event, id: string) =>
  requestJson(
    `/store/purchases/${encodeURIComponent(id)}/reconcile`,
    backendSchemas.purchaseSession,
    { method: "POST" },
  ),
);
ipcMain.handle(
  "backend:submitOperation",
  async (_event, type: string, input?: unknown) =>
    requestJson(
      `/operations/${encodeURIComponent(type)}`,
      backendSchemas.receipt,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(input ?? {}),
      },
    ),
);
ipcMain.handle("backend:operations", async () =>
  requestJson("/operations", backendSchemas.receipts),
);
ipcMain.handle("backend:events", async () =>
  requestJson("/events", backendSchemas.events),
);
ipcMain.handle("backend:protocolTrace", async (_event, after: number) =>
  requestJson(
    `/protocol-trace?after=${encodeURIComponent(String(after))}`,
    backendSchemas.protocolTrace,
  ),
);
ipcMain.handle("backend:settings", async () =>
  requestJson("/settings", backendSchemas.settings),
);
ipcMain.handle("backend:steamStatus", async () =>
  requestJson("/steam/status", backendSchemas.connection),
);
ipcMain.handle("backend:connectSteam", async (_event, input?: unknown) =>
  postJson("/steam/connect", backendSchemas.connection, input),
);
ipcMain.handle("backend:startSteamQR", async () =>
  postJson("/steam/qr", backendSchemas.connection, {}),
);
ipcMain.handle("backend:submitSteamGuard", async (_event, input?: unknown) =>
  postJson("/steam/guard", backendSchemas.connection, input),
);
ipcMain.handle("backend:disconnectSteam", async () =>
  requestJson("/steam/disconnect", backendSchemas.connection, {
    method: "POST",
  }),
);
ipcMain.handle("backend:applyNameTag", async (_event, input?: unknown) =>
  postJson("/nametags/apply", backendSchemas.receipt, input),
);
ipcMain.handle("backend:removeNameTag", async (_event, input?: unknown) =>
  postJson("/nametags/remove", backendSchemas.receipt, input),
);
ipcMain.handle("backend:deleteItem", async (_event, input?: unknown) =>
  postJson("/items/delete", backendSchemas.receipt, input),
);
ipcMain.handle("backend:applyStatTrakSwap", async (_event, input?: unknown) =>
  postJson("/stattrak/swap", backendSchemas.receipt, input),
);
ipcMain.handle("backend:applyStrangePart", async (_event, input?: unknown) =>
  postJson("/strange-parts/apply", backendSchemas.receipt, input),
);
ipcMain.handle("backend:useItem", async (_event, input?: unknown) =>
  postJson("/items/use", backendSchemas.receipt, input),
);
ipcMain.handle("backend:useMultipleItems", async (_event, input?: unknown) =>
  postJson("/items/use-multiple", backendSchemas.receipt, input),
);
ipcMain.handle("backend:applyToolToItem", async (_event, input?: unknown) =>
  postJson("/tools/apply", backendSchemas.receipt, input),
);
ipcMain.handle("backend:applyToolToBaseItem", async (_event, input?: unknown) =>
  postJson("/tools/apply-base", backendSchemas.receipt, input),
);
ipcMain.handle("backend:giftItem", async (_event, input?: unknown) =>
  postJson("/gifts/send", backendSchemas.receipt, input),
);
