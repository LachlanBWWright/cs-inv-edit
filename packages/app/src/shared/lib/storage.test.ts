import { afterEach, describe, expect, it, vi } from "vitest";
import {
  readStoredJson,
  stringArraySchema,
  writeStoredJson,
} from "./storage.js";

function installStorage(initial: Record<string, string> = {}) {
  const values = new Map(Object.entries(initial));
  const storage = {
    getItem: vi.fn((key: string) => values.get(key) ?? null),
    setItem: vi.fn((key: string, value: string) => values.set(key, value)),
  };
  vi.stubGlobal("localStorage", storage);
  return storage;
}

afterEach(() => vi.unstubAllGlobals());

describe("local storage boundary", () => {
  it("round-trips valid JSON through the schema boundary", () => {
    installStorage();

    expect(writeStoredJson("accounts", ["one", "two"]).isOk()).toBe(true);
    const result = readStoredJson("accounts", stringArraySchema);
    expect(result.isOk()).toBe(true);
    if (result.isOk()) expect(result.value).toEqual(["one", "two"]);
  });

  it("returns a typed error when the key is missing", () => {
    installStorage();

    const result = readStoredJson("missing", stringArraySchema);
    expect(result.isErr()).toBe(true);
    if (result.isErr())
      expect(result.error.message).toBe("Stored value does not exist");
  });

  it("rejects malformed stored JSON", () => {
    installStorage({ accounts: "not-json" });

    const result = readStoredJson("accounts", stringArraySchema);
    expect(result.isErr()).toBe(true);
    if (result.isErr())
      expect(result.error.message).toBe("Stored JSON is invalid");
  });

  it("rejects JSON with the wrong shape", () => {
    installStorage({ accounts: JSON.stringify({ account: "one" }) });

    const result = readStoredJson("accounts", stringArraySchema);
    expect(result.isErr()).toBe(true);
    if (result.isErr())
      expect(result.error.message).toBe("Stored value has an invalid shape");
  });

});
