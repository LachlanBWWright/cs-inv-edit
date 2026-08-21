import { describe, expect, it } from "vitest";
import {
  generateLandingDuration,
  generateLandingJitter,
  LANDING_EDGE_BIAS_EXPONENT,
  landingProgress,
  REVEAL_NOMINAL_DURATION_MS,
  REVEAL_STALL_AFTER_MS,
  waitingVelocity,
} from "./RevealAnimation.js";
import { generateRevealMiss } from "./reveal-animation-random.js";

describe("slot-machine decoy presentation", () => {
  it("preserves fixed variants shared by trade-up candidates and the result", () => {
    expect(
      generateRevealMiss(
        { name: "StatTrak trade-up", kind: "weapon_skin", isStatTrak: true },
        () => 1,
      ),
    ).toMatchObject({ isStatTrak: true, isSouvenir: false });
    expect(
      generateRevealMiss(
        { name: "Souvenir trade-up", kind: "weapon_skin", isSouvenir: true },
        () => 1,
      ),
    ).toMatchObject({ isStatTrak: false, isSouvenir: true });
  });
});

describe("slot-machine landing jitter", () => {
  it("uses a fourth-root distribution to bias landings strongly toward item edges", () => {
    const values = [0.25, 0.0625];
    const jitter = generateLandingJitter(() => values.shift() ?? 0);

    expect(LANDING_EDGE_BIAS_EXPONENT).toBe(1 / 3);
    expect(jitter).toBeCloseTo(-34.92, 2);
    expect(Math.abs(jitter)).toBeGreaterThan(88 * Math.sqrt(0.0625));
  });

  it("can land at either extreme without exceeding the item half-width", () => {
    const leftValues = [0, 1];
    const rightValues = [1, 1];

    expect(generateLandingJitter(() => leftValues.shift() ?? 0)).toBe(-88);
    expect(generateLandingJitter(() => rightValues.shift() ?? 0)).toBe(88);
  });
});

describe("slot-machine landing timing", () => {
  it("decelerates for six seconds and then holds the stalling speed", () => {
    expect(waitingVelocity(0)).toBeCloseTo(2.15);
    expect(waitingVelocity(3_000)).toBeCloseTo((2.15 + 0.62) / 2);
    expect(waitingVelocity(6_000)).toBeCloseTo(0.62);
    expect(waitingVelocity(12_000)).toBeCloseTo(0.62);
  });

  it("targets a ten-second reveal when the result arrives before the stall", () => {
    expect(REVEAL_NOMINAL_DURATION_MS).toBe(10_000);
    expect(generateLandingDuration(0)).toBe(10_000);
    expect(generateLandingDuration(2_000)).toBe(8_000);
    expect(generateLandingDuration(5_999)).toBe(4_001);
  });

  it("reserves four seconds of deceleration after a delayed result", () => {
    expect(REVEAL_STALL_AFTER_MS).toBe(6_000);
    expect(generateLandingDuration(6_000)).toBe(4_000);
    expect(generateLandingDuration(20_000)).toBe(4_000);
  });

  it("brakes visibly as soon as landing starts", () => {
    expect(landingProgress(0)).toBe(0);
    expect(landingProgress(0.25)).toBeCloseTo(0.4375);
    expect(landingProgress(0.5)).toBe(0.75);
    expect(landingProgress(1)).toBe(1);
  });
});
