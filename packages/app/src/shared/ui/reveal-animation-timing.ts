const initialSpinPixelsPerMs = 2.15;
const floorSpinPixelsPerMs = 0.62;
const reelItemCenterPx = 88;

export const LANDING_EDGE_BIAS_EXPONENT = 1 / 3;
export const REVEAL_STALL_AFTER_MS = 6_000;
export const REVEAL_NOMINAL_DURATION_MS = 10_000;

export function waitingVelocity(elapsedMs: number) {
  const progress = Math.min(
    1,
    Math.max(0, elapsedMs / REVEAL_STALL_AFTER_MS),
  );
  return (
    initialSpinPixelsPerMs -
    (initialSpinPixelsPerMs - floorSpinPixelsPerMs) * progress
  );
}

export function generateLandingDuration(elapsedMs = 0) {
  return elapsedMs < REVEAL_STALL_AFTER_MS
    ? REVEAL_NOMINAL_DURATION_MS - elapsedMs
    : REVEAL_NOMINAL_DURATION_MS - REVEAL_STALL_AFTER_MS;
}

export function landingProgress(progress: number) {
  const remaining = 1 - Math.min(1, Math.max(0, progress));
  return 1 - remaining * remaining;
}

export function generateLandingJitter(random = Math.random) {
  const direction = random() < 0.5 ? -1 : 1;
  return (
    direction *
    Math.pow(random(), LANDING_EDGE_BIAS_EXPONENT) *
    reelItemCenterPx
  );
}
