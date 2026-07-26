import { describe, expect, it } from "vitest";
import {
  generateLandingDuration,
  generateLandingJitter,
  LANDING_EDGE_BIAS_EXPONENT,
  landingProgress,
} from "./RevealAnimation.js";

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
  it("randomizes the deceleration after the result becomes available", () => {
    expect(generateLandingDuration(() => 0)).toBe(2_400);
    expect(generateLandingDuration(() => 0.5)).toBe(3_000);
    expect(generateLandingDuration(() => 0.999)).toBe(3_598);
  });

  it("does not derive landing time from how long the waiting floor was active", () => {
    const duration = generateLandingDuration(() => 0.25);
    expect(duration).toBe(2_700);
  });

  it("brakes visibly as soon as landing starts", () => {
    expect(landingProgress(0)).toBe(0);
    expect(landingProgress(0.25)).toBeCloseTo(0.578);
    expect(landingProgress(0.5)).toBe(0.875);
    expect(landingProgress(1)).toBe(1);
  });
});
