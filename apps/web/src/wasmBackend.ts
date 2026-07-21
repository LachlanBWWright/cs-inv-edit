import type { AppBackendClient } from "@cs-inv-edit/app";
import { createAppError } from "@cs-inv-edit/app";
import { ResultAsync, err, errAsync, fromThrowable, ok, okAsync } from "neverthrow";
import { healthStatusSchema, type ConnectionStatus, type FeatureFlags, type HealthStatus, type InventorySnapshot, type OperationEvent, type OperationReceipt, type SettingsData } from "@cs-inv-edit/contracts";

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

const wasmAssetBasePath = `${(import.meta as ImportMeta & { env: { BASE_URL: string } }).env.BASE_URL.replace(/\/$/, "")}/`;
const wasmAssetPaths = {
  wasm: `${wasmAssetBasePath}wasm/cs2-backend.wasm`,
  loader: `${wasmAssetBasePath}wasm/wasm_exec.js`,
} as const;

const defaultFeatureFlags: FeatureFlags = {
  enableStorageMutations: true,
  enableContainerOpening: true,
  enableInventoryDebug: false,
  showStorageUnitItems: false,
  enableTradeups: false,
  enableStickerExtract: false,
  enableNameTags: true,
  enableItemDeletion: false,
  enableStatTrakSwap: false,
  enableStrangeParts: false,
  enableItemUse: false,
  enableToolApplication: false,
  enableGifting: false,
  enableTf2Inventory: true,
  enableDota2Inventory: false,
  enableSteamInventory: true,
  enableStoreRead: false,
  enableStorePurchases: true,
};

const defaultSettings: SettingsData = {
  backendUrl: window.location.origin,
  validationMode: true,
  sacrificialAccountMode: true,
  featureFlags: defaultFeatureFlags,
  animations: { container: "slot-machine", tradeUp: "slot-machine", armory: "slot-machine" },
  armoryPurchasePacingSeconds: 5,
};

function createReceipt(type: string, state: OperationReceipt["state"], message: string): OperationReceipt {
  return {
    operationId: `wasm-${Math.random().toString(36).slice(2, 10)}`,
    type,
    state,
    createdAt: new Date().toISOString(),
    message,
  };
}

function createConnectionStatus(state: ConnectionStatus["state"], detail: string): ConnectionStatus {
  return { state, detail, diagnostics: [`WASM backend running in ${window.location.origin}`] };
}

function createInventorySnapshot(): InventorySnapshot {
  return {
    items: [],
    refreshedAt: new Date().toISOString(),
    status: "ready",
    message: "WASM backend placeholder: inventory is loaded from the browser runtime.",
  };
}

function createEvents(): OperationEvent[] {
  return [];
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
      return Promise.reject(new Error(`Unable to load ${wasmPath}: ${response.status}`));
    }
    const bytes = await response.arrayBuffer();
    const go = new window.Go();
    const result = await WebAssembly.instantiate(bytes, go.importObject);
    go.run(result.instance);
  }
}

