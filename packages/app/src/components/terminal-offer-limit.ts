// The GC counter is authoritative. Most terminals expose four alternatives
// after the first offer, while rare terminal sessions can expose as many as
// ten offers in total.
const terminalMaximumAdditionalOffers = 9;

export type TerminalOfferLimit =
  | {
      state: "known";
      additionalOffers: number;
      offersIncludingCurrent: number;
      isLastOffer: boolean;
    }
  | { state: "unknown" };

export function terminalOfferLimit(
  rawPointsRemaining: number | undefined,
): TerminalOfferLimit {
  if (
    rawPointsRemaining === undefined ||
    !Number.isSafeInteger(rawPointsRemaining) ||
    rawPointsRemaining < 0 ||
    rawPointsRemaining > terminalMaximumAdditionalOffers
  ) {
    return { state: "unknown" };
  }
  return {
    state: "known",
    additionalOffers: rawPointsRemaining,
    offersIncludingCurrent: rawPointsRemaining + 1,
    isLastOffer: rawPointsRemaining === 0,
  };
}
