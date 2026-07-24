import { describe, expect, it } from "vitest";
import { swapScreenshotURL } from "./cs2-screenshot.js";

describe("swapScreenshotURL", () => {
  it("deep-links a validated CS2 inspect URI into the screenshot generator", () => {
    const inspectURL = "steam://rungame/730/76561202255233023/+csgo_econ_action_preview%20S76561198000000000A123D456";
    expect(swapScreenshotURL(inspectURL)).toBe(`https://swap.gg/cs2-inspects?inspectLink=${encodeURIComponent(inspectURL)}`);
  });

  it("rejects missing and unrelated links", () => {
    expect(swapScreenshotURL(undefined)).toBeUndefined();
    expect(swapScreenshotURL("https://example.com/item")).toBeUndefined();
    expect(swapScreenshotURL("steam://rungame/440/other")).toBeUndefined();
  });
});
