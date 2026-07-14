import { afterEach, describe, expect, it, vi } from "vitest";
import { requestJsonResult } from "./result-http";
import { z } from "zod";

const healthTestSchema = z.object({ status: z.string() });

describe("requestJsonResult", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("returns a success result for valid JSON payloads", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: vi.fn().mockResolvedValue({ status: "ok" }),
      }),
    );

    const result = await requestJsonResult("https://example.test", "/health", healthTestSchema);

    expect(result.isOk()).toBe(true);
    if (result.isOk()) {
      expect(result.value).toEqual({ status: "ok" });
    }
  });

  it("returns an error result for non-ok responses", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: false,
        status: 503,
        statusText: "Service Unavailable",
        text: vi.fn().mockResolvedValue("Steam unavailable"),
      }),
    );

    const result = await requestJsonResult("https://example.test", "/health", healthTestSchema);

    expect(result.isOk()).toBe(false);
    if (result.isErr()) {
      expect(result.error.message).toContain("503");
      expect(result.error.message).toContain("Steam unavailable");
    }
  });

  it("includes JSON error bodies for non-ok responses", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: false,
        status: 400,
        statusText: "Bad Request",
        text: vi.fn().mockResolvedValue(JSON.stringify({ error: "Steam Guard failed" })),
      }),
    );

    const result = await requestJsonResult("https://example.test", "/steam/guard", healthTestSchema);

    expect(result.isOk()).toBe(false);
    if (result.isErr()) {
      expect(result.error.message).toContain("Steam Guard failed");
    }
  });

  it("returns an error when successful JSON fails runtime validation", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, status: 200, json: vi.fn().mockResolvedValue({ status: null }) }));
    const result = await requestJsonResult("https://example.test", "/health", healthTestSchema);
    expect(result.isErr()).toBe(true);
    if (result.isErr()) expect(result.error.message).toContain("Invalid response payload");
  });
});
