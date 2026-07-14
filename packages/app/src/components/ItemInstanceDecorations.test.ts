import { describe, expect, it } from "vitest";
import { formatFloat, hasSkinWearFloat } from "./item-instance-utils.js";

describe("skin wear float", () => {
  it("shows decoded paint wear for weapon skins, including a zero float", () => {
    expect(hasSkinWearFloat({ kind: "weapon_skin", paintWear: 0.06712345 })).toBe(true);
    expect(hasSkinWearFloat({ kind: "weapon_skin", paintWear: 0 })).toBe(true);
    expect(formatFloat(0.06712345)).toBe("0.06712345");
  });

  it("does not show a float for non-skins or skins without decoded paint wear", () => {
    expect(hasSkinWearFloat({ kind: "sticker_item", paintWear: 0.1 })).toBe(false);
    expect(hasSkinWearFloat({ kind: "weapon_skin" })).toBe(false);
  });
});
