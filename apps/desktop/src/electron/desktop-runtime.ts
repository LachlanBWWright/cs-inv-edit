import { app, BrowserWindow, dialog, shell } from "electron";
import { spawn, type ChildProcess } from "node:child_process";
import type { Buffer } from "node:buffer";
import { createServer, type Server } from "node:net";
import { existsSync } from "node:fs";
import { randomBytes } from "node:crypto";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { Result, ResultAsync, err, ok, type Result as NeverthrowResult } from "neverthrow";
import {
  configureBackendConnection,
  registerBackendIpcHandlers,
} from "./backend-ipc-handlers.js";
import { resolveBackendPath } from "./backend-path.js";
import { isAllowedExternalUrl } from "./external-url.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dataServiceUrl = "http://127.0.0.1:7332";
const backendPathOverride = process.env.CS2_BACKEND_BIN;
const dataServicePathOverride = process.env.CS2_DATA_SERVICE_BIN;
let isQuitting = false;

export let backend: ChildProcess | undefined;
export let dataService: ChildProcess | undefined;

type RuntimeConfig = {
  backendUrl: string;
  backendAddress: string;
  backendAuthToken: string;
};

export type RuntimeError = { message: string; cause?: unknown };

function servicePath(binaryName: string, override?: string): string {
  if (override) return override;
  const platformBinaryName =
    process.platform === "win32" ? `${binaryName}.exe` : binaryName;
  return app.isPackaged
    ? path.join(process.resourcesPath, "bin", platformBinaryName)
    : path.resolve(__dirname, "../../../../bin", platformBinaryName);
}

function backendBinaryPath(): string {
  return resolveBackendPath({
    platform: process.platform,
    isPackaged: app.isPackaged,
    resourcesPath: process.resourcesPath,
    developmentDirectory: __dirname,
    override: backendPathOverride,
  });
}

function findFreePort(): ResultAsync<number, RuntimeError> {
  return ResultAsync.fromPromise(
    new Promise<number>((resolve, reject) => {
      const server: Server = createServer();
      server.once("error", reject);
      server.listen(0, "127.0.0.1", () => {
        const address = server.address();
        const port = typeof address === "object" && address ? address.port : 0;
        server.close((error) => (error ? reject(error) : resolve(port)));
      });
    }),
    (cause) => ({ message: "Could not allocate a private backend port", cause }),
  ).andThen((port) =>
    port > 0
      ? ok(port)
      : err({ message: "Could not determine the private backend port" }),
  );
}

function createAuthToken(): NeverthrowResult<string, RuntimeError> {
  return Result.fromThrowable(
    () => randomBytes(32).toString("hex"),
    (cause) => ({ message: "Could not create the backend authentication token", cause }),
  )();
}

function startProcess(
  binaryPath: string,
  environment: Record<string, string>,
  label: string,
): NeverthrowResult<ChildProcess, RuntimeError> {
  if (!existsSync(binaryPath)) {
    return err({ message: `Missing ${label} binary at ${binaryPath}` });
  }

  return Result.fromThrowable(
    () =>
      spawn(binaryPath, [], {
        env: { ...process.env, ...environment },
        stdio: "pipe",
      }),
    (cause) => ({ message: `Could not start ${label}`, cause }),
  )();
}

function observeProcess(
  childProcess: ChildProcess,
  label: string,
  onExit: () => void,
) {
  childProcess.stdout?.on("data", (data: Buffer) =>
    console.log(`[${label}] ${data.toString().trim()}`),
  );
  childProcess.stderr?.on("data", (data: Buffer) =>
    console.error(`[${label}] ${data.toString().trim()}`),
  );
  childProcess.on("error", (error) =>
    console.error(`[${label}] process error`, error),
  );
  childProcess.on("exit", (code, signal) => {
    console.log(`[${label}] exited with code=${code} signal=${signal ?? "none"}`);
    onExit();
    if (!isQuitting) {
      void ResultAsync.fromPromise(
        dialog.showMessageBox({
          type: "error",
          title: "CS Inventory Edit stopped",
          message: `${label} stopped unexpectedly.`,
          detail: `Exit code: ${code ?? "none"}\nSignal: ${signal ?? "none"}`,
          buttons: ["Quit", "Restart"],
          defaultId: 1,
        }),
        () => ({ response: 0 }),
      ).match(
        (result) => {
          if (result.response === 1) app.relaunch();
          app.quit();
        },
        () => app.quit(),
      );
    }
  });
}

