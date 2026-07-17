import { app, BrowserWindow, ipcMain } from "electron";
import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { ResultAsync } from "neverthrow";
import { postJsonResult, requestJsonResult, type AppError, type SafeParseSchema } from "@cs-inv-edit/app";
import { backendSchemas, economyGameSchema } from "@cs-inv-edit/contracts";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const backendURL = "http://127.0.0.1:7331";
let backend: ChildProcessWithoutNullStreams | undefined;

function backendPath() {
  return process.env.CS2_BACKEND_BIN ?? path.resolve(__dirname, "../../../../bin/cs2-backend");
}

function startBackend() {
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
  backend.stderr.on("data", (data) => console.error(`[backend] ${data}`.trim()));
  backend.on("exit", (code) => {
    console.log(`[backend] exited with ${code}`);
    backend = undefined;
  });
}

async function waitForBackend(attempts = 30): Promise<boolean> {
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    const healthy = await ResultAsync.fromPromise(fetch(`${backendURL}/health`), () => false).match((response) => response.ok, () => false);
    if (healthy) return true;
    await new Promise((resolve) => setTimeout(resolve, 500));
  }

  return false;
}

async function createWindow() {
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

  if (process.env.VITE_DEV_SERVER_URL) {
    await win.loadURL(process.env.VITE_DEV_SERVER_URL);
  } else {
    await win.loadFile(path.resolve(__dirname, "../renderer/index.html"));
  }
}

type IpcResult<T> = { ok: true; value: T } | { ok: false; error: AppError };

function serializeResult<T>(result: ResultAsync<T, AppError>): Promise<IpcResult<T>> {
  return result.match(
    (value) => ({ ok: true as const, value }),
    (error) => ({ ok: false as const, error }),
  );
}

async function requestJson<T>(pathName: string, schema: SafeParseSchema<T>, init?: RequestInit): Promise<IpcResult<T>> {
  return serializeResult(requestJsonResult<T>(backendURL, pathName, schema, init));
}

function postJson<T>(pathName: string, schema: SafeParseSchema<T>, input?: unknown): Promise<IpcResult<T>> {
  return serializeResult(postJsonResult<T>(backendURL, pathName, schema, input));
}

ipcMain.handle("backend:health", async () => requestJson("/health", backendSchemas.health));
ipcMain.handle("backend:inventory", async () => requestJson("/inventory", backendSchemas.inventory));
ipcMain.handle("backend:refreshInventory", async () => requestJson("/inventory/refresh", backendSchemas.receipt, { method: "POST" }));
ipcMain.handle("backend:gameInventory", async (_event, game: unknown) => {
  const parsed = economyGameSchema.safeParse(game);
  return parsed.success ? requestJson(`/games/${parsed.data}/inventory`, backendSchemas.gameInventory) : { ok: false as const, error: { message: "Invalid economy game IPC argument", cause: parsed.error } };
});
ipcMain.handle("backend:refreshGameInventory", async (_event, game: unknown) => {
  const parsed = economyGameSchema.safeParse(game);
  return parsed.success ? requestJson(`/games/${parsed.data}/inventory/refresh`, backendSchemas.receipt, { method: "POST" }) : { ok: false as const, error: { message: "Invalid economy game IPC argument", cause: parsed.error } };
});
ipcMain.handle("backend:armory", async () => requestJson("/armory", backendSchemas.armory));
ipcMain.handle("backend:marketPreview", async (_event, marketName: string) => requestJson(`/market/preview?marketName=${encodeURIComponent(marketName)}`, backendSchemas.marketPreview));
ipcMain.handle("backend:refreshArmory", async () => requestJson("/armory/refresh", backendSchemas.receipt, { method: "POST" }));
ipcMain.handle("backend:redeemArmory", async (_event, input?: unknown) => postJson("/armory/redeem", backendSchemas.receipt, input));
ipcMain.handle("backend:submitOperation", async (_event, type: string, input?: unknown) => requestJson(`/operations/${encodeURIComponent(type)}`, backendSchemas.receipt, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(input ?? {}) }));
ipcMain.handle("backend:operations", async () => requestJson("/operations", backendSchemas.receipts));
ipcMain.handle("backend:events", async () => requestJson("/events", backendSchemas.events));
ipcMain.handle("backend:settings", async () => requestJson("/settings", backendSchemas.settings));
ipcMain.handle("backend:steamStatus", async () => requestJson("/steam/status", backendSchemas.connection));
ipcMain.handle("backend:connectSteam", async (_event, input?: unknown) => postJson("/steam/connect", backendSchemas.connection, input));
ipcMain.handle("backend:startSteamQR", async () => postJson("/steam/qr", backendSchemas.connection, {}));
ipcMain.handle("backend:submitSteamGuard", async (_event, input?: unknown) => postJson("/steam/guard", backendSchemas.connection, input));
ipcMain.handle("backend:disconnectSteam", async () => requestJson("/steam/disconnect", backendSchemas.connection, { method: "POST" }));
ipcMain.handle("backend:applyNameTag", async (_event, input?: unknown) => postJson("/nametags/apply", backendSchemas.receipt, input));
ipcMain.handle("backend:removeNameTag", async (_event, input?: unknown) => postJson("/nametags/remove", backendSchemas.receipt, input));
ipcMain.handle("backend:deleteItem", async (_event, input?: unknown) => postJson("/items/delete", backendSchemas.receipt, input));
ipcMain.handle("backend:applyStatTrakSwap", async (_event, input?: unknown) => postJson("/stattrak/swap", backendSchemas.receipt, input));
ipcMain.handle("backend:applyStrangePart", async (_event, input?: unknown) => postJson("/strange-parts/apply", backendSchemas.receipt, input));
ipcMain.handle("backend:useItem", async (_event, input?: unknown) => postJson("/items/use", backendSchemas.receipt, input));
ipcMain.handle("backend:useMultipleItems", async (_event, input?: unknown) => postJson("/items/use-multiple", backendSchemas.receipt, input));
ipcMain.handle("backend:applyToolToItem", async (_event, input?: unknown) => postJson("/tools/apply", backendSchemas.receipt, input));
ipcMain.handle("backend:applyToolToBaseItem", async (_event, input?: unknown) => postJson("/tools/apply-base", backendSchemas.receipt, input));
ipcMain.handle("backend:giftItem", async (_event, input?: unknown) => postJson("/gifts/send", backendSchemas.receipt, input));

app.whenReady().then(async () => {
  startBackend();
  const ready = await waitForBackend();
  if (!ready) {
    console.error("Backend did not become ready in time");
    return;
  }

  await createWindow();
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});

app.on("before-quit", () => {
  backend?.kill();
});
