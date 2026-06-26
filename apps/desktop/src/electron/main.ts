import { app, BrowserWindow, dialog, ipcMain } from "electron";
import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const backendURL = "http://127.0.0.1:7331";
let backend: ChildProcessWithoutNullStreams | undefined;

function backendPath() {
  return process.env.CS2_BACKEND_BIN ?? path.resolve(__dirname, "../../../../bin/cs2-backend");
}

function ensureBackendBinary() {
  if (!fs.existsSync(backendPath())) {
    throw new Error(`Backend binary missing at ${backendPath()}. Run npm run build:backend first.`);
  }
}

function startBackend() {
  if (backend) return;

  backend = spawn(backendPath(), [], {
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

async function waitForBackendReady(timeoutMs = 20000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(`${backendURL}/health`);
      if (response.ok) return;
    } catch {
      // retry
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error("Timed out waiting for Go backend to become ready");
}

async function requestBackend(pathName: string, init: RequestInit = {}) {
  const response = await fetch(`${backendURL}${pathName}`, init);
  if (!response.ok) {
    const bodyText = await response.text();
    throw new Error(`${response.status} ${response.statusText}${bodyText ? `: ${bodyText}` : ""}`);
  }
  return response.json();
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

ipcMain.handle("backend:request", async (_event, method: string, pathName: string, body?: unknown) => {
  return requestBackend(pathName, {
    method,
    headers: { "Content-Type": "application/json" },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
});

app.whenReady().then(async () => {
  try {
    ensureBackendBinary();
    startBackend();
    await waitForBackendReady();
  } catch (error) {
    dialog.showErrorBox("Backend startup failed", error instanceof Error ? error.message : "Unknown error");
    app.quit();
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
