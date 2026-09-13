import { describe, expect, it } from "vitest";
import { backendInputSchemas } from "./schemas.js";

describe("backend IPC input schemas", () => {
  it("accepts valid mutation payloads", () => {
    expect(
      backendInputSchemas.setItemName.safeParse({
        subjectItemId: "123",
        toolItemId: "456",
        name: "fixture",
      }).success,
    ).toBe(true);
    expect(
      backendInputSchemas.itemId.safeParse({ itemId: "123" }).success,
    ).toBe(true);
    expect(
      backendInputSchemas.nonNegativeInteger.safeParse(0).success,
    ).toBe(true);
  });

  it("rejects malformed or dangerous IPC path arguments", () => {
    expect(backendInputSchemas.textId.safeParse("").success).toBe(false);
    expect(backendInputSchemas.textId.safeParse(null).success).toBe(false);
    expect(backendInputSchemas.nonNegativeInteger.safeParse(-1).success).toBe(false);
    expect(backendInputSchemas.nonNegativeInteger.safeParse(1.5).success).toBe(false);
    expect(backendInputSchemas.itemId.safeParse({ itemId: 123 }).success).toBe(false);
  });

  it("allows optional Steam account IDs to be omitted but validates supplied IDs", () => {
    expect(backendInputSchemas.optionalTextId.safeParse(undefined).success).toBe(true);
    expect(backendInputSchemas.optionalTextId.safeParse("76561198000000000").success).toBe(
      true,
    );
    expect(backendInputSchemas.optionalTextId.safeParse(76561198000000000).success).toBe(
      false,
    );
  });
});