export function startBackend(
  config: RuntimeConfig,
): NeverthrowResult<ChildProcess, RuntimeError> {
  if (backend) return ok(backend);
  const result = startProcess(
    backendBinaryPath(),
    {
      CS2_BACKEND_ADDR: config.backendAddress,
      CS2_BACKEND_AUTH_TOKEN: config.backendAuthToken,
    },
    "backend",
  );
  result.match(
    (childProcess) => {
      backend = childProcess;
      observeProcess(childProcess, "backend", () => {
        backend = undefined;
      });
    },
    () => undefined,
  );
  return result;
}

export function startDataService(): NeverthrowResult<ChildProcess, RuntimeError> {
  if (dataService) return ok(dataService);
  const result = startProcess(
    servicePath("data-service", dataServicePathOverride),
    {},
    "data service",
  );
  result.match(
    (childProcess) => {
      dataService = childProcess;
      observeProcess(childProcess, "data-service", () => {
        dataService = undefined;
      });
    },
    () => undefined,
  );
  return result;
}

function waitForHealth(
  url: string,
  authToken = "",
  attempts = 30,
): ResultAsync<boolean, RuntimeError> {
  const headers = authToken ? { Authorization: `Bearer ${authToken}` } : undefined;
  return ResultAsync.fromPromise(
    (async () => {
      for (let attempt = 0; attempt < attempts; attempt += 1) {
        const healthy = await ResultAsync.fromPromise(
          fetch(url, { headers }),
          () => false,
        ).match(
          (response) => response.ok,
          () => false,
        );
        if (healthy) return true;
        await new Promise((resolve) => setTimeout(resolve, 500));
      }
      return false;
    })(),
    (cause) => ({ message: `Health check failed for ${url}`, cause }),
  );
}

export async function startRuntime(): Promise<NeverthrowResult<RuntimeConfig, RuntimeError>> {
  const portResult = await findFreePort();
  const tokenResult = createAuthToken();
  return portResult.andThen((port) =>
    tokenResult.andThen((token) => {
      const config = {
        backendUrl: `http://127.0.0.1:${port}`,
        backendAddress: `127.0.0.1:${port}`,
        backendAuthToken: token,
      };
      configureBackendConnection(config.backendUrl, config.backendAuthToken);
      return startBackend(config).andThen(() =>
        startDataService().map(() => config),
      );
    }),
  );
}

export async function waitForRuntime(
  config: RuntimeConfig,
): Promise<NeverthrowResult<void, RuntimeError>> {
  const backendHealth = await waitForHealth(
    `${config.backendUrl}/health`,
    config.backendAuthToken,
  );
  return backendHealth.match(
    async (healthy) => {
      if (!healthy) return err({ message: "Backend did not become ready in time" });
      const dataHealth = await waitForHealth(`${dataServiceUrl}/healthz`);
      return dataHealth.match(
        (dataHealthy) =>
          dataHealthy
            ? ok(undefined)
            : err({ message: "Data service did not become ready in time" }),
        (error) => err(error),
      );
    },
    (error) => err(error),
  );
}

export async function createWindow(config: RuntimeConfig): Promise<void> {
  const win = new BrowserWindow({
    width: 1180,
    height: 760,
    title: "CS Inventory Control",
    webPreferences: {
      preload: path.resolve(__dirname, "../preload/index.js"),
      contextIsolation: true,
      nodeIntegration: false,
      additionalArguments: [
        `--cs2-backend-url=${config.backendUrl}`,
        `--cs2-backend-token=${config.backendAuthToken}`,
      ],
    },
  });

  win.webContents.setWindowOpenHandler(({ url }) => {
    if (isAllowedExternalUrl(url)) {
      void ResultAsync.fromPromise(shell.openExternal(url), () => undefined).match(
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

export function showRuntimeFailure(error: RuntimeError) {
  dialog.showErrorBox("CS Inventory Edit could not start", error.message);
  app.quit();
}

export function markRuntimeQuitting() {
  isQuitting = true;
}

registerBackendIpcHandlers();
