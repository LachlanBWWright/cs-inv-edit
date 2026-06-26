import { app, BrowserWindow, ipcMain } from "electron";
import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
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

ipcMain.handle("backend:get", async (_event, pathName: string) => {
  const response = await fetch(`${backendURL}${pathName}`);
  if (!response.ok) throw new Error(`${response.status} ${response.statusText}`);
  return response.json();
});

ipcMain.handle("backend:post", async (_event, pathName: string, body?: unknown) => {
  const response = await fetch(`${backendURL}${pathName}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body ?? {}),
  });
  if (!response.ok) throw new Error(`${response.status} ${response.statusText}`);
  return response.json();
});

app.whenReady().then(() => {
  startBackend();
  void createWindow();
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});

app.on("before-quit", () => {
  backend?.kill();
});
