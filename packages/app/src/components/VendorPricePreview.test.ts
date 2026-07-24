import { describe, expect, it } from "vitest";
import { priceFreshnessLabel, vendorIDsForAppID } from "./VendorPricePreview.js";

describe("vendorIDsForAppID", () => {
  it("keeps CS2-only and TF2-only providers scoped to their game", () => {
    expect(vendorIDsForAppID(730)).toEqual(["steam", "skinport", "csfloat", "waxpeer", "marketcsgo"]);
    expect(vendorIDsForAppID(440)).toEqual(["steam", "skinport", "waxpeer", "backpacktf"]);
    expect(vendorIDsForAppID(570)).toEqual(["steam", "skinport", "marketdota"]);
  });

  it("falls back to Steam for other marketable Steam games", () => {
    expect(vendorIDsForAppID(753)).toEqual(["steam"]);
  });
});

describe("priceFreshnessLabel", () => {
  it("labels stale shared observations", () => {
    const result = { currency: "USD", items: [], listings: [], errors: [], scannedAt: "now", cacheState: "stale" as const };
    expect(priceFreshnessLabel(result)).toBe("Last known prices");
    expect(priceFreshnessLabel({ ...result, cacheState: "fresh" })).toBeUndefined();
  });
});
