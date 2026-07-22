import { describe, expect, it } from "vitest";
import { generateLandingJitter, LANDING_EDGE_BIAS_EXPONENT } from "./RevealAnimation.js";

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
