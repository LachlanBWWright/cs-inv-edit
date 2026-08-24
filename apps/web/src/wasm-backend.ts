import type { LocalAgentClient } from "@cs-inv-edit/app";
import { createAppError } from "@cs-inv-edit/app";
import {
  ResultAsync,
  err,
  errAsync,
  fromThrowable,
  ok,
} from "neverthrow";
import {
  backendSchemas,
  healthStatusSchema,
  localAgentPaths,
  type ConnectionStatus,
  type HealthStatus,
} from "@cs-inv-edit/contracts";
declare global {
  interface Window {
    Go: new () => {
      importObject: WebAssembly.Imports;
      run: (instance: WebAssembly.Instance) => void;
    };
    csInvEditWasmBackend?: {
      health?: () => string;
      request?: (method: string, path: string, body?: string) => Promise<string>;
    };
  }
}

const wasmAssetBasePath = `${import.meta.env.BASE_URL.replace(/\/$/, "")}/`;
const wasmAssetPaths = {
  wasm: `${wasmAssetBasePath}wasm/cs2-backend.wasm`,
  loader: `${wasmAssetBasePath}wasm/wasm_exec.js`,
} as const;
type WasmResponseEnvelope = { status: number; body: string };
type WasmSchema<T> = {
  safeParse: (
    value: unknown,
  ) => { success: true; data: T } | { success: false };
};
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function decodeWasmEnvelope(raw: string) {
  return fromThrowable(
    (value: string): unknown => JSON.parse(value),
    (cause) => createAppError("Invalid WASM backend response", undefined, cause),
  )(raw).andThen((value) => {
    if (
      !isRecord(value) ||
      typeof value.status !== "number" ||
      typeof value.body !== "string"
    ) {
      return err(createAppError("Invalid WASM backend response envelope"));
    }
    return ok({
      status: value.status,
      body: value.body,
    } satisfies WasmResponseEnvelope);
  });
}

function decodeWasmBody<T>(raw: string, schema: WasmSchema<T>) {
  return fromThrowable(
    (value: string): unknown => JSON.parse(value),
    (cause) => createAppError("Invalid WASM API JSON", undefined, cause),
  )(raw).andThen((value) => {
    const parsed = schema.safeParse(value);
    return parsed.success
      ? ok(parsed.data)
      : err(createAppError("WASM API response did not match its contract"));
  });
}
function createDefaultHealthStatus(): HealthStatus {
  return {
    status: "ok",
    service: "cs2-wasm-backend",
    version: "0.0.0",
    time: new Date().toISOString(),
  };
}
function decodeHealthStatus(raw: string | undefined): HealthStatus {
  if (!raw) return createDefaultHealthStatus();
  const decoded = fromThrowable(JSON.parse, (cause) =>
    createAppError("Invalid WASM health JSON", undefined, cause),
  )(raw).andThen((value) => {
    const parsed = healthStatusSchema.safeParse(value);
    return parsed.success
      ? ok(parsed.data)
      : err(
          createAppError(
            `Invalid WASM health payload: ${parsed.error.message}`,
          ),
        );
  });
  return decoded.match(
    (value) => value,
    () => ({
      status: "error",
      service: "cs2-wasm-backend",
      version: "0.0.0",
      time: new Date().toISOString(),
    }),
  );
}
async function loadWasmRuntime() {
  const wasmPath = wasmAssetPaths.wasm;
  const loaderPath = wasmAssetPaths.loader;

  if (!document.querySelector(`script[src="${loaderPath}"]`)) {
    await new Promise<void>((resolve, reject) => {
      const script = document.createElement("script");
      script.src = loaderPath;
      script.onload = () => resolve();
      script.onerror = () => reject(new Error(`Unable to load ${loaderPath}`));
      document.head.appendChild(script);
    });
  }

  if (!window.csInvEditWasmBackend) {
    const response = await fetch(wasmPath);
    if (!response.ok) {
      return Promise.reject(
        new Error(`Unable to load ${wasmPath}: ${response.status}`),
      );
    }
    const bytes = await response.arrayBuffer();
    const go = new window.Go();
    const result = await WebAssembly.instantiate(bytes, go.importObject);
    go.run(result.instance);
  }
}

