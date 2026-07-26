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

  it("supports rare ten-offer terminal sessions", () => {
    expect(terminalOfferLimit(9)).toMatchObject({
      state: "known",
      additionalOffers: 9,
      offersIncludingCurrent: 10,
    });
  });

  it("rejects counters beyond the terminal protocol limit", () => {
    expect(terminalOfferLimit(10)).toEqual({ state: "unknown" });
    expect(terminalOfferLimit(0xfffffffb)).toEqual({ state: "unknown" });
  });
});
