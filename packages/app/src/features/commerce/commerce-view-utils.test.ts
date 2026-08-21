import { describe, expect, it } from "vitest";
import type { ArmorySnapshot, StoreSnapshot } from "@cs-inv-edit/contracts";
import {
  armoryOfferKey,
  filterArmoryOffers,
  filterStoreOffers,
} from "./commerce-view-utils.js";

describe("Armory offer identity", () => {
  it("distinguishes identical redeem IDs from different campaigns", () => {
    expect(armoryOfferKey({ campaignId: 10, redeemId: 7 })).toBe("10:7");
    expect(armoryOfferKey({ campaignId: 11, redeemId: 7 })).toBe("11:7");
  });
});

describe("commerce view filters", () => {
  it("searches, filters, and sorts store offers", () => {
    const offers = [
      {
        id: "b",
        itemLink: "b",
        defIndex: 2,
        name: "Bravo Key",
        category: "Keys",
        currency: "USD",
        amountMinor: 249,
        formattedPrice: "$2.49",
        requiresSupplementalData: false,
        coupon: false,
        purchasable: true,
      },
      {
        id: "a",
        itemLink: "a",
        defIndex: 1,
        name: "Alpha Tool",
        category: "Tools",
        currency: "USD",
        amountMinor: 99,
        formattedPrice: "$0.99",
        requiresSupplementalData: false,
        coupon: false,
        purchasable: true,
      },
    ] satisfies StoreSnapshot["offers"];
    expect(
      filterStoreOffers(offers, {
        query: "key",
        category: "Keys",
        sort: "price-high",
      }).map((offer) => offer.id),
    ).toEqual(["b"]);
    expect(
      filterStoreOffers(offers, {
        query: "",
        category: "",
        sort: "price-low",
      }).map((offer) => offer.id),
    ).toEqual(["a", "b"]);
  });

  it("searches armory contents and sorts by star cost", () => {
    const offers = [
      {
        campaignId: 1,
        redeemId: 2,
        name: "Case",
        expectedCost: 4,
        generationTime: 1,
        items: [{ name: "Red weapon", kind: "weapon_skin" }],
      },
      {
        campaignId: 1,
        redeemId: 1,
        name: "Charm",
        expectedCost: 2,
        generationTime: 1,
        items: [{ name: "Blue charm", kind: "charm" }],
      },
    ] satisfies ArmorySnapshot["offers"];
    expect(
      filterArmoryOffers(offers, {
        query: "blue",
        category: "charm",
        sort: "price-high",
      }).map((offer) => offer.redeemId),
    ).toEqual([1]);
  });
});
