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
      vi.fn().mockResolvedValue({
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

  it("encodes market history parameters and applies the default app ID", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: false,
      status: 404,
      statusText: "Not Found",
      text: vi.fn().mockResolvedValue("missing fixture"),
    });
    vi.stubGlobal("fetch", fetchMock);

    await createSharedDataClient("https://data.example/").priceHistory(
      "AK-47 | Redline",
      "USD",
    );

    expect(fetchMock).toHaveBeenCalledWith(
      "https://data.example/v1/prices/history?marketName=AK-47%20%7C%20Redline&currency=USD&appId=730",
      undefined,
    );
  });

  it("encodes search queries and preserves an explicit app ID", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: false,
      status: 404,
      statusText: "Not Found",
      text: vi.fn().mockResolvedValue("missing fixture"),
    });
    vi.stubGlobal("fetch", fetchMock);

    await createSharedDataClient("https://data.example").searchPrices(
      "Mann Co. & Sons",
      440,
    );

    expect(fetchMock).toHaveBeenCalledWith(
      "https://data.example/v1/prices/search?query=Mann%20Co.%20%26%20Sons&appId=440&limit=24",
      undefined,
    );
  });
});
