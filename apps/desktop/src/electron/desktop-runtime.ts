import { app, BrowserWindow, shell } from "electron";
import { spawn, type ChildProcess } from "node:child_process";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { Result, ResultAsync } from "neverthrow";
import {
  backendUrl,
  registerBackendIpcHandlers,
} from "./backend-ipc-handlers.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export let backend: ChildProcess | undefined;

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

  const childProcess: ChildProcess = spawn(binaryPath, [], {
    env: { ...process.env, CS2_BACKEND_ADDR: "127.0.0.1:7331" },
    stdio: "pipe",
  });

  backend = childProcess;
  if (childProcess.stdout) {
    childProcess.stdout.on("data", (data) =>
      console.log(`[backend] ${data}`.trim()),
    );
  }
  if (childProcess.stderr) {
    childProcess.stderr.on("data", (data) =>
      console.error(`[backend] ${data}`.trim()),
    );
  }
  childProcess.on("exit", (code) => {
    console.log(`[backend] exited with ${code}`);
    backend = undefined;
  });
}

export async function waitForBackend(attempts = 30): Promise<boolean> {
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    const healthy = await ResultAsync.fromPromise(
      fetch(`${backendUrl}/health`),
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
    if (isAllowedExternalUrl(url)) {
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

function isAllowedExternalUrl(raw: string): boolean {
  return Result.fromThrowable(
    () => new URL(raw),
    () => undefined,
  )().match(
    (url) => {
      if (url.protocol === "steam:")
        return (
          /^steam:\/\/(?:run|rungame)\/730\/[^/]*\/\+csgo_econ_action_preview%20/i.test(
            raw,
          ) ||
          /^steam:\/\/(?:run|rungame)\/440\/[^/]*\/\+tf_econ_item_preview%20/i.test(
            raw,
          )
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
        host === "swap.gg" ||
        host === "steampowered.com" ||
        host.endsWith(".steampowered.com") ||
        host === "steamcommunity.com" ||
        host.endsWith(".steamcommunity.com")
      );
    },
    () => false,
  );
}

registerBackendIpcHandlers();
