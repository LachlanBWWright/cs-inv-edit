import { describe, expect, it } from "vitest";
import { swapScreenshotUrl } from "./cs2-screenshot.js";

describe("swapScreenshotUrl", () => {
  it("deep-links a validated CS2 inspect URI into the screenshot generator", () => {
    const inspectUrl =
      "steam://rungame/730/76561202255233023/+csgo_econ_action_preview%20S76561198000000000A123D456";
    expect(swapScreenshotUrl(inspectUrl)).toBe(
      `https://swap.gg/cs2-inspects?inspectLink=${encodeURIComponent(inspectUrl)}`,
    );
  });

  it("supports Steam's masked run-form inspect URI", () => {
    const inspectUrl =
      "steam://run/730//+csgo_econ_action_preview%205444E780C4F99155";
    expect(swapScreenshotUrl(inspectUrl)).toBe(
      `https://swap.gg/cs2-inspects?inspectLink=${encodeURIComponent(inspectUrl)}`,
    );
  });

  it("rejects missing and unrelated links", () => {
    expect(swapScreenshotUrl(undefined)).toBeUndefined();
    expect(swapScreenshotUrl("https://example.com/item")).toBeUndefined();
    expect(swapScreenshotUrl("steam://rungame/440/other")).toBeUndefined();
  });
});
