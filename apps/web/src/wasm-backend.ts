import type { LocalAgentClient } from "@cs-inv-edit/app";
import { createAppError } from "@cs-inv-edit/app";
import {
  ResultAsync,
  err,
  errAsync,
  fromThrowable,
  ok,
  okAsync,
} from "neverthrow";
import { healthStatusSchema, type HealthStatus } from "@cs-inv-edit/contracts";
import {
  createWasmConnectionStatus as createConnectionStatus,
  createWasmEvents as createEvents,
  createWasmInventorySnapshot as createInventorySnapshot,
  createWasmReceipt as createReceipt,
} from "./wasm-backend-state.js";
import { defaultWasmSettings } from "./wasm-backend-settings.js";
declare global {
  interface Window {
    Go: new () => {
      importObject: WebAssembly.Imports;
      run: (instance: WebAssembly.Instance) => void;
    };
    csInvEditWasmBackend?: {
      health?: () => string;
    };
  }
}

const wasmAssetBasePath = `${import.meta.env.BASE_URL.replace(/\/$/, "")}/`;
const wasmAssetPaths = {
  wasm: `${wasmAssetBasePath}wasm/cs2-backend.wasm`,
  loader: `${wasmAssetBasePath}wasm/wasm_exec.js`,
} as const;
function unavailableInWasm(message: string) {
  return errAsync({ message });
}
function requiresConnectionResponse<T extends object>(
  message: string,
  value: T,
) {
  return okAsync({
    ...value,
    status: "requires_connection" as const,
    message,
    refreshedAt: new Date().toISOString(),
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

  return {
    health: () =>
      ResultAsync.fromPromise(ensureRuntime(), (cause) =>
        createAppError("Failed to load WASM runtime", undefined, cause),
      ).map((): HealthStatus => {
        const runtime = window.csInvEditWasmBackend;
        return decodeHealthStatus(runtime?.health?.());
      }),
    inventory: () => okAsync(createInventorySnapshot()),
    refreshInventory: () =>
      okAsync(
        createReceipt(
          "inventory.refresh",
          "completed",
          "WASM inventory refresh completed.",
        ),
      ),
    gameInventory: (game) =>
      unavailableInWasm(`${game} inventory is unavailable in WASM mode`),
    refreshGameInventory: (game) =>
      unavailableInWasm(`${game} inventory is unavailable in WASM mode`),
    tf2Features: () =>
      unavailableInWasm(
        "TF2 coordinator features are unavailable in WASM mode",
      ),
    cs2Features: () =>
      unavailableInWasm(
        "CS2 coordinator features are unavailable in WASM mode",
      ),
    steamInventoryService: (appId) =>
      unavailableInWasm(
        `Steam Inventory Service AppID ${appId} is unavailable in WASM mode`,
      ),
    steamInventoryServiceGames: () =>
      unavailableInWasm("Steam owned games are unavailable in WASM mode"),
    refreshSteamInventoryService: (appId) =>
      unavailableInWasm(
        `Steam Inventory Service AppID ${appId} is unavailable in WASM mode`,
      ),
    armory: () =>
      okAsync({
        balance: 0,
        generationTime: 0,
        itemIds: [],
        offers: [],
        refreshedAt: new Date().toISOString(),
        status: "requires_connection" as const,
      }),
    marketPreview: () =>
      errAsync({
        message: "Steam Market previews are unavailable in WASM mode",
      }),
    refreshArmory: () =>
      okAsync(
        createReceipt(
          "armory.refresh",
          "failed",
          "WASM mode cannot read live GC Armory state.",
        ),
      ),
    redeemArmory: () =>
      okAsync(
        createReceipt(
          "armory.redeem",
          "blocked_by_feature_flag",
          "WASM mode cannot purchase Armory items.",
        ),
      ),
    store: () =>
      okAsync({
        status: "requires_connection" as const,
        offers: [],
        refreshedAt: new Date().toISOString(),
        message:
          "Store catalogue unavailable in WASM mode. Steam purchases require the connected backend.",
      }),
    refreshStore: () =>
      okAsync(
        createReceipt(
          "store.refresh",
          "requires_connection",
          "Store catalogue unavailable in WASM mode.",
        ),
      ),
    tf2Store: () =>
      okAsync({
        status: "requires_connection" as const,
        offers: [],
        refreshedAt: new Date().toISOString(),
        message: "TF2 Store catalogue requires the connected backend.",
      }),
    refreshTF2Store: () =>
      okAsync(
        createReceipt(
          "tf2.store.refresh",
          "requires_connection",
          "TF2 Store catalogue requires the connected backend.",
        ),
      ),
    initializeTF2StorePurchase: () =>
      okAsync({
        id: "tf2-store-unavailable",
        status: "failed" as const,
        offerId: "",
        defIndex: 0,
        name: "",
        quantity: 1,
        currency: "",
        amountMinor: 0,
        formattedAmount: "",
        createdAt: new Date().toISOString(),
        message: "TF2 Store purchases require the connected backend.",
      }),
    trades: () =>
      requiresConnectionResponse(
        "Steam trades require the connected backend.",
        {
          received: [],
          sent: [],
          history: [],
        },
      ),
    refreshTrades: () =>
      requiresConnectionResponse(
        "Steam trades require the connected backend.",
        {
          received: [],
          sent: [],
          history: [],
        },
      ),
    refreshTradeAccounts: () =>
      okAsync({ accounts: [], refreshedAt: new Date().toISOString() }),
    tradeAccounts: () =>
      okAsync({ accounts: [], refreshedAt: new Date().toISOString() }),
    createTradeOffer: () =>
      okAsync({
        status: "requires_connection" as const,
        message: "Steam trade mutations require the connected backend.",
      }),
    acceptTradeOffer: () =>
      okAsync({
        status: "requires_connection" as const,
        message: "Steam trade mutations require the connected backend.",
      }),
    counterTradeOffer: () =>
      okAsync({
        status: "requires_connection" as const,
        message: "Steam trade mutations require the connected backend.",
      }),
    initializeStorePurchase: () =>
      errAsync({ message: "Steam purchases require the connected backend." }),
    storePurchase: () =>
      errAsync({ message: "Steam purchases require the connected backend." }),
    reconcileStorePurchase: () =>
      errAsync({ message: "Steam purchases require the connected backend." }),
    submitOperation: (_type, _input) =>
      okAsync(
        createReceipt(
          _type,
          "completed",
          "WASM mode accepts the request and returns a placeholder receipt.",
        ),
      ),
    operations: () => okAsync([]),
    events: () => okAsync(createEvents()),
    settings: () => okAsync(defaultWasmSettings),
    steamStatus: () =>
      okAsync(
        createConnectionStatus(
          "disconnected",
          "WASM mode does not connect to Steam.",
        ),
      ),
    connectSteam: () =>
      okAsync(
        createConnectionStatus(
          "connected",
          "WASM mode simulates a connected Steam session.",
        ),
      ),
    startSteamQR: () =>
      okAsync(
        createConnectionStatus(
          "error",
          "QR login is unavailable in WASM mode.",
        ),
      ),
    submitSteamGuard: () =>
      okAsync(
        createConnectionStatus(
          "connected",
          "WASM mode does not require Steam Guard.",
        ),
      ),
    disconnectSteam: () =>
      okAsync(
        createConnectionStatus(
          "disconnected",
          "WASM mode disconnected the simulated session.",
        ),
      ),
    applyNameTag: (input) =>
      okAsync(
        createReceipt(
          "nametags.apply",
          "completed",
          `Applied custom name for ${input.subjectItemId}`,
        ),
      ),
    removeNameTag: (input) =>
      okAsync(
        createReceipt(
          "nametags.remove",
          "completed",
          `Removed custom name for ${input.itemId}`,
        ),
      ),
    deleteItem: (input) =>
      okAsync(
        createReceipt(
          "items.delete",
          "completed",
          `Delete request queued for ${input.itemId}`,
        ),
      ),
    applyStatTrakSwap: (input) =>
      okAsync(
        createReceipt(
          "stattrak.swap",
          "completed",
          `StatTrak swap queued for ${input.item1ItemId}`,
        ),
      ),
    applyStrangePart: (input) =>
      okAsync(
        createReceipt(
          "strange-parts.apply",
          "completed",
          `Strange part request queued for ${input.itemItemId}`,
        ),
      ),
    useItem: (input) =>
      okAsync(
        createReceipt(
          "items.use",
          "completed",
          `Item use queued for ${input.itemId}`,
        ),
      ),
    useMultipleItems: (input) =>
      okAsync(
        createReceipt(
          "items.use-multiple",
          "completed",
          `Batch use queued for ${input.itemIds.join(",")}`,
        ),
      ),
    applyToolToItem: (input) =>
      okAsync(
        createReceipt(
          "tools.apply",
          "completed",
          `Tool application queued for ${input.subjectItemId}`,
        ),
      ),
    applyToolToBaseItem: (input) =>
      okAsync(
        createReceipt(
          "tools.apply-base",
          "completed",
          `Tool application queued for defindex ${input.baseitemDefIndex}`,
        ),
      ),
    giftItem: (input) =>
      okAsync(
        createReceipt(
          "gifts.send",
          "completed",
          `Gift queued for ${input.itemId}`,
        ),
      ),
  };
}
