import { afterEach, describe, expect, it, vi } from "vitest";
import { createSharedDataClient } from "./shared-data";

describe("createSharedDataClient", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("queries the shared service instead of the local agent route", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: vi.fn().mockResolvedValue({
        currency: "USD",
        items: [{ marketName: "Item", quotes: [] }],
        listings: [],
        errors: [],
        scannedAt: "2026-01-01T00:00:00Z",
        servedAt: "2026-01-01T00:00:01Z",
      }),
    });
    vi.stubGlobal("fetch", fetchMock);

    const result = await createSharedDataClient(
      "https://data.example/",
    ).queryPrices({ marketNames: ["Item"], currency: "USD", appId: 730 });

    expect(result.isOk()).toBe(true);
    expect(fetchMock).toHaveBeenCalledWith(
      "https://data.example/v1/prices/query",
      expect.objectContaining({ method: "POST" }),
    );
  });

  it("rejects malformed shared-service responses", async () => {
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValue({
          ok: true,
          status: 200,
          json: vi.fn().mockResolvedValue({ currency: "USD" }),
        }),
    );

    const result = await createSharedDataClient(
      "https://data.example",
    ).queryPrices({ marketNames: ["Item"], currency: "USD" });

    expect(result.isErr()).toBe(true);
  });
});
