import type { AppBackendClient } from "@cs-inv-edit/app";
import type { ConnectionStatus, FeatureFlags, HealthStatus, InventorySnapshot, OperationEvent, OperationReceipt, SettingsData } from "@cs-inv-edit/contracts";

declare global {
  interface Window {
    Go: new () => {
      importObject: WebAssembly.ImportObject;
      run: (instance: WebAssembly.Instance) => void;
    };
    csInvEditWasmBackend?: {
      health?: () => string;
    };
  }
}

const defaultFeatureFlags: FeatureFlags = {
  enableStorageMutations: true,
  enableContainerOpening: true,
  enableInventoryDebug: false,
  enableTradeups: false,
  enableStickerExtract: false,
  enableNameTags: true,
  enableItemDeletion: false,
  enableStatTrakSwap: false,
  enableStrangeParts: false,
  enableItemUse: false,
  enableToolApplication: false,
  enableGifting: false,
};

const defaultSettings: SettingsData = {
  backendUrl: window.location.origin,
  validationMode: true,
  sacrificialAccountMode: true,
  featureFlags: defaultFeatureFlags,
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
  const wasmPath = "/wasm/cs2-backend.wasm";
  const loaderPath = "/wasm/wasm_exec.js";

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
    health: async (): Promise<HealthStatus> => {
      await ensureRuntime();
      const runtime = window.csInvEditWasmBackend;
      const raw = runtime?.health?.();
      if (raw) {
        return JSON.parse(raw) as HealthStatus;
      }
      return { status: "ok", service: "cs2-wasm-backend", version: "0.0.0", time: new Date().toISOString() };
    },
    inventory: async () => createInventorySnapshot(),
    refreshInventory: async () => createReceipt("inventory.refresh", "completed", "WASM inventory refresh completed."),
    submitOperation: async (_type, _input) => createReceipt(_type, "completed", "WASM mode accepts the request and returns a placeholder receipt."),
    operations: async () => [],
    events: async () => createEvents(),
    settings: async () => defaultSettings,
    steamStatus: async () => createConnectionStatus("disconnected", "WASM mode does not connect to Steam."),
    connectSteam: async () => createConnectionStatus("connected", "WASM mode simulates a connected Steam session."),
    submitSteamGuard: async () => createConnectionStatus("connected", "WASM mode does not require Steam Guard."),
    disconnectSteam: async () => createConnectionStatus("disconnected", "WASM mode disconnected the simulated session."),
    applyNameTag: async (input) => createReceipt("nametags.apply", "completed", `Applied custom name for ${input.subjectItemId}`),
    removeNameTag: async (input) => createReceipt("nametags.remove", "completed", `Removed custom name for ${input.itemId}`),
    deleteItem: async (input) => createReceipt("items.delete", "completed", `Delete request queued for ${input.itemId}`),
    applyStatTrakSwap: async (input) => createReceipt("stattrak.swap", "completed", `StatTrak swap queued for ${input.item1ItemId}`),
    applyStrangePart: async (input) => createReceipt("strange-parts.apply", "completed", `Strange part request queued for ${input.itemItemId}`),
    useItem: async (input) => createReceipt("items.use", "completed", `Item use queued for ${input.itemId}`),
    useMultipleItems: async (input) => createReceipt("items.use-multiple", "completed", `Batch use queued for ${input.itemIds.join(",")}`),
    applyToolToItem: async (input) => createReceipt("tools.apply", "completed", `Tool application queued for ${input.subjectItemId}`),
    applyToolToBaseItem: async (input) => createReceipt("tools.apply-base", "completed", `Tool application queued for defindex ${input.baseitemDefIndex}`),
    giftItem: async (input) => createReceipt("gifts.send", "completed", `Gift queued for ${input.itemId}`),
  };
}
