import { describe, expect, it } from "vitest";
import { containerOpeningUsesReveal } from "./inventory-open-container.js";

describe("container reveal animation", () => {
  it("plays configured animations for ordinary containers as well as terminals", () => {
    expect(containerOpeningUsesReveal("slot-machine")).toBe(true);
    expect(containerOpeningUsesReveal("countdown")).toBe(true);
  });

  it("does not create a reveal when animations are disabled", () => {
    expect(containerOpeningUsesReveal("none")).toBe(false);
  });
});
