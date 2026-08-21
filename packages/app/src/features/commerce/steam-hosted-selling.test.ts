import { describe, expect, it } from "vitest";
import {
  steamHostedSaleUrl,
  steamInventoryAssetUrl,
} from "./steam-hosted-selling.js";

describe("steamInventoryAssetUrl", () => {
  it("targets an exact owned Steam inventory asset", () => {
    expect(
      steamInventoryAssetUrl("76561198000000000", {
        appId: 730,
        contextId: "2",
        assetId: "123456789",
      }),
    ).toBe(
      "https://steamcommunity.com/profiles/76561198000000000/inventory/#730_2_123456789",
    );
  });

  it("rejects malformed identifiers", () => {
    expect(
      steamInventoryAssetUrl("not-a-steamid", {
        appId: 730,
        contextId: "2",
        assetId: "123",
      }),
    ).toBeUndefined();
    expect(
      steamInventoryAssetUrl("76561198000000000", {
        appId: 730,
        contextId: "2/other",
        assetId: "123",
      }),
    ).toBeUndefined();
  });
});

describe("steamHostedSaleUrl", () => {
  const item = {
    steamId: "76561198000000000",
    appId: 730,
    contextId: "2",
    assetId: "123456789",
  };

  it("only enables the Steam-hosted handoff for marketable, uncontained items", () => {
    expect(steamHostedSaleUrl({ ...item, marketable: true })).toContain(
      "#730_2_123456789",
    );
    expect(steamHostedSaleUrl({ ...item, marketable: false })).toBeUndefined();
    expect(
      steamHostedSaleUrl({ ...item, marketable: true, contained: true }),
    ).toBeUndefined();
    expect(
      steamHostedSaleUrl({ ...item, steamId: undefined, marketable: true }),
    ).toBeUndefined();
  });
});
