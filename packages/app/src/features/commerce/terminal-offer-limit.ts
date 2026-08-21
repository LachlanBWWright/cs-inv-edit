// CMsgOpenCrate.points_remaining is uint32. Do not impose a client-side offer
// count that is absent from the GameTracking protobufs and Panorama logic.
const terminalMaximumAdditionalOffers = 0xffff_ffff;

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
