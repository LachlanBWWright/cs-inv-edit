import type {
  ConnectionStatus,
  InventorySnapshot,
  OperationEvent,
  OperationReceipt,
} from "@cs-inv-edit/contracts";

export function createWasmReceipt(
  type: string,
  state: OperationReceipt["state"],
  message: string,
): OperationReceipt {
  return {
    operationId: `wasm-${Math.random().toString(36).slice(2, 10)}`,
    type,
    state,
    createdAt: new Date().toISOString(),
    message,
  };
}

export function createWasmConnectionStatus(
  state: ConnectionStatus["state"],
  detail: string,
): ConnectionStatus {
  return {
    state,
    detail,
    diagnostics: [`WASM backend running in ${window.location.origin}`],
  };
}

export function createWasmInventorySnapshot(): InventorySnapshot {
  return {
    items: [],
    refreshedAt: new Date().toISOString(),
    status: "ready",
    message:
      "WASM backend placeholder: inventory is loaded from the browser runtime.",
  };
}

export function createWasmEvents(): OperationEvent[] {
  return [];
}
