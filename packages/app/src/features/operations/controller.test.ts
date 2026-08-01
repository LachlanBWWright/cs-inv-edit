import { describe, expect, it, vi } from "vitest";
import { errAsync, okAsync } from "neverthrow";
import { createOperationsController } from "./controller.js";
import type { AppBackendClient } from "../../lib/backend.js";
import type { AppError } from "../../lib/result-http.js";
import type { OperationReceipt } from "@cs-inv-edit/contracts";

describe("createOperationsController", () => {
  it("settles successful receipts and refreshes inventory and operation state", async () => {
    const refreshInventory = vi.fn(() => okAsync(undefined));
    const refetchOperations = vi.fn(() => Promise.resolve(undefined));
    const refetchEvents = vi.fn(() => Promise.resolve(undefined));
    const backend = {
      refreshInventory: vi.fn(() => okAsync(undefined)),
    } as unknown as AppBackendClient;

    const controller = createOperationsController({
      backend,
      refreshInventory,
      refetchOperations,
      refetchEvents,
    });

    const receipt: OperationReceipt = {
      operationId: "op-1",
      type: "inventory.rename",
      state: "completed",
      createdAt: new Date().toISOString(),
      message: "Renamed",
    };

    const settled = await controller.settleOperation(okAsync(receipt));

    expect(settled).toMatchObject({ operationId: "op-1", state: "completed" });
    expect(refreshInventory).toHaveBeenCalledTimes(1);
    expect(refetchOperations).toHaveBeenCalledTimes(1);
    expect(refetchEvents).toHaveBeenCalledTimes(1);
  });

  it("returns a failed fallback receipt for a backend error", async () => {
    const backend = {
      refreshInventory: vi.fn(() => okAsync(undefined)),
    } as unknown as AppBackendClient;
    const error = { message: "boom" } as AppError;

    const controller = createOperationsController({
      backend,
      refreshInventory: () => errAsync(error),
      refetchOperations: () => Promise.resolve(undefined),
      refetchEvents: () => Promise.resolve(undefined),
    });

    const failed = await controller.settleOperation(errAsync(error));

    expect(failed.state).toBe("failed");
  });

  it("returns terminal receipts and transport failures to the caller", async () => {
    const error = { message: "terminal request failed" } as AppError;
    const controller = createOperationsController({
      backend: {} as AppBackendClient,
      refreshInventory: () => okAsync(undefined),
      refetchOperations: () => Promise.resolve(undefined),
      refetchEvents: () => Promise.resolve(undefined),
    });

    const terminal = await controller.settleOperation(
      okAsync({
        operationId: "terminal-load",
        type: "terminal.load-offer",
        state: "awaiting_gc_confirmation",
        createdAt: new Date().toISOString(),
        message: "Loading terminal offer",
      }),
      { suppressToast: true },
    );
    const failed = await controller.settleOperation(errAsync(error), {
      suppressToast: true,
    });

    expect(terminal.state).toBe("awaiting_gc_confirmation");
    expect(failed).toMatchObject({ state: "failed", message: error.message });
  });
});