export function createWasmBackendClient(): AppBackendClient {
  let runtimePromise: Promise<void> | undefined;
  const ensureRuntime = () => {
    runtimePromise ??= loadWasmRuntime();
    return runtimePromise;
  };

  return {
    health: () => ResultAsync.fromPromise(ensureRuntime(), (cause) => createAppError("Failed to load WASM runtime", undefined, cause)).map((): HealthStatus => {
      const runtime = window.csInvEditWasmBackend;
      const raw = runtime?.health?.();
      if (raw) {
        const decoded = fromThrowable(JSON.parse, (cause) => createAppError("Invalid WASM health JSON", undefined, cause))(raw)
        .andThen((value) => {
        const parsed = healthStatusSchema.safeParse(value);
        return parsed.success ? ok(parsed.data) : err(createAppError(`Invalid WASM health payload: ${parsed.error.message}`));
        });
        return decoded.match((value) => value, () => ({ status: "error", service: "cs2-wasm-backend", version: "0.0.0", time: new Date().toISOString() }));
      }
      return { status: "ok", service: "cs2-wasm-backend", version: "0.0.0", time: new Date().toISOString() };
    }),
    inventory: () => okAsync(createInventorySnapshot()),
    refreshInventory: () => okAsync(createReceipt("inventory.refresh", "completed", "WASM inventory refresh completed.")),
    gameInventory: (game) => errAsync({ message: `${game} inventory is unavailable in WASM mode` }),
    refreshGameInventory: (game) => errAsync({ message: `${game} inventory is unavailable in WASM mode` }),
    armory: () => okAsync({ balance: 0, generationTime: 0, itemIds: [], offers: [], refreshedAt: new Date().toISOString(), status: "requires_connection" as const }),
    marketPreview: () => errAsync({ message: "Steam Market previews are unavailable in WASM mode" }),
    scanPrices: () => errAsync({ message: "Price scanning is unavailable in WASM mode" }),
    refreshArmory: () => okAsync(createReceipt("armory.refresh", "failed", "WASM mode cannot read live GC Armory state.")),
    redeemArmory: () => okAsync(createReceipt("armory.redeem", "blocked_by_feature_flag", "WASM mode cannot purchase Armory items.")),
    store: () => okAsync({ status: "requires_connection" as const, offers: [], refreshedAt: new Date().toISOString(), message: "Store catalogue unavailable in WASM mode. Steam purchases require the connected backend." }),
    refreshStore: () => okAsync(createReceipt("store.refresh", "requires_connection", "Store catalogue unavailable in WASM mode.")),
    trades: () => okAsync({ status: "requires_connection" as const, received: [], sent: [], history: [], refreshedAt: new Date().toISOString(), message: "Steam trades require the connected backend." }),
    refreshTrades: () => okAsync({ status: "requires_connection" as const, received: [], sent: [], history: [], refreshedAt: new Date().toISOString(), message: "Steam trades require the connected backend." }),
    initializeStorePurchase: () => errAsync({ message: "Steam purchases require the connected backend." }),
    storePurchase: () => errAsync({ message: "Steam purchases require the connected backend." }),
    reconcileStorePurchase: () => errAsync({ message: "Steam purchases require the connected backend." }),
    submitOperation: (_type, _input) => okAsync(createReceipt(_type, "completed", "WASM mode accepts the request and returns a placeholder receipt.")),
    operations: () => okAsync([]),
    events: () => okAsync(createEvents()),
    settings: () => okAsync(defaultSettings),
    steamStatus: () => okAsync(createConnectionStatus("disconnected", "WASM mode does not connect to Steam.")),
    connectSteam: () => okAsync(createConnectionStatus("connected", "WASM mode simulates a connected Steam session.")),
    startSteamQR: () => okAsync(createConnectionStatus("error", "QR login is unavailable in WASM mode.")),
    submitSteamGuard: () => okAsync(createConnectionStatus("connected", "WASM mode does not require Steam Guard.")),
    disconnectSteam: () => okAsync(createConnectionStatus("disconnected", "WASM mode disconnected the simulated session.")),
    applyNameTag: (input) => okAsync(createReceipt("nametags.apply", "completed", `Applied custom name for ${input.subjectItemId}`)),
    removeNameTag: (input) => okAsync(createReceipt("nametags.remove", "completed", `Removed custom name for ${input.itemId}`)),
    deleteItem: (input) => okAsync(createReceipt("items.delete", "completed", `Delete request queued for ${input.itemId}`)),
    applyStatTrakSwap: (input) => okAsync(createReceipt("stattrak.swap", "completed", `StatTrak swap queued for ${input.item1ItemId}`)),
    applyStrangePart: (input) => okAsync(createReceipt("strange-parts.apply", "completed", `Strange part request queued for ${input.itemItemId}`)),
    useItem: (input) => okAsync(createReceipt("items.use", "completed", `Item use queued for ${input.itemId}`)),
    useMultipleItems: (input) => okAsync(createReceipt("items.use-multiple", "completed", `Batch use queued for ${input.itemIds.join(",")}`)),
    applyToolToItem: (input) => okAsync(createReceipt("tools.apply", "completed", `Tool application queued for ${input.subjectItemId}`)),
    applyToolToBaseItem: (input) => okAsync(createReceipt("tools.apply-base", "completed", `Tool application queued for defindex ${input.baseitemDefIndex}`)),
    giftItem: (input) => okAsync(createReceipt("gifts.send", "completed", `Gift queued for ${input.itemId}`)),
  };
}
