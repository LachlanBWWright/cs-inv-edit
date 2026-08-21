import { describe, expect, it } from "vitest";
import {
  priceFreshnessLabel,
  vendorIdsForAppId,
} from "./VendorPricePreview.js";

describe("vendorIdsForAppId", () => {
  it("keeps CS2-only and TF2-only providers scoped to their game", () => {
    expect(vendorIdsForAppId(730)).toEqual([
      "steam",
      "skinport",
      "csfloat",
      "waxpeer",
      "marketcsgo",
    ]);
    expect(vendorIdsForAppId(440)).toEqual([
      "steam",
      "skinport",
      "waxpeer",
      "backpacktf",
    ]);
    expect(vendorIdsForAppId(570)).toEqual(["steam", "skinport", "marketdota"]);
  });

  it("falls back to Steam for other marketable Steam games", () => {
    expect(vendorIdsForAppId(753)).toEqual(["steam"]);
  });
});

describe("priceFreshnessLabel", () => {
  it("labels stale shared observations", () => {
    const result = {
      currency: "USD",
      items: [],
      listings: [],
      errors: [],
      scannedAt: "now",
      cacheState: "stale" as const,
    };
    expect(priceFreshnessLabel(result)).toBe("Last known prices");
    expect(
      priceFreshnessLabel({ ...result, cacheState: "fresh" }),
    ).toBeUndefined();
  });
});
