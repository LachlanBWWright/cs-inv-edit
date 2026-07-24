import { describe, expect, it } from "vitest";
import { steamHostedSaleURL, steamInventoryAssetURL } from "./steam-hosted-selling.js";

describe("steamInventoryAssetURL", () => {
  it("targets an exact owned Steam inventory asset", () => {
    expect(steamInventoryAssetURL("76561198000000000", { appId: 730, contextId: "2", assetId: "123456789" }))
      .toBe("https://steamcommunity.com/profiles/76561198000000000/inventory/#730_2_123456789");
  });

  it("rejects malformed identifiers", () => {
    expect(steamInventoryAssetURL("not-a-steamid", { appId: 730, contextId: "2", assetId: "123" })).toBeUndefined();
    expect(steamInventoryAssetURL("76561198000000000", { appId: 730, contextId: "2/other", assetId: "123" })).toBeUndefined();
  });
});

describe("steamHostedSaleURL", () => {
  const item = { steamId: "76561198000000000", appId: 730, contextId: "2", assetId: "123456789" };

  it("only enables the Steam-hosted handoff for marketable, uncontained items", () => {
    expect(steamHostedSaleURL({ ...item, marketable: true })).toContain("#730_2_123456789");
    expect(steamHostedSaleURL({ ...item, marketable: false })).toBeUndefined();
    expect(steamHostedSaleURL({ ...item, marketable: true, contained: true })).toBeUndefined();
    expect(steamHostedSaleURL({ ...item, steamId: undefined, marketable: true })).toBeUndefined();
  });
});