export function createWasmBackendClient(): LocalAgentClient {
  let runtimePromise: Promise<void> | undefined;
  const ensureRuntime = () => {
    runtimePromise ??= loadWasmRuntime();
    return runtimePromise;
  };

  function requestResult<T>(
    method: string,
    path: string,
    schema: WasmSchema<T>,
    input?: unknown,
  ): ResultAsync<T, ReturnType<typeof createAppError>> {
    return ResultAsync.fromPromise<void, ReturnType<typeof createAppError>>(
      ensureRuntime(),
      (cause) =>
      createAppError("Failed to load WASM runtime", undefined, cause),
    ).andThen<T, ReturnType<typeof createAppError>>(() => {
      const request = window.csInvEditWasmBackend?.request;
      if (!request) {
        return errAsync(createAppError("WASM backend request bridge unavailable"));
      }
      return ResultAsync.fromPromise(
        request(method, path, input === undefined ? "" : JSON.stringify(input)),
        (cause) => createAppError("WASM backend request failed", undefined, cause),
      ).andThen((rawResponse) => {
        return decodeWasmEnvelope(rawResponse).asyncAndThen((envelope) => {
          if (envelope.status < 200 || envelope.status >= 300) {
            return errAsync(
              createAppError(
                `WASM backend request failed (${envelope.status})`,
                undefined,
                envelope.body,
              ),
            );
          }
          return ResultAsync.fromPromise(
            Promise.resolve(decodeWasmBody(envelope.body, schema)),
            (cause) => createAppError("WASM API response decode failed", undefined, cause),
          ).andThen((decoded) => decoded);
        });
      });
    });
  }

  return {
    health: () =>
      ResultAsync.fromPromise(ensureRuntime(), (cause) =>
        createAppError("Failed to load WASM runtime", undefined, cause),
      ).map((): HealthStatus => {
        const runtime = window.csInvEditWasmBackend;
        return decodeHealthStatus(runtime?.health?.());
      }),
    inventory: () =>
      requestResult("GET", localAgentPaths.inventory, backendSchemas.inventory),
    refreshInventory: () =>
      requestResult("POST", localAgentPaths.refreshInventory, backendSchemas.receipt),
    gameInventory: (game) =>
      requestResult("GET", localAgentPaths.gameInventory(game), backendSchemas.gameInventory),
    refreshGameInventory: (game) =>
      requestResult("POST", localAgentPaths.refreshGameInventory(game), backendSchemas.receipt),
    tf2Features: () =>
      requestResult("GET", localAgentPaths.tf2Features, backendSchemas.tf2Features),
    cs2Features: () =>
      requestResult("GET", localAgentPaths.cs2Features, backendSchemas.cs2Features),
    steamInventoryService: (appId) =>
      requestResult("GET", localAgentPaths.steamInventoryService(appId), backendSchemas.gameInventory),
    steamInventoryServiceGames: () =>
      requestResult("GET", localAgentPaths.steamInventoryServiceGames, backendSchemas.steamInventoryServiceGames),
    refreshSteamInventoryService: (appId) =>
      requestResult("POST", localAgentPaths.refreshSteamInventoryService(appId), backendSchemas.receipt),
    armory: () => requestResult("GET", localAgentPaths.armory, backendSchemas.armory),
    marketPreview: (marketName) => requestResult("GET", localAgentPaths.marketPreview(marketName), backendSchemas.marketPreview),
    refreshArmory: () => requestResult("POST", localAgentPaths.refreshArmory, backendSchemas.receipt),
    redeemArmory: (input) => requestResult("POST", localAgentPaths.redeemArmory, backendSchemas.receipt, input),
    store: () => requestResult("GET", localAgentPaths.store, backendSchemas.store),
    refreshStore: () => requestResult("POST", localAgentPaths.refreshStore, backendSchemas.receipt),
    tf2Store: () => requestResult("GET", localAgentPaths.tf2Store, backendSchemas.store),
    refreshTF2Store: () => requestResult("POST", localAgentPaths.refreshTf2Store, backendSchemas.receipt),
    initializeTF2StorePurchase: (input) =>
      requestResult("POST", localAgentPaths.initializeTf2StorePurchase, backendSchemas.purchaseSession, input),
    trades: () => requestResult("GET", localAgentPaths.trades, backendSchemas.trades),
    refreshTrades: () => requestResult("POST", localAgentPaths.refreshTrades, backendSchemas.trades),
    refreshTradeAccounts: (steamId) => requestResult("POST", localAgentPaths.refreshTradeAccounts(steamId), backendSchemas.tradeAccounts),
    tradeAccounts: () => requestResult("GET", localAgentPaths.tradeAccounts, backendSchemas.tradeAccounts),
    createTradeOffer: (input) => requestResult("POST", localAgentPaths.createTradeOffer, backendSchemas.tradeMutation, input),
    acceptTradeOffer: (id) => requestResult("POST", localAgentPaths.acceptTradeOffer(id), backendSchemas.tradeMutation),
    counterTradeOffer: (id, input) => requestResult("POST", localAgentPaths.counterTradeOffer(id), backendSchemas.tradeMutation, input),
    initializeStorePurchase: (input) =>
      requestResult("POST", localAgentPaths.initializeStorePurchase, backendSchemas.purchaseSession, input),
    storePurchase: (id) =>
      requestResult("POST", localAgentPaths.storePurchase(id), backendSchemas.purchaseSession),
    reconcileStorePurchase: (id) =>
      requestResult("POST", localAgentPaths.reconcileStorePurchase(id), backendSchemas.purchaseSession),
    submitOperation: (type, input) =>
      requestResult("POST", localAgentPaths.submitOperation(type), backendSchemas.receipt, input),
    operations: () =>
      requestResult("GET", localAgentPaths.operations, backendSchemas.receipts),
    events: () =>
      requestResult("GET", localAgentPaths.events, backendSchemas.events),
    settings: () =>
      requestResult("GET", localAgentPaths.settings, backendSchemas.settings),
    steamStatus: () =>
      requestResult<ConnectionStatus>(
        "GET",
        localAgentPaths.steamStatus,
        backendSchemas.connection,
      ),
    connectSteam: (input) =>
      requestResult<ConnectionStatus>(
        "POST",
        localAgentPaths.connectSteam,
        backendSchemas.connection,
        input,
      ),
    startSteamQR: () =>
      requestResult<ConnectionStatus>(
        "POST",
        localAgentPaths.startSteamQr,
        backendSchemas.connection,
        {},
      ),
    submitSteamGuard: (input) =>
      requestResult<ConnectionStatus>(
        "POST",
        localAgentPaths.submitSteamGuard,
        backendSchemas.connection,
        input,
      ),
    disconnectSteam: () =>
      requestResult<ConnectionStatus>(
        "POST",
        localAgentPaths.disconnectSteam,
        backendSchemas.connection,
      ),
    applyNameTag: (input) => requestResult("POST", localAgentPaths.applyNameTag, backendSchemas.receipt, input),
    removeNameTag: (input) => requestResult("POST", localAgentPaths.removeNameTag, backendSchemas.receipt, input),
    deleteItem: (input) => requestResult("POST", localAgentPaths.deleteItem, backendSchemas.receipt, input),
    applyStatTrakSwap: (input) => requestResult("POST", localAgentPaths.applyStatTrakSwap, backendSchemas.receipt, input),
    applyStrangePart: (input) => requestResult("POST", localAgentPaths.applyStrangePart, backendSchemas.receipt, input),
    useItem: (input) => requestResult("POST", localAgentPaths.useItem, backendSchemas.receipt, input),
    useMultipleItems: (input) => requestResult("POST", localAgentPaths.useMultipleItems, backendSchemas.receipt, input),
    applyToolToItem: (input) => requestResult("POST", localAgentPaths.applyToolToItem, backendSchemas.receipt, input),
    applyToolToBaseItem: (input) => requestResult("POST", localAgentPaths.applyToolToBaseItem, backendSchemas.receipt, input),
    giftItem: (input) => requestResult("POST", localAgentPaths.sendGift, backendSchemas.receipt, input),
  };
}
