import { app, BrowserWindow, ipcMain } from "electron";
import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { ResultAsync } from "neverthrow";
import { postJsonResult, requestJsonResult, type AppError } from "@cs-inv-edit/app";

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

async function requestJson<T>(pathName: string, init?: RequestInit): Promise<IpcResult<T>> {
  return serializeResult(requestJsonResult<T>(backendURL, pathName, init));
}

function postJson<T>(pathName: string, input?: unknown): Promise<IpcResult<T>> {
  return serializeResult(postJsonResult<T>(backendURL, pathName, input));
}

ipcMain.handle("backend:health", async () => requestJson("/health"));
ipcMain.handle("backend:inventory", async () => requestJson("/inventory"));
ipcMain.handle("backend:refreshInventory", async () => requestJson("/inventory/refresh", { method: "POST" }));
ipcMain.handle("backend:armory", async () => requestJson("/armory"));
ipcMain.handle("backend:refreshArmory", async () => requestJson("/armory/refresh", { method: "POST" }));
ipcMain.handle("backend:redeemArmory", async (_event, input?: unknown) => postJson("/armory/redeem", input));
ipcMain.handle("backend:submitOperation", async (_event, type: string, input?: unknown) => requestJson(`/operations/${encodeURIComponent(type)}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(input ?? {}) }));
ipcMain.handle("backend:operations", async () => requestJson("/operations"));
ipcMain.handle("backend:events", async () => requestJson("/events"));
ipcMain.handle("backend:settings", async () => requestJson("/settings"));
ipcMain.handle("backend:steamStatus", async () => requestJson("/steam/status"));
ipcMain.handle("backend:connectSteam", async (_event, input?: unknown) => postJson("/steam/connect", input));
ipcMain.handle("backend:submitSteamGuard", async (_event, input?: unknown) => postJson("/steam/guard", input));
ipcMain.handle("backend:disconnectSteam", async () => requestJson("/steam/disconnect", { method: "POST" }));
ipcMain.handle("backend:applyNameTag", async (_event, input?: unknown) => postJson("/nametags/apply", input));
ipcMain.handle("backend:removeNameTag", async (_event, input?: unknown) => postJson("/nametags/remove", input));
ipcMain.handle("backend:deleteItem", async (_event, input?: unknown) => postJson("/items/delete", input));
ipcMain.handle("backend:applyStatTrakSwap", async (_event, input?: unknown) => postJson("/stattrak/swap", input));
ipcMain.handle("backend:applyStrangePart", async (_event, input?: unknown) => postJson("/strange-parts/apply", input));
ipcMain.handle("backend:useItem", async (_event, input?: unknown) => postJson("/items/use", input));
ipcMain.handle("backend:useMultipleItems", async (_event, input?: unknown) => postJson("/items/use-multiple", input));
ipcMain.handle("backend:applyToolToItem", async (_event, input?: unknown) => postJson("/tools/apply", input));
ipcMain.handle("backend:applyToolToBaseItem", async (_event, input?: unknown) => postJson("/tools/apply-base", input));
ipcMain.handle("backend:giftItem", async (_event, input?: unknown) => postJson("/gifts/send", input));

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
