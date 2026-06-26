import { app, BrowserWindow, ipcMain } from "electron";
import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

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
    throw new Error(`Missing backend binary at ${binaryPath}`);
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

async function waitForBackend(attempts = 30): Promise<void> {
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    try {
      const response = await fetch(`${backendURL}/health`);
      if (response.ok) return;
    } catch {
      // keep polling
    }
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  throw new Error("Backend did not become ready in time");
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

async function requestJson(pathName: string, init?: RequestInit) {
  const response = await fetch(`${backendURL}${pathName}`, init);
  if (!response.ok) throw new Error(`${response.status} ${response.statusText}`);
  return response.json();
}

ipcMain.handle("backend:health", async () => requestJson("/health"));
ipcMain.handle("backend:inventory", async () => requestJson("/inventory"));
ipcMain.handle("backend:refreshInventory", async () => requestJson("/inventory/refresh", { method: "POST" }));
ipcMain.handle("backend:submitOperation", async (_event, type: string, input?: unknown) => requestJson(`/operations/${encodeURIComponent(type)}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(input ?? {}) }));
ipcMain.handle("backend:operations", async () => requestJson("/operations"));
ipcMain.handle("backend:events", async () => requestJson("/events"));
ipcMain.handle("backend:settings", async () => requestJson("/settings"));
ipcMain.handle("backend:connectSteam", async (_event, input?: unknown) => requestJson("/steam/connect", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(input ?? {}) }));
ipcMain.handle("backend:submitSteamGuard", async (_event, input?: unknown) => requestJson("/steam/guard", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(input ?? {}) }));
ipcMain.handle("backend:disconnectSteam", async () => requestJson("/steam/disconnect", { method: "POST" }));

app.whenReady().then(async () => {
  startBackend();
  await waitForBackend();
  await createWindow();
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});

app.on("before-quit", () => {
  backend?.kill();
});
