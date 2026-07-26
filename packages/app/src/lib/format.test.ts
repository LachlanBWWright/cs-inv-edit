import { describe, expect, it } from "vitest";
import { formatItemId, formatState, formatTimestamp } from "./format";

describe("formatTimestamp", () => {
  it("returns a localized string for valid timestamps", () => {
    expect(formatTimestamp("2024-01-02T03:04:05.000Z")).toContain("2024");
  });

  it("returns the original value for invalid timestamps", () => {
    expect(formatTimestamp("not-a-date")).toBe("not-a-date");
  });
});

describe("formatItemId", () => {
  it("shortens long identifiers", () => {
    expect(formatItemId("12345678901234567890")).toBe("123456789012…7890");
  });

  it("leaves short identifiers unchanged", () => {
    expect(formatItemId("1234")).toBe("1234");
  });
});

describe("formatState", () => {
  it("replaces underscores with spaces", () => {
    expect(formatState("awaiting_gc_confirmation")).toBe(
      "awaiting gc confirmation",
    );
  });
});
