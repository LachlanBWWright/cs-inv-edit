import { describe, expect, it } from "vitest";
import { terminalOfferLimit } from "./terminal-offer-limit.js";

describe("terminalOfferLimit", () => {
  it("reports four alternatives after the first offer", () => {
    expect(terminalOfferLimit(4)).toEqual({
      state: "known",
      additionalOffers: 4,
      offersIncludingCurrent: 5,
      isLastOffer: false,
    });
  });

  it("identifies the final offer", () => {
    expect(terminalOfferLimit(0)).toEqual({
      state: "known",
      additionalOffers: 0,
      offersIncludingCurrent: 1,
      isLastOffer: true,
    });
  });

  it("accepts GC counters without imposing a Panorama-absent offer cap", () => {
    expect(terminalOfferLimit(10)).toMatchObject({
      state: "known",
      additionalOffers: 10,
      offersIncludingCurrent: 11,
    });
  });

  it("rejects counters outside the protobuf uint32 range", () => {
    expect(terminalOfferLimit(0x1_0000_0000)).toEqual({ state: "unknown" });
    expect(terminalOfferLimit(-1)).toEqual({ state: "unknown" });
  });
});
