import { afterEach, describe, expect, it, vi } from "vitest";
import { postJsonResult, requestJsonResult } from "./result-http";
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

    const result = await requestJsonResult(
      "https://example.test",
      "/health",
      healthTestSchema,
    );

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

    const result = await requestJsonResult(
      "https://example.test",
      "/health",
      healthTestSchema,
    );

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
        text: vi
          .fn()
          .mockResolvedValue(JSON.stringify({ error: "Steam Guard failed" })),
      }),
    );

    const result = await requestJsonResult(
      "https://example.test",
      "/steam/guard",
      healthTestSchema,
    );

    expect(result.isOk()).toBe(false);
    if (result.isErr()) {
      expect(result.error.message).toContain("Steam Guard failed");
    }
  });

  it("returns an error when successful JSON fails runtime validation", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: vi.fn().mockResolvedValue({ status: null }),
      }),
    );
    const result = await requestJsonResult(
      "https://example.test",
      "/health",
      healthTestSchema,
    );
    expect(result.isErr()).toBe(true);
    if (result.isErr())
      expect(result.error.message).toContain("Invalid response payload");
  });

  it("converts fetch rejection into an error result", async () => {
    const networkError = new Error("offline");
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(networkError));

    const result = await requestJsonResult(
      "https://example.test",
      "/health",
      healthTestSchema,
    );

    expect(result.isErr()).toBe(true);
    if (result.isErr()) {
      expect(result.error.message).toContain("Request failed");
      expect(result.error.cause).toBe(networkError);
    }
  });

  it("returns a parse error when a successful response is not JSON", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: vi.fn().mockRejectedValue(new SyntaxError("unexpected token")),
      }),
    );

    const result = await requestJsonResult(
      "https://example.test",
      "/health",
      healthTestSchema,
    );

    expect(result.isErr()).toBe(true);
    if (result.isErr())
      expect(result.error.message).toContain("Failed to parse JSON");
  });

  it("preserves plain-text error bodies without parsing them as JSON", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: false,
        status: 502,
        statusText: "Bad Gateway",
        text: vi.fn().mockResolvedValue("upstream unavailable"),
      }),
    );

    const result = await requestJsonResult(
      "https://example.test",
      "/health",
      healthTestSchema,
    );

    expect(result.isErr()).toBe(true);
    if (result.isErr()) {
      expect(result.error.status).toBe(502);
      expect(result.error.message).toContain("upstream unavailable");
    }
  });

  it("sends JSON POST requests with a default empty object", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: vi.fn().mockResolvedValue({ status: "ok" }),
    });
    vi.stubGlobal("fetch", fetchMock);

    const result = await postJsonResult(
      "https://example.test",
      "/operation",
      healthTestSchema,
    );

    expect(result.isOk()).toBe(true);
    expect(fetchMock).toHaveBeenCalledWith(
      "https://example.test/operation",
      expect.objectContaining({
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: "{}",
      }),
    );
  });
});
