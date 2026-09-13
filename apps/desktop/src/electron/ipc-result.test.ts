import { describe, expect, it } from "vitest";
import { errAsync, okAsync } from "neverthrow";
import { serializeResult } from "./ipc-result.js";

describe("serializeResult", () => {
  it("serializes successful results into a clone-safe envelope", async () => {
    await expect(serializeResult(okAsync({ status: "ready" }))).resolves.toEqual({
      ok: true,
      value: { status: "ready" },
    });
  });

  it("serializes failures without rejecting the IPC promise", async () => {
    const error = { message: "backend unavailable", status: 503 };
    await expect(serializeResult(errAsync(error))).resolves.toEqual({
      ok: false,
      error,
    });
  });
});
