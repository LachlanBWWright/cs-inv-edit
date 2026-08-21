import { describe, expect, it, vi } from "vitest";
import { createOperationApi } from "./api";
import type { AppBackendClient } from "./backend";
import { createOperationBackendStub } from "./api.test-support.js";

describe("createOperationApi", () => {
  it("routes operation methods to the supplied backend client", async () => {
    const receipt = {
      operationId: "op-1",
      type: "name-tag",
      state: "completed",
      createdAt: "2024-01-01T00:00:00.000Z",
    } as const;

    const backend: Pick<AppBackendClient, "applyNameTag" | "removeNameTag"> = {
      applyNameTag: vi.fn().mockResolvedValue(receipt),
      removeNameTag: vi.fn().mockResolvedValue(receipt),
    };

    const api = createOperationApi(createOperationBackendStub(backend));

    await expect(
      api.applyNameTag({ subjectItemId: "1", toolItemId: "2", name: "demo" }),
    ).resolves.toEqual(receipt);
    await expect(api.removeNameTag({ itemId: "1" })).resolves.toEqual(receipt);
  });
});
