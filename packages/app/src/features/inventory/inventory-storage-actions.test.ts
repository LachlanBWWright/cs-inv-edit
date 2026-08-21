import { describe, expect, it } from "vitest";
import type { OperationReceipt } from "@cs-inv-edit/contracts";
import { runStorageMutations } from "./inventory-action-handlers.js";

const receipt = (
  operationId: string,
  state: OperationReceipt["state"],
  message?: string,
): OperationReceipt => ({
  operationId,
  type: "storage.move-in",
  state,
  createdAt: "2026-08-13T00:00:00Z",
  message,
});

describe("runStorageMutations", () => {
  it("accepts completed and awaiting-confirmation receipts", async () => {
    const progress: number[] = [];
    const result = await runStorageMutations({
      itemIds: ["one", "two"],
      mutate: (itemId) =>
        Promise.resolve(
          receipt(
            itemId,
            itemId === "one" ? "completed" : "awaiting_gc_confirmation",
          ),
        ),
      failureFallback: "Move failed.",
      onProgress: (completed) => progress.push(completed),
    });

    expect(result).toEqual({ completed: 2, failures: [] });
    expect(progress).toEqual([1, 2]);
  });

  it("retains each rejected item and its actionable message", async () => {
    const result = await runStorageMutations({
      itemIds: ["eligible", "full", "network"],
      mutate: (itemId) => {
        if (itemId === "eligible")
          return Promise.resolve(receipt(itemId, "completed"));
        if (itemId === "full")
          return Promise.resolve(receipt(itemId, "failed", "Storage unit is full."));
        return Promise.reject(new Error("Connection closed."));
      },
      failureFallback: "Move failed.",
      onProgress: () => undefined,
    });

    expect(result.completed).toBe(1);
    expect(result.failures).toEqual([
      { itemId: "full", message: "Storage unit is full." },
      { itemId: "network", message: "Connection closed." },
    ]);
  });
});
